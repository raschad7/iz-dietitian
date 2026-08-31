import { createNavigation } from 'next-intl/navigation';

import { routing } from './routing';

/**
 * next-intl's locale-aware primitives, before this app wraps them.
 *
 * **Import from `@/i18n/navigation`, not from here.** `Link` and `useRouter`
 * are re-exported there with the navigation progress bar attached, and a call
 * site that reaches past that gets a navigation with no feedback on it. This
 * module exists only so that the wrapper and the facade can each see the
 * originals without importing each other.
 */
export const {
  Link: IntlLink,
  redirect,
  usePathname,
  useRouter: useIntlRouter,
  getPathname,
} = createNavigation(routing);
