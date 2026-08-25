/**
 * The tick's own sound: a real recorded water-drip for marking a meal eaten.
 *
 * `TodayEnergyMascot` draws the day's progress as a wave rising inside the
 * mark (`today-energy-mascot.tsx`); this is that same idea in the other
 * channel — checking a meal reads as one measure of liquid going in, not a
 * generic UI "tap" click.
 *
 * `public/sounds/freesound_community-water-drip-45622.mp3` plays first;
 * `scheduleFill` below — a bandpass-swept noise burst for the pour and a
 * short sine for the droplet meeting the surface, both synthesized — is the
 * fallback if the file cannot play for any reason (missing, a decode error,
 * a browser that blocks it), same pattern as `celebration-chime.ts`.
 *
 * Fires from `MealCheck`'s own click handler, so this always runs inside the
 * user gesture that triggered it — the one guarantee browsers make about
 * unblocked audio. Every failure here is swallowed rather than thrown: a
 * blocked or missing sound costs nothing, but breaking the tick itself over
 * an audio glitch would.
 */

const FILL_SOUND_SRC = '/sounds/freesound_community-water-drip-45622.mp3';

/** Loud enough to read as a cue, quiet enough not to startle on a tick that can fire several times in a row. */
const FILL_VOLUME = 0.45;

/** Seconds. Long enough to read as a pour, short enough to clear the next tap. */
const FILL_DURATION_S = 0.3;

/** Hz. The bandpass sweeps from a dull, empty-container start to a brighter, near-full end. */
const FILTER_START_HZ = 280;
const FILTER_END_HZ = 1800;

/** The pour's own peak level, before the shared gain node's ramp. */
const POUR_VOLUME = 0.32;

/** Where in the pour the landing droplet lands, as a fraction of `FILL_DURATION_S`. */
const DROPLET_AT_FRACTION = 0.62;
const DROPLET_VOLUME = 0.22;

let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  sharedContext ??= new Ctor();
  return sharedContext;
}

/** A noise buffer the length of the pour — white noise, shaped by the bandpass sweep below into the sound of liquid moving rather than static. */
function createNoiseBuffer(context: AudioContext): AudioBuffer {
  const length = Math.max(1, Math.floor(context.sampleRate * FILL_DURATION_S));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * The fallback only — see the module doc. A bandpass-swept noise burst for
 * the pour and a short sine landing on top of it for the droplet, drawn
 * entirely in code since it only ever runs when the real file above could
 * not.
 */
function scheduleFill(context: AudioContext, out: AudioNode): void {
  const now = context.currentTime;

  // The pour: filtered noise, its passband climbing as though the rising
  // liquid were shortening the air column above it — the same pitch-rise a
  // glass actually makes while it fills.
  const noise = context.createBufferSource();
  noise.buffer = createNoiseBuffer(context);

  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 5;
  filter.frequency.setValueAtTime(FILTER_START_HZ, now);
  filter.frequency.exponentialRampToValueAtTime(FILTER_END_HZ, now + FILL_DURATION_S);

  const pourGain = context.createGain();
  pourGain.gain.setValueAtTime(0.0001, now);
  pourGain.gain.exponentialRampToValueAtTime(POUR_VOLUME, now + 0.05);
  pourGain.gain.exponentialRampToValueAtTime(0.0001, now + FILL_DURATION_S);

  noise.connect(filter).connect(pourGain).connect(out);
  noise.start(now);
  noise.stop(now + FILL_DURATION_S + 0.02);

  // The droplet: one short sine, its pitch stepping up — the "glug" of the
  // last of it landing once the container is nearly full.
  const dropletAt = now + FILL_DURATION_S * DROPLET_AT_FRACTION;

  const droplet = context.createOscillator();
  droplet.type = 'sine';
  droplet.frequency.setValueAtTime(220, dropletAt);
  droplet.frequency.exponentialRampToValueAtTime(440, dropletAt + 0.09);

  const dropletGain = context.createGain();
  dropletGain.gain.setValueAtTime(0.0001, dropletAt);
  dropletGain.gain.exponentialRampToValueAtTime(DROPLET_VOLUME, dropletAt + 0.02);
  dropletGain.gain.exponentialRampToValueAtTime(0.0001, dropletAt + 0.16);

  droplet.connect(dropletGain).connect(out);
  droplet.start(dropletAt);
  droplet.stop(dropletAt + 0.18);
}

function playSynthesizedFill(): void {
  try {
    const context = getAudioContext();
    if (!context) return;

    // A context created (or left) suspended — most browsers start it that way
    // until a gesture resumes it — has to be woken before anything scheduled
    // against its clock will actually sound. The click that calls this is
    // that gesture.
    if (context.state === 'suspended') void context.resume();

    scheduleFill(context, context.destination);
  } catch {
    // No sound this time — see the module doc above.
  }
}

export function playMealFillSound(): void {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') {
    playSynthesizedFill();
    return;
  }

  try {
    // A fresh element per call, same reasoning as `celebration-chime.ts`:
    // two ticks landing close together should each get their own drip
    // instead of the second cutting the first off mid-play.
    const audio = new Audio(FILL_SOUND_SRC);
    audio.volume = FILL_VOLUME;

    // `play()` rejects — rather than throwing synchronously — for a blocked
    // autoplay policy, a 404, or a decode failure, so the fallback is wired
    // to the rejection, not a `catch` around the call itself.
    audio.play().catch(() => playSynthesizedFill());
  } catch {
    playSynthesizedFill();
  }
}
