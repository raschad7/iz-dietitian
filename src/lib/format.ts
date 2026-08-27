import type { Locale } from '@/i18n/routing';

/**
 * All timestamps are stored in UTC. This is the single time zone every UTC
 * instant is rendered in.
 */
export const DISPLAY_TIME_ZONE = 'Asia/Hebron';

export const DEFAULT_CURRENCY = 'ILS';

/**
 * BCP 47 tags with explicit Unicode extensions:
 *  - `nu-latn`   → Western digits (0-9) in both locales, never Arabic-Indic.
 *  - `ca-gregory` → Gregorian calendar in both locales, never Hijri.
 *
 * Never pass a bare `'ar'` to an `Intl` constructor; the numbering system and
 * calendar would then depend on the runtime's CLDR defaults.
 */
const INTL_LOCALES = {
  ar: 'ar-u-nu-latn-ca-gregory',
  en: 'en-u-nu-latn-ca-gregory',
} as const satisfies Record<Locale, string>;

export function toIntlLocale(locale: Locale): string {
  return INTL_LOCALES[locale];
}

/**
 * Options forced onto every formatter, so a caller cannot accidentally opt back
 * into Arabic-Indic digits or a non-Gregorian calendar.
 */
const NUMBER_DEFAULTS = { numberingSystem: 'latn' } as const;
const DATE_DEFAULTS = { numberingSystem: 'latn', calendar: 'gregory', timeZone: DISPLAY_TIME_ZONE } as const;

export function formatNumber(
  locale: Locale,
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(toIntlLocale(locale), { ...options, ...NUMBER_DEFAULTS }).format(value);
}

export function formatCurrency(
  locale: Locale,
  value: number,
  currency: string = DEFAULT_CURRENCY,
  options?: Intl.NumberFormatOptions,
): string {
  return formatNumber(locale, value, {
    style: 'currency',
    currency,
    ...options,
  });
}

/**
 * The currency's symbol on its own — `₪`.
 *
 * Read out of `Intl` rather than written down, so a clinic that is ever given
 * a second currency gets its symbol from the same place its amounts come from,
 * and nobody has to remember a literal in a template somewhere.
 */
export function currencySymbol(locale: Locale, currency: string = DEFAULT_CURRENCY): string {
  const parts = new Intl.NumberFormat(toIntlLocale(locale), {
    style: 'currency',
    currency,
    ...NUMBER_DEFAULTS,
  }).formatToParts(0);

  return parts.find((part) => part.type === 'currency')?.value ?? currency;
}

export function formatPercent(locale: Locale, value: number, options?: Intl.NumberFormatOptions): string {
  return formatNumber(locale, value, { style: 'percent', maximumFractionDigits: 1, ...options });
}

/** Renders a UTC instant as a date in {@link DISPLAY_TIME_ZONE}. */
export function formatDate(
  locale: Locale,
  value: Date | string | number,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    dateStyle: 'medium',
    ...options,
    ...DATE_DEFAULTS,
  }).format(toDate(value));
}

/** Renders a UTC instant as a date + time in {@link DISPLAY_TIME_ZONE}. */
export function formatDateTime(
  locale: Locale,
  value: Date | string | number,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...options,
    ...DATE_DEFAULTS,
  }).format(toDate(value));
}

/**
 * The invisible direction marks `Intl` puts inside Arabic dates and amounts.
 *
 * `24‏/08‏/2026` carries a U+200F between each part and a shekel amount starts
 * with one. They tell a bidirectional text engine which way the run goes, and
 * in ordinary flowing text they are exactly right.
 *
 * They are wrong in two places, and both are places this app has: inside an
 * element that has already declared `dir="ltr"`, where the marks fight the
 * declaration and reorder the parts — `24/08/2026 3:22` comes out as
 * `2026 3:22/08/` — and inside a PDF, which has no bidi engine at all and no
 * glyph for the mark.
 */
const BIDI_MARKS = /[‎‏؜⁦-⁩]/g;

/**
 * Drops those marks. Use at the point a formatted value becomes visible inside
 * something whose direction is already fixed — never on flowing text, where the
 * marks are what make mixed scripts read correctly.
 */
export function stripBidiMarks(text: string): string {
  return text.replaceAll(BIDI_MARKS, '');
}

/**
 * A date as `24/08/2026` — day first, Latin digits, no direction marks, and the
 * same shape in both languages.
 *
 * **Assembled from parts rather than formatted.** `Intl` gives Arabic
 * `24/08/2026` and English `08/24/2026` for the same instant, and a ledger read
 * by the same staff in two languages must not swap the day and the month:
 * `08/09` and `09/08` are both real dates, and nothing in the row says which
 * reading was meant. Building the string from `formatToParts` fixes the order
 * for both, and the clinic's own convention is day first.
 *
 * It also arrives free of the marks {@link stripBidiMarks} exists to remove,
 * because nothing between the parts was written by `Intl`.
 *
 * For a date a reader meets in a sentence, use {@link formatDate} — a spelled
 * month is easier to read and cannot be misread as the day.
 */
export function formatDayMonthYear(locale: Locale, value: Date | string | number): string {
  const parts = new Intl.DateTimeFormat(toIntlLocale(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...DATE_DEFAULTS,
  }).formatToParts(toDate(value));

  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? '';

  return `${part('day')}/${part('month')}/${part('year')}`;
}

/** Renders a UTC instant as a time of day in {@link DISPLAY_TIME_ZONE}. */
export function formatTime(
  locale: Locale,
  value: Date | string | number,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    timeStyle: 'short',
    ...options,
    ...DATE_DEFAULTS,
  }).format(toDate(value));
}

export function formatRelativeTime(
  locale: Locale,
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  options?: Intl.RelativeTimeFormatOptions,
): string {
  return new Intl.RelativeTimeFormat(toIntlLocale(locale), {
    numeric: 'auto',
    ...options,
  }).format(value, unit);
}

/**
 * `3 hours ago` / `قبل ٣ ساعات` — the coarsest unit that still describes the
 * gap, so a two-day-old request does not read as "2880 minutes ago".
 *
 * `now` is a parameter rather than a `new Date()` inside, so a caller that
 * renders several of these stamps them all against one instant, and a test can
 * pin it.
 */
export function formatTimeAgo(locale: Locale, value: Date | string | number, now: Date): string {
  const minutes = Math.round((toDate(value).getTime() - now.getTime()) / 60_000);
  if (Math.abs(minutes) < 60) return formatRelativeTime(locale, minutes, 'minute');

  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatRelativeTime(locale, hours, 'hour');

  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return formatRelativeTime(locale, days, 'day');

  return formatRelativeTime(locale, Math.round(days / 30), 'month');
}

export function formatList(locale: Locale, values: readonly string[], options?: Intl.ListFormatOptions): string {
  return new Intl.ListFormat(toIntlLocale(locale), { style: 'long', type: 'conjunction', ...options }).format(values);
}

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Named formats handed to `next-intl` so that ICU arguments inside message
 * files (`{amount, number, currency}`) go through the same latn/Gregorian
 * settings as the helpers above.
 */
export const intlFormats = {
  number: {
    plain: { ...NUMBER_DEFAULTS, maximumFractionDigits: 2 },
    integer: { ...NUMBER_DEFAULTS, maximumFractionDigits: 0 },
    currency: { ...NUMBER_DEFAULTS, style: 'currency', currency: DEFAULT_CURRENCY },
    percent: { ...NUMBER_DEFAULTS, style: 'percent', maximumFractionDigits: 1 },
  },
  dateTime: {
    date: { ...DATE_DEFAULTS, dateStyle: 'medium' },
    dateLong: { ...DATE_DEFAULTS, dateStyle: 'long' },
    time: { ...DATE_DEFAULTS, timeStyle: 'short' },
    dateTime: { ...DATE_DEFAULTS, dateStyle: 'medium', timeStyle: 'short' },
  },
} as const;
