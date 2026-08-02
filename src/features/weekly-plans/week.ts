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

/** `YYYY-MM-DD` from a Date's local parts. */
export function formatDateParts(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
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
};

/** The seven dates a plan covers, for the portal's day headings. */
export function weekDates(weekStartDate: string): string[] {
  const parts = weekStartDate.split('-').map(Number);
  const [year, month, day] = parts;

  if (parts.length !== 3 || !year || !month || !day) return [];

  return Array.from({ length: 7 }, (_, offset) =>
    formatDateParts(new Date(year, month - 1, day + offset)),
  );
}
