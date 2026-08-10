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

/**
 * `August 10, 2026 – August 16, 2026` / `10 أغسطس 2026 – 16 أغسطس 2026`.
 *
 * Both ends in full, each formatted on its own and joined here.
 *
 * This replaced a `dateStyle: 'medium'` range, and neither half of that was
 * right. "Medium" is not the same idea in the two locales: English medium is
 * `Aug 15, 2026`, a month *name*, while Arabic medium is `15‏/08‏/2026`, all
 * digits — so the toolbar read `10‏/8‏/2026 – 16‏/8‏/2026`, two numbers to
 * decode before you know which week is on screen, in the one control whose job
 * is to say where you are.
 *
 * And `formatRange` collapses what the two ends share, giving `10–16 أغسطس
 * 2026`. That is the tighter typography, but it makes the two dates read as one
 * smeared thing rather than as a start and an end; spelled out, the label says
 * plainly what the first day is and what the last day is.
 *
 * No `withStableSpaces` here, and none needed: that guard exists for the
 * separator `formatRange` inserts, which differs between the server's ICU and
 * the browser's. The separator below is ours, and the single-value formatter
 * either side of it agrees byte for byte on both runtimes.
 */
export function formatLongDateRange(locale: Locale, from: IsoDate, to: IsoDate): string {
  const format = formatter(locale, { dateStyle: 'long' });
  return `${format.format(toUtcInstant(from))} – ${format.format(toUtcInstant(to))}`;
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
 * `August` — the month on its own, for a date tile that already carries the day
 * number and the weekday and only needs the third piece.
 */
export function formatMonthName(locale: Locale, date: IsoDate): string {
  return formatter(locale, { month: 'long' }).format(toUtcInstant(date));
}

/**
 * `Aug` — the month abbreviated, for the date tile in a visit row.
 *
 * `Intl` rather than truncating {@link formatMonthName}: an abbreviation is not
 * a prefix. Arabic's short months are their own forms, and slicing three
 * characters off أغسطس would cut a word in half rather than shorten it.
 */
export function formatMonthShort(locale: Locale, date: IsoDate): string {
  return formatter(locale, { month: 'short' }).format(toUtcInstant(date));
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
