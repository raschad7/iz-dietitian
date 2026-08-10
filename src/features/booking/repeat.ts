import { addDays, type IsoDate } from './date';

/**
 * How long a booking repeats for.
 *
 * One number: how many weekly appointments to add after the one just made. The
 * presets name familiar spans — a month is four visits, three months is
 * thirteen — but nothing here has to reason about calendars, month ends or
 * leap days, because a weekly repeat only ever moves in sevens.
 *
 * Pure, and imported by both halves on purpose: the dialog tells the doctor how
 * many appointments they are about to create, and the server writes exactly
 * that many. Two answers that must never differ, so there is one function and
 * both call it — the same arrangement `validateBooking` has.
 */

/** The longest a single repeat may run: a year of weekly visits. */
export const MAX_REPEAT_WEEKS = 52;

/** The spans the dialog offers, in weeks, before "custom". */
export const REPEAT_PRESETS = [
  { key: 'week1', weeks: 1 },
  { key: 'week2', weeks: 2 },
  { key: 'week3', weeks: 3 },
  { key: 'month1', weeks: 4 },
] as const;

/** The default offer: a month of weekly visits. */
export const DEFAULT_REPEAT_WEEKS = 4;

/**
 * Every date the repeat would book, in order — the first booking's own date
 * excluded, because it already exists.
 *
 * Returns `[]` for a count that is not a whole number of weeks of at least one,
 * rather than a guess. Never longer than {@link MAX_REPEAT_WEEKS}.
 */
export function weeklyRepeatDates(start: IsoDate, weeks: number): IsoDate[] {
  if (!Number.isInteger(weeks) || weeks < 1) return [];

  const count = Math.min(weeks, MAX_REPEAT_WEEKS);
  return Array.from({ length: count }, (_, index) => addDays(start, (index + 1) * 7));
}
