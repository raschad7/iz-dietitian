import { toIntlLocale } from '@/lib/format';
import { type Locale } from '@/i18n/routing';

import { toUtcInstant, type IsoDate } from './date';

/**
 * Rendering appointment times and dates.
 *
 * These deliberately do **not** reuse `formatTime`/`formatDate` from
 * `src/lib/format.ts`. Those render a UTC *instant* in `Asia/Hebron`, which is
 * exactly right for a `timestamptz` — and exactly wrong here. An appointment
 * stores a wall clock, not an instant: 09:00 means 09:00, so the value is packed
 * into a `Date`'s UTC fields and read back with `timeZone: 'UTC'`, which returns
 * the same digits on any machine.
 *
 * Everything else is inherited: `toIntlLocale` supplies the `nu-latn` and
 * `ca-gregory` extensions, so Arabic gets Western digits and a Gregorian
 * calendar, as everywhere else in the app.
 */

const WALL_CLOCK_DEFAULTS = { numberingSystem: 'latn', calendar: 'gregory', timeZone: 'UTC' } as const;

function formatter(locale: Locale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(toIntlLocale(locale), { ...options, ...WALL_CLOCK_DEFAULTS });
}

/**
 * Collapses every Unicode space separator to a plain `U+0020`.
 *
 * **This is what stops `formatRange` causing a hydration mismatch**, and it is
 * not hypothetical tidying. `Intl` reads its separators from whichever ICU the
 * runtime was built against, and Node's and the browser's are not the same
 * build — the English range separator is a thin space (`U+2009`) on ICU 78 and
 * an ordinary space on the ICU Chrome currently ships:
 *
 * ```text
 * server  Aug 2 <U+2009> – <U+2009> 8, 2026
 * client  Aug 2 <U+0020> – <U+0020> 8, 2026
 * ```
 *
 * The two render identically and compare unequal, so React throws away the
 * server's markup for that subtree and redraws it. Nothing *looks* wrong, which
 * is exactly why it survived: the bug is invisible until you print codepoints.
 *
 * Only the range formatters need it — every single-value formatter here was
 * checked and agrees byte for byte on both runtimes — but it is applied through
 * one helper so a third range never has to remember.
 *
 * The whole `Zs` category rather than just `U+2009`, so a future ICU picking a
 * different width is already handled. `U+200F` (right-to-left mark) is `Cf`,
 * not `Zs`, so Arabic keeps the marks that make its dates read correctly.
 */
function withStableSpaces(value: string): string {
  return value.replace(/\p{Zs}/gu, ' ');
}

/** `9:15 AM` / `٩:١٥ ص` — but with Western digits, per the project's rule. */
export function formatMinute(locale: Locale, date: IsoDate, minute: number): string {
  return formatter(locale, { timeStyle: 'short' }).format(toUtcInstant(date, minute));
}

/** `9:15 AM – 10:00 AM`, using the locale's own range separator. */
export function formatMinuteRange(locale: Locale, date: IsoDate, startMinute: number, endMinute: number): string {
  return withStableSpaces(
    formatter(locale, { timeStyle: 'short' }).formatRange(
      toUtcInstant(date, startMinute),
      toUtcInstant(date, endMinute),
    ),
  );
}

/**
 * `9:15 AM – 10:00 AM`, always in English AM/PM regardless of locale.
 *
 * The dashboard agenda card is read at a glance rather than translated for a
 * client, so "ص"/"م" bought nothing there but an unfamiliar mark next to a
 * time everyone already reads in Western digits. Locale-facing surfaces
 * (calendar, portal, WhatsApp) keep using `formatMinuteRange` — the day
 * period there is not decoration, it is content someone reads.
 */
export function formatMinuteRangeLatin(date: IsoDate, startMinute: number, endMinute: number): string {
  return new Intl.DateTimeFormat('en-US', { timeStyle: 'short', ...WALL_CLOCK_DEFAULTS }).formatRange(
    toUtcInstant(date, startMinute),
    toUtcInstant(date, endMinute),
  );
}

/** `5 – 11 August 2026`, collapsed by the locale's own range rules. */
export function formatMediumDateRange(locale: Locale, from: IsoDate, to: IsoDate): string {
  return withStableSpaces(
    formatter(locale, { dateStyle: 'medium' }).formatRange(toUtcInstant(from), toUtcInstant(to)),
  );
}

/** `5 August 2026` — the long form the appointment popup header shows. */
export function formatLongDate(locale: Locale, date: IsoDate): string {
  return formatter(locale, { dateStyle: 'long' }).format(toUtcInstant(date));
}

export function formatMediumDate(locale: Locale, date: IsoDate): string {
  return formatter(locale, { dateStyle: 'medium' }).format(toUtcInstant(date));
}

/** `Wed` — the weekday strip above a week view. */
export function formatWeekday(locale: Locale, date: IsoDate, weekday: 'short' | 'long' = 'short'): string {
  return formatter(locale, { weekday }).format(toUtcInstant(date));
}

/** `5` — the day number in a month cell. */
export function formatDayNumber(locale: Locale, date: IsoDate): string {
  return formatter(locale, { day: 'numeric' }).format(toUtcInstant(date));
}

/** `August 2026` — the calendar's current-range heading. */
export function formatMonthYear(locale: Locale, date: IsoDate): string {
  return formatter(locale, { month: 'long', year: 'numeric' }).format(toUtcInstant(date));
}

/**
 * `1 hr 30 min`, assembled from translated units rather than `Intl.DurationFormat`,
 * which is not available across the runtimes this project targets.
 */
export function formatDuration(
  minutes: number,
  labels: { hour: (n: number) => string; minute: (n: number) => string },
): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) return labels.minute(rest);
  if (rest === 0) return labels.hour(hours);
  return `${labels.hour(hours)} ${labels.minute(rest)}`;
}

/**
 * Re-exported so the calendar's existing call sites keep importing it from
 * here; the implementation moved to `@/lib/initials` when the dashboard's
 * shared `Avatar` needed it too.
 */
export { initialsOf } from '@/lib/initials';
