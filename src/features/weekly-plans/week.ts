import { type AdherenceDay } from '@/features/portal/adherence';

/**
 * Which week a plan is for.
 *
 * Pure, and deliberately string-in/string-out: a plan's `week_start_date` is a
 * calendar date, so it must never round-trip through an instant that a time zone
 * could shift by a day.
 */

/** The clinic's week starts on Sunday — the same convention as `day_of_week = 0`. */
const SUNDAY = 0;

/**
 * `YYYY-MM-DD` for the coming Sunday, in the clinic's local reckoning.
 *
 * Uses the *local* date parts rather than `toISOString`, which would render as the
 * previous day for any evening in Asia/Hebron. Today counts as the coming Sunday
 * when today *is* Sunday: a dietitian planning on Sunday morning is planning for
 * the week that just started, not the next one.
 */
export function nextSunday(today: Date = new Date()): string {
  const daysAhead = (SUNDAY - today.getDay() + 7) % 7;

  const target = new Date(today.getFullYear(), today.getMonth(), today.getDate() + daysAhead);

  return formatDateParts(target);
}

/**
 * `YYYY-MM-DD` for the Sunday that starts the week `today` falls in.
 *
 * Looks backwards where {@link nextSunday} looks forwards, and the two are only
 * the same answer on a Sunday. Asking "does this client have a plan?" needs the
 * week already running — on a Wednesday, `nextSunday` names a week nobody is
 * eating from yet, and every client would look neglected for six days out of
 * seven.
 *
 * Same local-parts reckoning as its sibling, for the same reason.
 */
export function currentSunday(today: Date = new Date()): string {
  const daysBehind = (today.getDay() - SUNDAY + 7) % 7;

  const target = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysBehind);

  return formatDateParts(target);
}

/** `YYYY-MM-DD` from a Date's local parts. */
export function formatDateParts(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/** The weekday carried by an ISO calendar date, without converting it to UTC. */
export function dayOfWeekForDate(date: string): number | null {
  const parts = date.split('-').map(Number);
  const [year, month, day] = parts;

  if (parts.length !== 3 || !year || !month || !day) return null;

  const localDate = new Date(year, month - 1, day);

  // `new Date(2026, 1, 31)` silently rolls into March. A plan start is a real
  // calendar date, so reject that normalisation instead of assigning it a day.
  if (formatDateParts(localDate) !== date) return null;

  return localDate.getDay();
}

/** Weekday ids in the order a plan starting on `weekStartDate` is experienced. */
export function orderedWeekdays(weekStartDate: string): number[] {
  const firstDay = dayOfWeekForDate(weekStartDate) ?? SUNDAY;

  return Array.from({ length: 7 }, (_, offset) => (firstDay + offset) % 7);
}

/**
 * One day of a plan's week, reduced to what a day picker needs to draw it.
 *
 * Declared here rather than beside the query that builds it because the picker is
 * a client component: this module imports nothing, so the type can cross the
 * client boundary without dragging the database driver into the browser bundle
 * behind it.
 */
export type PlanDaySummary = {
  dayOfWeek: number;
  /** `YYYY-MM-DD`, or null when the plan's `week_start_date` is unreadable. */
  date: string | null;
  /** How many meals the dietitian planned. Zero is a real, showable state. */
  mealCount: number;
  isToday: boolean;
  /**
   * How the client reported this day, for the flame the picker draws.
   *
   * Null only when {@link date} is — there is no day to have an adherence
   * report about. A day that simply has no report is `state: 'empty'`, which is
   * a different fact and the strip draws it differently.
   */
  adherence: AdherenceDay | null;
};

/**
 * Where a plan day sits relative to the clinic's today.
 *
 * This is what decides whether the client may tick that day's meals: only today
 * can be reported on. A day that has not happened cannot have been eaten, and a
 * day that has ended is a record — letting either be edited turns the adherence
 * history into something a client can rewrite, which is the one thing the whole
 * `client_plan_adherence` table exists to be trusted about.
 */
export type DayStanding = 'past' | 'today' | 'future';

/**
 * Compares two `YYYY-MM-DD` calendar dates and nothing else.
 *
 * **Date-only, never an instant.** Both sides are zero-padded ISO, so string
 * comparison is chronological, and the answer cannot move because it is 23:59 in
 * one place and 00:30 in another — the same reason every other date in this
 * module is a string in and a string out. `today` is the clinic's own wall-clock
 * date (`context.now.date`), so the day rolls over when the clinic's does rather
 * than when the client's phone happens to.
 *
 * A `null` date reads as `past`, which is the safe direction: it only occurs
 * when the plan's `week_start_date` is unreadable, and a day nobody can put on a
 * calendar is not a day to open for writing.
 */
export function dayStanding(date: string | null, today: string): DayStanding {
  if (date === null) return 'past';
  if (date === today) return 'today';

  return date < today ? 'past' : 'future';
}

/** The seven dates a plan covers, for the portal's day headings. */
export function weekDates(weekStartDate: string): string[] {
  const firstDay = dayOfWeekForDate(weekStartDate);
  const [year, month, day] = weekStartDate.split('-').map(Number);

  if (firstDay === null || !year || !month || !day) return [];

  return Array.from({ length: 7 }, (_, offset) =>
    formatDateParts(new Date(year, month - 1, day + offset)),
  );
}

/** The seven plan dates paired with their absolute Sunday-to-Saturday ids. */
export function planWeekDays(weekStartDate: string): { dayOfWeek: number; date: string }[] {
  const weekdays = orderedWeekdays(weekStartDate);

  return weekDates(weekStartDate).map((date, index) => ({
    dayOfWeek: weekdays[index] ?? SUNDAY,
    date,
  }));
}

/** The calendar date belonging to one weekday in a possibly rotated plan. */
export function weekDateForDay(weekStartDate: string, dayOfWeek: number): string | null {
  return planWeekDays(weekStartDate).find((day) => day.dayOfWeek === dayOfWeek)?.date ?? null;
}
