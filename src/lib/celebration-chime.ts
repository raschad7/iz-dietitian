/**
 * The "you did it" sound for a completed day — `public/sounds/celebration-woo.mp3`,
 * a short cartoon "woo" cue. Falls back to a synthesised arpeggio (three
 * oscillators, no asset) if the file cannot play for any reason — a missing
 * file, a decode error, or a browser that blocks it outright — so a claim
 * still gets *some* sound rather than silence over a single point of failure.
 *
 * Call sites are expected to trigger this from the same tick that responded
 * to a user gesture (a meal being checked off, here) — browsers generally
 * still allow audio started synchronously out of that gesture's own render
 * pass, but never guarantee it, so every failure here is silent rather than
 * thrown. A blocked chime costs nothing; a thrown one would break the
 * celebration it was meant to accompany.
 */

const CELEBRATION_SOUND_SRC = '/sounds/dragon-studio-wow-423653.mp3';
 
/** Loud enough to read as a cue, quiet enough not to startle at claim time. */
const CELEBRATION_VOLUME = 0.55;

/** Frequencies of a bright major-triad-plus-octave arpeggio, in Hz (C6, E6, G6, C7). */
const NOTES_HZ = [1046.5, 1318.5, 1568, 2093];

/** Gap between each note's own onset. */
const NOTE_STAGGER_S = 0.07;

/** How long each note rings before its gain reaches zero. */
const NOTE_DECAY_S = 0.32;

let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  sharedContext ??= new Ctor();
  return sharedContext;
}

/** The fallback: three oscillators and a gain envelope, drawn entirely in code — see the module doc for when this runs. */
function playSynthesizedChime(): void {
  try {
    const context = getAudioContext();
    if (!context) return;

    // A context created (or left) suspended — most browsers start it that
    // way until a gesture resumes it — has to be woken before any oscillator
    // scheduled against its clock will actually sound.
    if (context.state === 'suspended') void context.resume();

    const now = context.currentTime;

    NOTES_HZ.forEach((frequency, index) => {
      const start = now + index * NOTE_STAGGER_S;

      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;

      const gain = context.createGain();
      // A fast attack and an exponential decay — a plucked, bell-like note
      // rather than a synth pad. `0.0001` rather than `0`: `exponentialRampToValueAtTime`
      // cannot ramp to exactly zero.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + NOTE_DECAY_S);

      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + NOTE_DECAY_S + 0.05);
    });
  } catch {
    // No sound at all this time — see the module doc above.
  }
}

export function playCelebrationChime(): void {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return;

  try {
    // A fresh element per call rather than one shared, reset instance: two
    // claims landing close together (unlikely, but this fires off a render-
    // time edge, not a debounced click) should each get their own "woo"
    // instead of the second cutting the first off mid-play.
    const audio = new Audio(CELEBRATION_SOUND_SRC);
    audio.volume = CELEBRATION_VOLUME;

    // `play()` rejects — rather than throwing synchronously — for a blocked
    // autoplay policy, a 404, or a decode failure, so the fallback is wired
    // to the rejection, not a `catch` around the call itself.
    audio.play().catch(() => playSynthesizedChime());
  } catch {
    playSynthesizedChime();
  }
}
