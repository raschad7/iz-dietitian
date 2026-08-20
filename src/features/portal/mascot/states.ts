/**
 * The mascot's progression — which of the six drawings a client's plan
 * adherence earns them, and which of those steps is worth celebrating.
 *
 * Pure, like `../adherence.ts` and for the same reason: no database, no React,
 * no clock. Everything time-dependent is already resolved into a fraction by
 * the time it reaches here, so the whole progression can be tested directly and
 * two screens drawing the same mascot cannot disagree about which one it is.
 *
 * ⚠ **This is a plan-adherence progression, not a body one.** The six drawings
 * mean "starting out → building consistency → making progress → getting closer
 * → completing the week", and nothing here reads weight, height, BMI or
 * `clients.goal`. That is deliberate and load-bearing: `weight_kg` is gated
 * behind `share_weight_with_client` precisely because a number on a screen
 * helps some clients and hurts others (see `client-nutrition-profiles.ts`), and
 * a character whose shape tracked that number would route straight around the
 * gate. Adherence is a thing the client *did*, which is the only thing this
 * mascot is ever allowed to reflect back at them.
 */

/**
 * The six drawings, as an ordered scale.
 *
 * Numbers rather than names because the order *is* the meaning: `next >
 * previous` is how "the client moved forward" is asked, in
 * {@link mascotAdvanced} and nowhere else.
 */
export const MASCOT_STATES = [1, 2, 3, 4, 5, 6] as const;

export type MascotState = (typeof MASCOT_STATES)[number];

/** The first drawing — where a client with nothing reported yet begins. */
export const FIRST_MASCOT_STATE: MascotState = 1;

/** The last drawing — the fully-kept week. */
export const FINAL_MASCOT_STATE: MascotState = 6;

/**
 * Each state's lower bound, as a fraction of the week's average adherence.
 *
 * Read as "at least this much earns this drawing", walked from the top down in
 * {@link getMascotState}. The bands are uneven on purpose: the first step is
 * cheap (10% — one lightly-kept day out of seven should visibly move something)
 * and the last is expensive (90%), so the sixth drawing stays a real result
 * rather than somewhere a middling week drifts into.
 *
 * **The single statement of the mapping.** Nothing else in the app may compare
 * an adherence fraction to a mascot threshold — a second copy is exactly how a
 * card and the character beside it end up describing different weeks.
 */
export const MASCOT_THRESHOLDS: ReadonlyArray<{ from: number; state: MascotState }> = [
  { from: 0.9, state: 6 },
  { from: 0.7, state: 5 },
  { from: 0.45, state: 4 },
  { from: 0.25, state: 3 },
  { from: 0.1, state: 2 },
  { from: 0, state: 1 },
];

/**
 * Clamp anything arriving as a 0–1 fraction.
 *
 * `adherenceFraction` already clamps its own output, so on the normal path this
 * is a no-op. It is here for the other ways a number reaches this module: a
 * value read back out of `localStorage`, a hand-written prop, an `NaN` from a
 * division nobody guarded. A mascot is not worth a thrown error, and a state
 * looked up from `NaN` would be `undefined` rather than a drawing.
 *
 * **Only `NaN` is special-cased.** The infinities clamp correctly on their own —
 * `Math.max(Infinity, 0)` then `Math.min(…, 1)` is 1, and the negative is 0 —
 * so rejecting every non-finite value would have sent `Infinity`, which means
 * "far past the target", to the *floor*. `NaN` is the only one with no honest
 * position on the scale, and the beginning is the safe place to put it.
 */
export function clampProgress(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

/**
 * The drawing a fraction earns.
 *
 * `null` — nothing reported this week — resolves to the same answer as zero,
 * deliberately. A client who has not started and a client whose first day went
 * badly are both at the beginning of the week, and a seventh "no data"
 * character would be drawing a distinction that says nothing to either of them.
 */
export function getMascotState(progress: number | null): MascotState {
  if (progress === null) return FIRST_MASCOT_STATE;

  const value = clampProgress(progress);

  return MASCOT_THRESHOLDS.find((band) => value >= band.from)?.state ?? FIRST_MASCOT_STATE;
}

/**
 * The milestones worth a stronger celebration than a plain step between
 * drawings, as percentages.
 *
 * Four, not six. A milestone has to be rarer than a state change or the two
 * read as the same event and the screen becomes noisy — which §10 of the brief
 * rules out in as many words.
 */
export const MASCOT_MILESTONES = [25, 50, 75, 100] as const;

export type MascotMilestone = (typeof MASCOT_MILESTONES)[number];

/** Reaching this one is the goal-completed celebration, not a milestone pop. */
export const GOAL_MILESTONE: MascotMilestone = 100;

/**
 * The highest milestone a fraction has passed, or `null` below the first.
 *
 * A *level*, not an event. Whether it is worth animating is
 * {@link mascotCelebrationFor}'s question, and that one needs to know what the
 * client was last shown — which no pure reading of today's number can.
 */
export function getMascotMilestone(progress: number | null): MascotMilestone | null {
  if (progress === null) return null;

  const percent = clampProgress(progress) * 100;

  // Walked from the top, so the answer is the highest passed rather than the
  // first one cleared.
  return [...MASCOT_MILESTONES].reverse().find((milestone) => percent >= milestone) ?? null;
}

/**
 * Everything one reading of the week resolves to.
 *
 * Derived in a single call so no caller can pick the state off one fraction and
 * the milestone off another.
 */
export type MascotProgression = {
  /** 0–1, clamped. `null` when the week has nothing reported yet. */
  progress: number | null;
  /** Which of the six drawings. Always answered, `null` progress included. */
  state: MascotState;
  /** Highest milestone passed, or `null`. */
  milestone: MascotMilestone | null;
  /** True at 100% — every reported day of the week fully kept. */
  complete: boolean;
};

export function getMascotProgression(progress: number | null): MascotProgression {
  const value = progress === null ? null : clampProgress(progress);

  return {
    progress: value,
    state: getMascotState(value),
    milestone: getMascotMilestone(value),
    complete: value !== null && value >= 1,
  };
}

/**
 * Did the client move *forward* between two readings?
 *
 * Forward only, and that is the entire reason this is a function rather than a
 * `!==` at each call site. A week's average can fall — one missed day drags it
 * down — and the mascot must not animate, flash, or comment when it does. §24:
 * celebrate progress, never react to its absence. A drop just settles into the
 * lower drawing with no transition played at all.
 */
export function mascotAdvanced(previous: MascotState, next: MascotState): boolean {
  return next > previous;
}

/**
 * Which celebration, if any, a reading has earned *since the client was last
 * shown one*.
 *
 * The `previous*` pair is what makes this once-per-thing instead of
 * once-per-render: the component persists what it last played and hands it back
 * in, so a reload, a refetch, and a re-render at unchanged numbers all resolve
 * to `'none'`. See `use-mascot-progression.ts`.
 *
 * Ordered strongest-first, and exactly one is returned. Reaching 100% is a goal
 * completion and nothing else, even though it is simultaneously a new
 * milestone and a state change — one reading plays one animation.
 */
export type MascotCelebration = 'none' | 'evolve' | 'milestone' | 'goal';

export function mascotCelebrationFor({
  previousState,
  previousMilestone,
  current,
}: {
  previousState: MascotState;
  /** The last milestone actually *celebrated* — not the last one passed. */
  previousMilestone: MascotMilestone | null;
  /**
   * Only the three fields the decision turns on, not a whole
   * {@link MascotProgression}. The caller is a `useEffect` whose dependency
   * list has to be primitives — a freshly-built progression object would
   * re-run it on every render — so it rebuilds this narrow shape inline rather
   * than holding a reference to one. `progress` itself is never read here:
   * every threshold it could be compared against has already been resolved
   * into `state` and `milestone`.
   */
  current: Pick<MascotProgression, 'state' | 'milestone' | 'complete'>;
}): MascotCelebration {
  const milestone = current.milestone;

  const isNewMilestone =
    milestone !== null && (previousMilestone === null || milestone > previousMilestone);

  if (current.complete && isNewMilestone) return 'goal';
  if (isNewMilestone) return 'milestone';
  if (mascotAdvanced(previousState, current.state)) return 'evolve';

  return 'none';
}
