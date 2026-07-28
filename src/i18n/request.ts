import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';

import { DISPLAY_TIME_ZONE, intlFormats } from '@/lib/format';

import { routing, type Locale } from './routing';

/**
 * Explicit map rather than a template-literal dynamic import: the bundler can
 * see every message file, and TypeScript keeps them typed.
 */
const messageLoaders = {
  ar: () => import('./messages/ar.json'),
  en: () => import('./messages/en.json'),
} satisfies Record<Locale, () => Promise<{ default: unknown }>>;

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await messageLoaders[locale]()).default,
    // Stored instants are UTC; everything is rendered in one clinic time zone.
    timeZone: DISPLAY_TIME_ZONE,
    now: new Date(),
    formats: intlFormats,
  };
});
