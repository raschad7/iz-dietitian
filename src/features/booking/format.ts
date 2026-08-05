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

/** `9:15 AM` / `٩:١٥ ص` — but with Western digits, per the project's rule. */
export function formatMinute(locale: Locale, date: IsoDate, minute: number): string {
  return formatter(locale, { timeStyle: 'short' }).format(toUtcInstant(date, minute));
}

/** `9:15 AM – 10:00 AM`, using the locale's own range separator. */
export function formatMinuteRange(locale: Locale, date: IsoDate, startMinute: number, endMinute: number): string {
  return formatter(locale, { timeStyle: 'short' }).formatRange(
    toUtcInstant(date, startMinute),
    toUtcInstant(date, endMinute),
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
  return formatter(locale, { dateStyle: 'medium' }).formatRange(toUtcInstant(from), toUtcInstant(to));
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
