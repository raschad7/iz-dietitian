import { defineRouting } from 'next-intl/routing';

/**
 * Both locales are first class. `ar` is the default, and with `localeDetection`
 * off (see `routing` below) it is what every first-time visitor gets — the
 * browser's own language is not consulted.
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
  /*
   * Off: a first-time visitor lands on Arabic, whatever their browser asks for.
   *
   * With detection on, next-intl read `Accept-Language` before falling back to
   * `defaultLocale` — so anyone on an English-configured phone or laptop was
   * sent to `/en` and met the product in English. This is an Arabic product
   * first, and the language is a choice the visitor makes here, not one their
   * OS makes for them.
   *
   * A returning visitor is unaffected: `localeCookie` below still wins over
   * this, so once someone switches to English the switch sticks for a year.
   */
  localeDetection: false,
  localeCookie: {
    name: 'NEXT_LOCALE',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  },
});
