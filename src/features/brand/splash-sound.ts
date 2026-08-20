/**
 * The splash screen's three landings, as sound.
 *
 * `SplashScreen` draws a mark that hops up the screen and lands three times.
 * This module is the noise those landings make: three short, round blips
 * climbing a major triad, so the pitch rises with the figure and the last one
 * reads as arrival rather than as a fourth of the same thing.
 *
 * ## Synthesised, not a file
 *
 * Two hundred bytes of oscillator against an audio asset that has to be
 * fetched, decoded and cache-busted — and fetched *during the splash*, which is
 * the one moment in the app's life when the network is already carrying the
 * first paint. There is nothing in a 200ms blip that a sample does better.
 *
 * ## When it plays
 *
 * Every browser blocks audio that starts without a user gesture, so this module
 * cannot promise the hops will be audible. What it does instead is take every
 * chance the platform actually offers, in one pass:
 *
 *  - **The context opens `running`.** The browser has decided this document may
 *    make noise. The three landings are scheduled straight onto its clock. This
 *    is the installed PWA — Chrome extends a web app launched from the home
 *    screen the latitude it gives an installed native one — and it is also a
 *    tab on an origin the visitor uses enough for Chrome's media engagement
 *    score to have unlocked it.
 *  - **The context opens `suspended`, then resumes.** The commonest real case,
 *    and the reason `schedule` is written the way it is: a client-side
 *    navigation carries the document's user activation with it, so arriving at
 *    `/app` from the landing page by clicking a link resumes immediately and
 *    the hops play. Whatever the wait costs is subtracted from the delays, so
 *    the blips still land on the frames the mark hits the ground rather than
 *    trailing behind them; a landing already gone by is dropped, not fired late.
 *  - **It never resumes.** A first, cold visit in a browser tab. The context is
 *    released after `RESUME_GRACE_MS` and the splash is silent. Chrome logs
 *    "The AudioContext was not allowed to start" once when this happens — that
 *    warning is the cost of trying at all, and trying is the point.
 *
 * The one thing this will not do is wait for a gesture and play the sound
 * afterwards. Blips arriving over a screen that has already gone are worse than
 * no blips.
 */

/**
 * Hz, one per landing — G4, B4, D5. A major triad climbing as the mark climbs,
 * which is the same thing the picture is saying, in the other channel.
 */
const LANDING_PITCHES = [392, 493.88, 587.33] as const;

/** How many landings this module has a voice for. `SplashScreen` matches it. */
export const LANDING_COUNT = LANDING_PITCHES.length;

/**
 * The arrival's second voice, an octave above the last landing and mixed under
 * it.
 *
 * Only the final impact gets it. The first two are steps on the way; this one
 * is the mark reaching the middle and the name appearing beneath it, and a
 * doubled octave is the cheapest way to say "that was the last one" without
 * making it louder than the two before.
 */
const ARRIVAL_PITCH = 1174.66;

/** Seconds. Fast enough that the blip reads as an impact rather than a note. */
const ATTACK_S = 0.006;
/** Seconds. Long enough to have a body, short enough to clear the next hop. */
const DECAY_S = 0.2;

/**
 * The whole splash's level, and it is deliberately low.
 *
 * This is a sound nobody asked to hear, on a screen that arrives before
 * anything else does. It should be audible on a phone held at arm's length and
 * unnoticeable as an intrusion in a shared room; if it is ever the loudest
 * thing in that room, this number is the fix, not a mute switch.
 */
const MASTER_LEVEL = 0.09;

/** The blip's own gain, before `MASTER_LEVEL`. The octave rides under it. */
const IMPACT_LEVEL = 0.9;
const ARRIVAL_LEVEL = 0.34;

/**
 * ms of tolerance on a landing that has already happened.
 *
 * A blip this far behind its impact still reads as belonging to it. Anything
 * older is dropped rather than fired at once, which would stack it onto the
 * next one.
 */
const LATE_TOLERANCE_MS = 40;

/** A landing still to come, and how far ahead of now it is. */
export type PendingLanding = {
  /** Index into the pitch table — which of the three hops this is. */
  index: number;
  /** Milliseconds from the moment `schedule` is called. Negative is clamped. */
  delayMs: number;
};

export type SplashSound = {
  /**
   * Has the browser agreed to let this document make a noise?
   *
   * Resolves `true` the moment the context is running and `false` if it has
   * not come up within `graceMs`, and it is asked *before* anything is
   * scheduled because the answer changes what the caller does with the picture:
   * `SplashScreen` holds the character off screen for the length of this
   * question, so that when the answer is yes every one of the three jumps has
   * its landing rather than only the ones that had not happened yet.
   *
   * A `false` closes the context on the way out. Nothing is coming.
   */
  whenAudible(graceMs: number): Promise<boolean>;
  /**
   * Hand the landings to the audio clock, all at once.
   *
   * Scheduling ahead rather than firing from `setTimeout` is the point: the
   * splash plays while the app is hydrating and fetching its first route, so
   * the main thread is the least reliable clock in the building. An
   * `AudioContext`'s is sample-accurate and does not care what React is doing.
   *
   * A landing whose `delayMs` has already gone past — which only happens when
   * hydration arrives so late that the character has started without us — is
   * dropped rather than fired at once, since a blip stacked onto the next one
   * is not the jump it belongs to.
   */
  schedule(landings: readonly PendingLanding[]): void;
  /** Fade out and release the context — for a splash the reader cut short. */
  stop(): void;
};

/**
 * The one veto, and it is a preference rather than a policy.
 *
 * `prefers-reduced-motion` is not a sound setting and is being used as one here
 * on purpose. There is no `prefers-reduced-sound`; someone who has told their
 * device to calm interfaces down is the person an unrequested blip is most
 * likely to be wrong for, and this is the only signal the platform offers.
 *
 * Everything else — installed or not, engaged or not — is the browser's call,
 * and it is left to the browser rather than guessed at here. Predicting a "no"
 * and staying quiet only produces silence in cases where the answer would have
 * been yes.
 */
function soundIsWanted(): boolean {
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * One impact: a triangle wave dropping onto its pitch under an envelope with no
 * sustain.
 *
 * The drop is what makes it a landing rather than a chime — a rising blip reads
 * as a take-off, and every one of these is on the way down. Both ramps are
 * exponential because pitch and loudness are both perceived logarithmically; a
 * linear ramp on either sounds like it is decelerating into its target.
 */
function impact(ctx: AudioContext, out: GainNode, at: number, pitch: number, level: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(pitch * 1.14, at);
  osc.frequency.exponentialRampToValueAtTime(pitch, at + 0.06);

  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(level, at + ATTACK_S);
  /*
    Never to zero: `exponentialRampToValueAtTime` throws on a zero target, and
    0.0001 is about -80dB, which is silence by any measure that matters here.
  */
  gain.gain.exponentialRampToValueAtTime(0.0001, at + DECAY_S);

  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + DECAY_S + 0.02);
}

/**
 * The splash's voice, or `null` when this document may not have one.
 *
 * `null` rather than a silent no-op object, so the caller's own work — deciding
 * which landings are still ahead — is skipped with it, and so that "there is no
 * sound here" is something a call site can see rather than something it
 * performs.
 */
export function createSplashSound(): SplashSound | null {
  if (typeof window === 'undefined') return null;
  if (typeof window.AudioContext !== 'function') return null;
  if (!soundIsWanted()) return null;

  const ctx = new AudioContext();

  const master = ctx.createGain();
  master.gain.value = MASTER_LEVEL;
  master.connect(ctx.destination);

  let closing = false;

  const release = (fadeS: number) => {
    if (closing) return;
    closing = true;

    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + fadeS);
    window.setTimeout(() => void ctx.close(), (fadeS + 0.05) * 1000);
  };

  return {
    whenAudible(graceMs) {
      if (closing) return Promise.resolve(false);
      if (ctx.state === 'running') return Promise.resolve(true);

      /*
        Suspended, so ask — once. A blocked `resume()` does not reject: Chrome
        leaves the promise pending until a gesture arrives, which may be minutes
        away or never, so the timer rather than the promise is what ends this
        wait. `Promise.race` is the shape that says exactly that.
      */
      return Promise.race([
        ctx.resume().then(() => ctx.state === 'running'),
        new Promise<boolean>((resolve) => {
          window.setTimeout(() => resolve(false), graceMs);
        }),
      ]).then(
        (audible) => {
          if (!audible) release(0);
          return audible;
        },
        () => {
          release(0);
          return false;
        },
      );
    },

    schedule(landings) {
      if (closing) return;

      const now = ctx.currentTime;
      let last = now;

      for (const { index, delayMs } of landings) {
        const pitch = LANDING_PITCHES[index];
        if (pitch === undefined) continue;
        if (delayMs < -LATE_TOLERANCE_MS) continue;

        const at = now + Math.max(0, delayMs) / 1000;
        impact(ctx, master, at, pitch, IMPACT_LEVEL);
        if (index === LANDING_COUNT - 1) impact(ctx, master, at, ARRIVAL_PITCH, ARRIVAL_LEVEL);
        last = Math.max(last, at);
      }

      /*
        Nothing holds a reference to the context once the splash unmounts, and a
        browser will only hand a page so many. Let the last blip ring out, then
        give it back.
      */
      window.setTimeout(() => release(0.04), (last - now + DECAY_S + 0.1) * 1000);
    },

    stop() {
      // Longer than the housekeeping fade above, because this one is audible
      // and a sound cut dead is a click.
      release(0.08);
    },
  };
}
