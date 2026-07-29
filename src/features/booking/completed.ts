import { toIsoDate } from './date';

/**
 * Whether an appointment is over.
 *
 * **Derived, never stored.** There is no status column, no cron job and nothing
 * to mark by hand: an appointment is completed exactly when its end time is in
 * the past, and that question has a different answer every minute. Persisting it
 * would mean a row that is wrong until something remembers to update it.
 *
 * `now` is nullable on purpose. The server has no idea what time it is where the
 * user is sitting, so the calendar renders with `null` — nothing completed — and
 * the single shared clock in `useCalendarClock` fills it in after mount. Guessing
 * on the server instead would produce markup that disagrees with the client's
 * first render, which React reports as a hydration error.
 */

export type CompletableAppointment = {
  /** `YYYY-MM-DD`, clinic-local. */
  date: string;
  startMinute: number;
  durationMinutes: number;
};

/**
 * True once the appointment's end has passed.
 *
 * The boundary is inclusive: an appointment ending at 10:00 is completed at
 * 10:00 exactly. The slot is over at that instant — the next appointment may
 * legitimately start then — so treating it as still running would leave two
 * appointments looking simultaneously current.
 */
export function isCompleted(appointment: CompletableAppointment, now: Date | null): boolean {
  if (!now) return false;

  // Both sides are zero-padded ISO, so string comparison is chronological.
  const today = toIsoDate(now);
  if (appointment.date < today) return true;
  if (appointment.date > today) return false;

  const nowMinute = now.getHours() * 60 + now.getMinutes();
  return appointment.startMinute + appointment.durationMinutes <= nowMinute;
}

/**
 * How often the shared clock ticks.
 *
 * One timer drives the whole calendar so that every block judges itself against
 * the same instant — a timer per block would mean 40 timers disagreeing by
 * milliseconds, and 40 re-renders. On a 15-minute grid, 30 seconds is already
 * finer than anything the user can perceive.
 */
export const CLOCK_INTERVAL_MS = 30_000;

/**
 * Minutes from midnight for the now-line, or null when the date is not today.
 *
 * Returning null rather than a number off the end of the grid keeps the caller
 * from having to know that the line is hidden — there is simply nothing to draw.
 */
export function nowLineMinute(date: string, now: Date | null): number | null {
  if (!now || toIsoDate(now) !== date) return null;
  return now.getHours() * 60 + now.getMinutes();
}
