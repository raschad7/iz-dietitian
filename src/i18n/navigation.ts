/**
 * Locale-aware replacements for the `next/navigation` primitives. Always import
 * `Link`, `redirect`, `usePathname` and `useRouter` from here so that the active
 * locale prefix is preserved automatically — and, for the two that move the
 * reader, so that the navigation progress bar is armed. See
 * `navigation-client.tsx` for the wrappers and
 * `components/layout/navigation-progress.tsx` for the bar itself.
 */
export { redirect, usePathname, getPathname } from './navigation-base';
export { Link, useRouter } from './navigation-client';
