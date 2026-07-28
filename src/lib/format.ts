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
