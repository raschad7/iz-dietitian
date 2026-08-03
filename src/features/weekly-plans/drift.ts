/**
 * How far a figure may sit from its target before the board says so.
 *
 * Two thresholds because the two readings are different questions. A meal is
 * compared against its slot's share, and 15% is the same band `similar.ts` uses
 * to decide whether a dish counts as a substitute — a meal that would not
 * qualify as a swap for its own slot is worth a second look. A day is compared
 * against the whole target, where errors have had five meals to accumulate and
 * cancel, so 10% is the tighter figure it earns.
 */
export const MEAL_TOLERANCE = 0.15;
export const DAY_TOLERANCE = 0.1;

/** Which way a figure missed, or `null` while it has not. */
export type Drift = 'over' | 'under' | null;

/**
 * The boundary is deliberately inclusive: a day exactly 10% above target is
 * inside the tolerance, not outside it. A board that flags the round number
 * everyone aims at teaches the dietitian to ignore the mark.
 */
export function driftState(value: number, target: number, tolerance: number): Drift {
  // No target is not a target of zero. A slot without a budget has nothing to
  // drift from, and dividing by it would report every value as infinitely over.
  if (target <= 0) return null;

  const ratio = (value - target) / target;

  if (ratio > tolerance) return 'over';
  if (ratio < -tolerance) return 'under';

  return null;
}
