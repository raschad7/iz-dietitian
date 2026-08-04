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

/** `الأحد – الخميس`, or `الأحد` for a single day. Empty when the clinic lists no open days. */
export function formatWorkingDays(locale: Locale, workingDays: readonly number[]): string {
  const runs = weekdayRuns(workingDays);

  if (runs.length === 0) return '';

  // `formatList` supplies the locale's own separator — `، ` and `و` in Arabic,
  // a comma and `and` in English — so a clinic with two separate stretches
  // reads as a sentence in both.
  return formatList(
    locale,
    runs.map(({ from, to }) =>
      from === to
        ? weekdayName(locale, from)
        : // An en dash rather than a hyphen: this is a range, and the glyph
          // reads the same in both scripts.
          `${weekdayName(locale, from)} – ${weekdayName(locale, to)}`,
    ),
  );
}
