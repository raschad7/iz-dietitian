import type { MascotCelebration, MascotMilestone, MascotProgression, MascotState } from './states';

/**
 * The mascot's full emotional vocabulary — eyes only.
 *
 * Every name here has to be answerable from the eyes alone: openness, gaze,
 * tilt, blink, and the body's own squash/scale/rotate. Nothing here may imply
 * a mouth, limbs, or any element `logo-mark.svg` does not already draw — see
 * `mascot-face.tsx` for the two things that are actually allowed to move.
 */
export type MascotEmotion =
  | 'welcome'
  | 'curious'
  | 'listening'
  | 'thinking'
  | 'sleepy'
  | 'mealReminder'
  | 'missedMeal'
  | 'streakAtRisk'
  | 'sad'
  | 'backOnTrack'
  | 'progress'
  | 'milestone25'
  | 'milestone50'
  | 'milestone75'
  | 'goalComplete'
  | 'consistency'
  | 'surprised'
  | 'encouraging'
  | 'resting'
  | 'celebration';

/** Whether today's meal schedule has something worth the client's attention. */
export type MealSignal = 'due' | 'missed' | 'onTrack' | null;

/**
 * The streak as an event, not just a number — what a raw `streak: number`
 * cannot say on its own: whether it is about to lapse, whether it just did,
 * and whether the client just started rebuilding it.
 */
export type StreakSignal = {
  current: number;
  atRisk: boolean;
  justLost: boolean;
  justRecovered: boolean;
  /** A run long enough to be worth a quiet nod — see `consistency` below. */
  milestoneReached: boolean;
} | null;

export type InactivitySignal = 'active' | 'returning' | 'sleepy' | null;

export type MascotSignals = {
  /** The single source of adherence truth — see `states.ts`. */
  progression: MascotProgression;
  /** From `useMascotProgression` (or its equivalent) — evolve/milestone/goal. */
  celebration: MascotCelebration;
  meal: MealSignal;
  streak: StreakSignal;
  inactivity: InactivitySignal;
  isLoading: boolean;
  /** No plan, no meals, nothing reported — an honest empty screen. */
  isEmpty: boolean;
  /** True once per session, until the welcome has played. */
  welcomePending: boolean;
};

export type MascotResolution = {
  emotion: MascotEmotion;
  /** A transient interruption that reverts to the base state on its own. */
  temporary: boolean;
  /** How long to hold before reverting — only meaningful when `temporary`. */
  holdMs: number;
  /** What to settle into afterward. Ignored when `temporary` is false. */
  settleInto: MascotEmotion;
};

/**
 * How long each temporary state holds before the mascot lets go of it, in ms.
 *
 * Short across the board — §3 of the brief is explicit that a high-priority
 * state may only interrupt briefly. These are the single statement of every
 * duration; `use-reactive-mascot.ts` times its reverts off this table and
 * nothing here is restated as a magic number elsewhere.
 */
export const MASCOT_HOLD_MS: Record<MascotEmotion, number> = {
  welcome: 2200,
  curious: 0,
  listening: 0,
  thinking: 0,
  sleepy: 0,
  mealReminder: 2600,
  missedMeal: 2600,
  streakAtRisk: 2600,
  sad: 1800,
  backOnTrack: 2400,
  progress: 1400,
  milestone25: 1800,
  milestone50: 2000,
  milestone75: 2200,
  goalComplete: 2600,
  consistency: 1800,
  surprised: 1600,
  encouraging: 1800,
  resting: 0,
  celebration: 2000,
};

const MILESTONE_EMOTION: Record<25 | 50 | 75, MascotEmotion> = {
  25: 'milestone25',
  50: 'milestone50',
  75: 'milestone75',
};

function resolution(emotion: MascotEmotion, settleInto: MascotEmotion = 'resting'): MascotResolution {
  const holdMs = MASCOT_HOLD_MS[emotion];
  return { emotion, temporary: holdMs > 0, holdMs, settleInto };
}

/**
 * The one place every mascot-driving screen's signals are turned into a
 * single emotion — the priority hierarchy from §3 of the brief, top to
 * bottom, first match wins.
 *
 * Pure and stateless: it does not know what was shown a moment ago and does
 * not start or stop any timer. `use-reactive-mascot.ts` is what remembers —
 * this function only ever answers "given everything true right now, what
 * does the mascot show", which is what keeps it unit-testable without a DOM.
 */
export function resolveMascotEmotion(signals: MascotSignals): MascotResolution {
  const { progression, celebration, meal, streak, inactivity, isLoading, isEmpty, welcomePending } = signals;

  if (welcomePending) return resolution('welcome');

  /*
    The flourish, not the reading. `celebration === 'goal'` is an *edge* —
    `use-reactive-mascot.ts` only ever sets it once per week, the same
    once-per-thing guarantee `mascotCelebrationFor` gives `evolve` and
    `milestone` — so this is safe to treat as "start the temporary lift and
    rotation now". `progression.complete` on its own is not an edge: it stays
    true for the rest of the week, and answering it here too would relock this
    same temporary pulse on every timer it ever finishes, forever. The
    completed week's *resting* reading is the very last branch below instead.
  */
  if (celebration === 'goal') return resolution('goalComplete');

  if (celebration === 'milestone' && progression.milestone !== null && progression.milestone !== 100) {
    return resolution(MILESTONE_EMOTION[progression.milestone as 25 | 50 | 75]);
  }

  if (streak?.justLost) return resolution('sad', 'encouraging');

  if (streak?.atRisk) return resolution('streakAtRisk');

  if (meal === 'missed') return resolution('missedMeal');

  if (meal === 'due') return resolution('mealReminder');

  if (streak?.justRecovered) return resolution('backOnTrack');

  if (streak?.milestoneReached) return resolution('consistency');

  if (celebration === 'evolve') return resolution('progress');

  if (inactivity === 'returning') return resolution('surprised', 'encouraging');

  if (isLoading) return resolution('thinking');

  if (isEmpty) return resolution('curious');

  if (inactivity === 'sleepy') return resolution('sleepy');

  /*
    The completed week's resting reading — not a pulse, so this is the one
    place in the function that does not go through the `resolution()` helper:
    `MASCOT_HOLD_MS.goalComplete` describes the *flourish*'s duration, and
    reusing it here would mark this persistent reading `temporary` too,
    which is exactly the replay loop the comment above explains.
  */
  if (progression.complete) return { emotion: 'goalComplete', temporary: false, holdMs: 0, settleInto: 'goalComplete' };

  return resolution('resting');
}

/** Re-exported so callers of this module never need a second import for it. */
export type { MascotCelebration, MascotMilestone, MascotProgression, MascotState };
