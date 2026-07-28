import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { routing, type Locale } from './routing';

/**
 * Next types the `[locale]` route param as a plain `string`. Every page and
 * layout under `src/app/[locale]/` runs it through here, which:
 *
 *  1. rejects unknown locales with a 404 rather than rendering half a page,
 *  2. enables static rendering for the segment (`setRequestLocale`),
 *  3. hands back the narrowed `Locale` union for everything downstream.
 */
export async function resolveLocale(params: Promise<{ locale: string }>): Promise<Locale> {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return locale;
}
