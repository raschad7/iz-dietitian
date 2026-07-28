import { createNavigation } from 'next-intl/navigation';

import { routing } from './routing';

/**
 * Locale-aware replacements for the `next/navigation` primitives. Always import
 * `Link`, `redirect`, `usePathname` and `useRouter` from here so that the active
 * locale prefix is preserved automatically.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
