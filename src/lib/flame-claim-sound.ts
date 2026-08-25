/**
 * The claim button's own sound — `public/sounds/vadim_makes_sound-achievement-badge-pop-sound-2-547865.mp3`,
 * a bright achievement "pop", played the instant the client presses the
 * flame-celebration dialog's claim button (`handleClaim` in
 * `today-flame-celebration.tsx`). Distinct from `playCelebrationChime`, which
 * fires earlier, on the dialog's own open — that one announces the day is
 * done; this one rewards the tap that actually banks the streak.
 *
 * Falls back to a synthesised two-note "pop" (no asset) if the file cannot
 * play for any reason, same reasoning as `celebration-chime.ts` and
 * `meal-fill-sound.ts`: a blocked or missing sound costs nothing, but
 * breaking the claim flight itself over an audio glitch would.
 */

const CLAIM_SOUND_SRC = '/sounds/vadim_makes_sound-achievement-badge-pop-sound-2-547865.mp3';

/** Loud enough to read as a reward, quiet enough not to startle at claim time. */
const CLAIM_VOLUME = 0.55;

let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  sharedContext ??= new Ctor();
  return sharedContext;
}

/** The fallback: two quick rising notes, drawn entirely in code — see the module doc for when this runs. */
function playSynthesizedPop(): void {
  try {
    const context = getAudioContext();
    if (!context) return;

    if (context.state === 'suspended') void context.resume();

    const now = context.currentTime;
    const notes = [{ freq: 880, at: 0 }, { freq: 1318.5, at: 0.08 }];

    notes.forEach(({ freq, at }) => {
      const start = now + at;

      const oscillator = context.createOscillator();
      oscillator.type = 'triangle';
      oscillator.frequency.value = freq;

      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.28, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);

      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.25);
    });
  } catch {
    // No sound at all this time — see the module doc above.
  }
}

export function playFlameClaimSound(): void {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') {
    playSynthesizedPop();
    return;
  }

  try {
    const audio = new Audio(CLAIM_SOUND_SRC);
    audio.volume = CLAIM_VOLUME;
    audio.play().catch(() => playSynthesizedPop());
  } catch {
    playSynthesizedPop();
  }
}
