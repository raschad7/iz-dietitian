import type { routing } from '@/i18n/routing';

import type messages from '@/i18n/messages/ar.json';
import type { intlFormats } from '@/lib/format';

declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    /**
     * Arabic is the source of truth: message keys are typed from `ar.json`, so
     * a key that only exists in `en.json` is a type error, and a key added to
     * Arabic is immediately visible as missing everywhere it is used.
     */
    Messages: typeof messages;
    Formats: typeof intlFormats;
  }
}
