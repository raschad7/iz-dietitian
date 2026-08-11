import { formatList, toIntlLocale } from '@/lib/format';
import { type Locale } from '@/i18n/routing';

/**
 * Turning a clinic's three opening-hours columns into the line a client reads.
 *
 * Pure and Next-free, so the run-collapsing below is testable without a
 * database or a render — `clinic-hours.test.ts` is the whole point of the split.
 *
 * Times here are a **wall clock with no date**: `open_minute` is 08:00 at the
 * clinic, every day, forever. So this formats them the way
 * `src/features/booking/format.ts` formats an appointment — packed into a
 * `Date`'s UTC fields and read back in UTC, which returns the same digits on
 * any machine — rather than through `src/lib/format.ts`, which renders a real
 * instant in a real zone.
 */

/** Milliseconds in a day, for stepping the reference week. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A Sunday, in UTC. Weekday numbers in this app follow `Date#getDay()`, where
 * 0 is Sunday, so this is the origin every weekday name is counted from.
 *
 * Naming the days from `Intl` rather than from the message files is deliberate:
 * a weekday is not product copy, both locales already know all seven, and a
 * hand-translated list is one more pair of strings that can drift.
 */
const REFERENCE_SUNDAY = Date.UTC(2024, 0, 7);

const UTC_DEFAULTS = { numberingSystem: 'latn', calendar: 'gregory', timeZone: 'UTC' } as const;

/** `الأحد` / `Sunday`, for a weekday number 0–6. */
export function weekdayName(locale: Locale, weekday: number, style: 'long' | 'short' = 'long'): string {
  return new Intl.DateTimeFormat(toIntlLocale(locale), { weekday: style, ...UTC_DEFAULTS }).format(
    new Date(REFERENCE_SUNDAY + weekday * DAY_MS),
  );
}

/** `08:00` — minutes from local midnight, in the locale's clock convention. */
export function formatClockMinute(locale: Locale, minute: number): string {
  return new Intl.DateTimeFormat(toIntlLocale(locale), { timeStyle: 'short', ...UTC_DEFAULTS }).format(
    new Date(REFERENCE_SUNDAY + minute * 60 * 1000),
  );
}

/** A stretch of consecutive open days, inclusive at both ends. */
export type WeekdayRun = { from: number; to: number };

/**
 * Collapses open weekdays into consecutive runs, so Sunday–Thursday reads as
 * one range rather than as five names.
 *
 * The week is treated as a **circle**: a clinic open Friday, Saturday and
 * Sunday is open for three days in a row, and listing that as "Sunday, Friday,
 * Saturday" would be technically ordered and practically wrong. So a run
 * ending on Saturday joins one starting on Sunday, and the result can begin at
 * a higher number than it ends at — `{ from: 5, to: 0 }` is Friday to Sunday.
 *
 * The one case that cannot wrap is a full week: seven days have no boundary to
 * start at, so they report as a single run from Sunday to Saturday.
 */
export function weekdayRuns(workingDays: readonly number[]): WeekdayRun[] {
  const open = [...new Set(workingDays)].filter((day) => Number.isInteger(day) && day >= 0 && day <= 6).sort((a, b) => a - b);

  if (open.length === 0) return [];
  if (open.length === 7) return [{ from: 0, to: 6 }];

  const runs: WeekdayRun[] = [];

  for (const day of open) {
    const last = runs.at(-1);

    if (last && day === last.to + 1) {
      last.to = day;
    } else {
      runs.push({ from: day, to: day });
    }
  }

  // Saturday and Sunday are adjacent on the circle but at opposite ends of the
  // sorted list, so the join has to happen after the linear pass.
  const first = runs[0];
  const last = runs.at(-1);

  if (runs.length > 1 && first && last && first.from === 0 && last.to === 6) {
    first.from = last.from;
    runs.pop();
  }

  return runs;
}

/**
 * `الأحد – الخميس`, or `الأحد` for a single day.
 *
 * An en dash rather than a hyphen: this is a range, and the glyph reads the
 * same in both scripts.
 */
export function formatWeekdayRun(locale: Locale, run: { from: number; to: number }): string {
  return run.from === run.to
    ? weekdayName(locale, run.from)
    : `${weekdayName(locale, run.from)} – ${weekdayName(locale, run.to)}`;
}

/** `الأحد – الخميس`, or `الأحد` for a single day. Empty when the clinic lists no open days. */
export function formatWorkingDays(locale: Locale, workingDays: readonly number[]): string {
  const runs = weekdayRuns(workingDays);

  if (runs.length === 0) return '';

  // `formatList` supplies the locale's own separator — `، ` and `و` in Arabic,
  // a comma and `and` in English — so a clinic with two separate stretches
  // reads as a sentence in both.
  return formatList(
    locale,
    runs.map((run) => formatWeekdayRun(locale, run)),
  );
}

/**
 * One weekday's opening range, shaped structurally rather than imported from
 * `@/features/clinic-profile/types`, so this module stays pure and dependency
 * free — the same reason the rest of the file takes plain numbers.
 */
export type DayHours = {
  weekday: number;
  isWorking: boolean;
  openMinute: number | null;
  closeMinute: number | null;
};

/** A stretch of consecutive open days that all keep the *same* hours. */
export type HoursRun = { from: number; to: number; openMinute: number; closeMinute: number };

/**
 * Collapses a seven-day schedule into the fewest lines that state it exactly.
 *
 * `weekdayRuns` above answers "which days is the clinic open?" and is used
 * where a single envelope is all there is. This answers the question a client
 * actually asks — "when am I seen, on the day I am coming?" — which the
 * envelope cannot: `clinics.open_minute` and `close_minute` are the *minimum
 * open and maximum close across the week* (see `scheduleEnvelope`), so a clinic
 * open 08:00–14:00 on Sunday and 10:00–18:00 on Monday reports 08:00–18:00, a
 * range that describes neither day. Splitting by hours is what stops the screen
 * stating a time the clinic is shut.
 *
 * A run breaks on a gap in the days **or** on a change of hours, so
 * Sunday–Thursday at one time is one line, and a Saturday that closes early is
 * its own. Closed days are dropped rather than listed: the card names the days
 * it is open, and the absent ones are the answer to the rest.
 *
 * The week wraps exactly as `weekdayRuns` describes — a run ending Saturday
 * joins one starting Sunday, but only when the hours match too.
 */
export function workingHourRuns(days: readonly DayHours[]): HoursRun[] {
  const open = days
    .filter(
      (day): day is DayHours & { openMinute: number; closeMinute: number } =>
        day.isWorking &&
        day.openMinute !== null &&
        day.closeMinute !== null &&
        Number.isInteger(day.weekday) &&
        day.weekday >= 0 &&
        day.weekday <= 6,
    )
    .sort((a, b) => a.weekday - b.weekday);

  const runs: HoursRun[] = [];

  for (const day of open) {
    const last = runs.at(-1);

    if (
      last &&
      day.weekday === last.to + 1 &&
      day.openMinute === last.openMinute &&
      day.closeMinute === last.closeMinute
    ) {
      last.to = day.weekday;
    } else {
      runs.push({
        from: day.weekday,
        to: day.weekday,
        openMinute: day.openMinute,
        closeMinute: day.closeMinute,
      });
    }
  }

  const first = runs[0];
  const last = runs.at(-1);

  if (
    runs.length > 1 &&
    first &&
    last &&
    first.from === 0 &&
    last.to === 6 &&
    first.openMinute === last.openMinute &&
    first.closeMinute === last.closeMinute
  ) {
    first.from = last.from;
    runs.pop();
  }

  return runs;
}
