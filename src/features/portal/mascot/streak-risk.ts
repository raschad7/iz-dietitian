import type { WallClock } from '@/features/booking/completed';

import type { AdherenceLevel } from '../adherence';

/**
 * Whether an active streak is close enough to lapsing to be worth a nudge —
 * §8 of the brief. There is no stored "at risk" concept anywhere in the
 * schema, so this is derived the same way the rest of the streak is: from
 * the day's own adherence level and the clock, never a second source of
 * truth alongside `currentAdherenceStreak`.
 *
 * The single statement of the heuristic — both `loadHomeMascotSignals` and
 * the progress tab compute it through this function so the two screens
 * cannot disagree about whether today is at risk.
 */

/** Local hour a still-unkept day with a live streak starts reading as at risk. */
const STREAK_AT_RISK_HOUR = 15;

export function isStreakAtRisk(streak: number, todayLevel: AdherenceLevel | null, now: WallClock): boolean {
  if (streak <= 0) return false;
  if (todayLevel === 'full') return false;

  const hour = Math.floor(now.minute / 60);
  return hour >= STREAK_AT_RISK_HOUR;
}
