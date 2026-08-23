import type { MascotEmotion } from './emotion';
import type { MascotState } from './states';

/**
 * The vocabulary an emotion is built from — nothing else is allowed to move.
 *
 * `gazeX`/`gazeY` and `tilt` are the eyes'; `scaleX`/`scaleY`/`rotate`/
 * `translateY` are the whole mark's. Both groups exist on the same two
 * elements `logo-mark.svg` already draws — see the brief's own list of what
 * may never be added (a mouth, limbs, brows, hair, anything else).
 */
export type EyePose = {
  /** In the 743-wide viewBox's own units. */
  gazeX: number;
  gazeY: number;
  /** 0 = shut, 1 = the drawing's own openness, >1 = wide. Scales the eye's ry. */
  openness: number;
  /** Degrees, added to the drawing's own 15.995° tilt. */
  tilt: number;
};

export type BodyPose = {
  scaleX: number;
  scaleY: number;
  /** Degrees. */
  rotate: number;
  /** In the 743-wide viewBox's own units — negative lifts. */
  translateY: number;
};

/** One held position, and how long the transition into it should take. */
export type MascotKeyframe = {
  eyes: EyePose;
  body: BodyPose;
  /** ms to transition into this frame from the previous one. */
  durationMs: number;
  /** ms to hold once arrived, before the next frame starts. */
  holdMs: number;
};

const RESTING_EYE: EyePose = { gazeX: 0, gazeY: 0, openness: 1, tilt: 0 };
const RESTING_BODY: BodyPose = { scaleX: 1, scaleY: 1, rotate: 0, translateY: 0 };

function frame(
  eyes: Partial<EyePose>,
  body: Partial<BodyPose> = {},
  durationMs = 220,
  holdMs = 0,
): MascotKeyframe {
  return {
    eyes: { ...RESTING_EYE, ...eyes },
    body: { ...RESTING_BODY, ...body },
    durationMs,
    holdMs,
  };
}

/** The single resting frame — everything at the drawing's own geometry. */
export const RESTING_FRAME = frame({}, {}, 0, 0);

/**
 * One choreographed beat: eyes shut most of the way and straight back open.
 * Reused rather than restated everywhere a sequence calls for a blink.
 */
function blink(durationMs = 90, holdMs = 60): MascotKeyframe {
  return frame({ openness: 0.08 }, {}, durationMs, holdMs);
}

/**
 * Every temporary emotion's beats, read top to bottom exactly as §5–§17 of the
 * brief describe them. The persistent states (`resting`, `curious`,
 * `listening`, `encouraging`, `consistency`) are a single held frame — their
 * only motion is the idle float and blink `mascot-face.tsx` layers underneath
 * every emotion regardless of which sequence is running.
 *
 * `thinking` and `sleepy` are the two written to loop — see
 * `LOOPING_EMOTIONS` below — because both describe an ongoing condition
 * ("the page is loading", "the client has been away") rather than a single
 * reaction to one moment.
 */
export const EMOTION_SEQUENCES: Record<MascotEmotion, readonly MascotKeyframe[]> = {
  welcome: [
    frame({ openness: 0.25 }, { scaleY: 0.94 }, 160, 60), // small anticipation
    frame({ openness: 1.1 }, { scaleY: 1.02 }, 220, 80), // eyes open
    frame({ gazeY: -8 }, {}, 240, 120), // looks toward the client
    frame({ openness: 1.05 }, { translateY: -14, scaleY: 1.05 }, 200, 140), // tiny bounce
    RESTING_FRAME,
  ],
  curious: [frame({ openness: 1.08, tilt: 3, gazeY: -2 }, {}, 320, 0)],
  listening: [frame({ openness: 1.02, gazeY: 3 }, {}, 260, 0)],
  thinking: [
    frame({ gazeX: -10 }, {}, 520, 260),
    blink(90, 40),
    frame({ gazeX: 10 }, {}, 520, 260),
    frame({}, {}, 420, 200),
  ],
  sleepy: [
    frame({ openness: 0.4, gazeY: 5 }, { translateY: 3 }, 900, 700),
    blink(220, 500),
    frame({ openness: 0.4, gazeY: 5 }, { translateY: 3 }, 260, 700),
  ],
  mealReminder: [
    frame({ gazeY: 11, gazeX: 5 }, {}, 260, 120), // toward the meal card
    blink(90, 60),
    frame({ gazeY: 8, gazeX: 4 }, {}, 220, 160), // small attention movement
    RESTING_FRAME,
  ],
  missedMeal: [
    frame({ gazeY: 13, openness: 0.75 }, { translateY: 2 }, 320, 140), // slightly downward
    blink(100, 60),
    frame({ gazeY: 9, openness: 0.85 }, {}, 300, 140), // small, slow
    RESTING_FRAME,
  ],
  streakAtRisk: [
    frame({ openness: 1.22 }, {}, 220, 100), // eyes widen
    frame({ gazeX: -7, gazeY: -4, openness: 1.15 }, {}, 240, 140), // toward the streak
    frame({ tilt: -4, openness: 1.1 }, { scaleY: 0.98 }, 220, 220), // small worried movement
    frame({ openness: 1.05 }, {}, 260, 0), // pause, not resting fully
  ],
  sad: [
    frame({ gazeY: 15, openness: 0.5, tilt: -2 }, { translateY: 3, scaleY: 0.97 }, 340, 260),
    frame({ gazeY: 10, openness: 0.6 }, { scaleY: 0.98 }, 260, 0),
  ],
  backOnTrack: [
    frame({ gazeY: 15, openness: 0.5 }, { scaleY: 0.97 }, 0, 80), // starts from sad
    frame({ openness: 1.15 }, {}, 240, 60), // eyes brighten
    frame({ gazeY: -9 }, { translateY: -9 }, 240, 100), // small upward movement
    frame({ openness: 1.12, tilt: 2 }, { scaleY: 1.04 }, 220, 160), // happy
    RESTING_FRAME,
  ],
  progress: [
    frame({ openness: 0.55 }, { scaleY: 0.93 }, 160, 40), // anticipation + squash
    frame({ gazeX: 4 }, { scaleY: 1.05, translateY: -6 }, 220, 60), // eye transition + bounce
    RESTING_FRAME,
  ],
  milestone25: [
    frame({ openness: 1.12 }, { scaleY: 1.02 }, 160, 60),
    frame({ gazeX: 5, gazeY: -3 }, { translateY: -6 }, 200, 100),
    RESTING_FRAME,
  ],
  milestone50: [
    frame({ openness: 1.16 }, { scaleY: 1.04 }, 160, 40),
    frame({ gazeX: -5, gazeY: -4 }, { translateY: -9 }, 180, 60),
    frame({ gazeX: 5, gazeY: -4 }, { translateY: -9 }, 180, 60),
    RESTING_FRAME,
  ],
  milestone75: [
    frame({ openness: 1.22 }, { scaleY: 1.05 }, 140, 20),
    frame({ gazeX: -6, gazeY: -5 }, { translateY: -11, rotate: -3 }, 170, 40),
    frame({ gazeX: 6, gazeY: -5 }, { translateY: -11, rotate: 3 }, 170, 40),
    RESTING_FRAME,
  ],
  goalComplete: [
    frame({ openness: 0.55 }, { scaleY: 0.9 }, 180, 60), // anticipation
    frame({ openness: 1.28 }, { translateY: -13, scaleY: 1.08 }, 260, 100), // very happy, lifts
    frame({ openness: 1.2 }, { translateY: -15, rotate: -4 }, 200, 60), // tiny rotation
    frame({ openness: 1.2 }, { translateY: -15, rotate: 4 }, 200, 60),
    RESTING_FRAME,
  ],
  consistency: [frame({ openness: 1.1, tilt: 2 }, {}, 260, 200), RESTING_FRAME],
  surprised: [frame({ openness: 1.32 }, { scaleY: 1.05 }, 150, 140), RESTING_FRAME],
  encouraging: [frame({ openness: 1.1 }, { scaleY: 1.02 }, 220, 0)],
  resting: [RESTING_FRAME],
  /*
   * The claim card's own beat (`today-flame-celebration.tsx`), not the
   * ordinary progress trail — eyes shut into a happy squint rather than
   * widening, and the body actually leaves the ground rather than only
   * lifting a few units, the two things §"beautiful animation" for that card
   * asked for by name. Squash-anticipate, launch, a small hang with a tilt
   * each way, land-squash, eyes open again, settle — the standard six beats
   * of a jump, the same shape `goalComplete`'s lift uses but taken further.
   */
  celebration: [
    frame({ openness: 0.16 }, { scaleY: 0.86, translateY: 3 }, 140, 20), // crouch, eyes begin closing
    frame({ openness: 0.1 }, { scaleY: 1.12, translateY: -24 }, 200, 90), // launch — airborne, eyes shut into a grin
    frame({ openness: 0.1 }, { scaleY: 1.02, translateY: -19, rotate: -4 }, 150, 60), // hang, tilt one way
    frame({ openness: 0.1 }, { scaleY: 1.02, translateY: -19, rotate: 4 }, 150, 60), // hang, tilt the other
    frame({ openness: 0.2 }, { scaleY: 0.9, translateY: 2 }, 170, 60), // land, squash
    frame({ openness: 1.08 }, {}, 200, 80), // eyes open again, bright
    RESTING_FRAME,
  ],
};

/**
 * Emotions describing an ongoing condition rather than one reaction — their
 * sequence repeats for as long as the emotion is current, instead of playing
 * once and settling. Everything else plays once; `use-reactive-mascot.ts`
 * decides how long "current" lasts.
 */
export const LOOPING_EMOTIONS: ReadonlySet<MascotEmotion> = new Set(['thinking', 'sleepy']);

/**
 * The six drawings' worth of resting mood, expressed as eyes instead of six
 * separate images — the same `MASCOT_THRESHOLDS` progression in `states.ts`,
 * now a baseline the eyes lean into rather than a picture that gets swapped.
 *
 * Deliberately subtle: §16 forbids reshaping the character, so this only ever
 * nudges openness and tilt a few percent between the first tier and the last.
 * It is blended under whatever emotion is currently playing, not instead of
 * it — `mascot-face.tsx` adds this to the sequence's own frame.
 */
export function tierBaseline(state: MascotState): EyePose {
  const eased = (state - 1) / 5; // 0 at state 1, 1 at state 6
  return {
    gazeX: 0,
    gazeY: 0,
    openness: 0.94 + eased * 0.12,
    tilt: eased * 2,
  };
}
