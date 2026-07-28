import { defineRouting } from 'next-intl/routing';

/**
 * Both locales are first class. `ar` is the default: when a visitor expresses no
 * preference, Arabic wins.
 */
export const locales = ['ar', 'en'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale = 'ar' satisfies Locale;

/**
 * Text direction is a property of the locale, never of a component. Everything
 * that needs a direction reads it from here — do not hardcode `rtl`/`ltr`
 * anywhere else.
 */
const localeDirections = {
  ar: 'rtl',
  en: 'ltr',
} as const satisfies Record<Locale, 'rtl' | 'ltr'>;

export type Direction = (typeof localeDirections)[Locale];

export function getLocaleDirection(locale: Locale): Direction {
  return localeDirections[locale];
}

export const routing = defineRouting({
  locales,
  defaultLocale,
  // Every URL carries its locale, including the default one, so that `ar` and
  // `en` are equally addressable and cacheable.
  localePrefix: 'always',
  localeDetection: true,
  localeCookie: {
    name: 'NEXT_LOCALE',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  },
});
