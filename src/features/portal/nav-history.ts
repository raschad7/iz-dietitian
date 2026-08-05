/**
 * The client's own record of which portal path came before the current one.
 *
 * Browser history does not expose the URL of the entry behind the current
 * one, and `document.referrer` never changes across a client-side
 * navigation — so neither can tell `PortalScreenHeader` where a client
 * actually came from before it lands back on a screen after a locale
 * `redirect('replace')`. This is a small `sessionStorage` log of exactly
 * that, kept locale-free (paths come from `usePathname` in `@/i18n/navigation`,
 * which already strips it) so the path can be reopened in whichever locale is
 * active when the client backs out.
 */

const CURRENT_KEY = 'portal:nav:current';
const PREVIOUS_KEY = 'portal:nav:previous';

/** Called on every portal page's mount, from both of its header components. */
export function recordPortalVisit(pathname: string): void {
  if (typeof window === 'undefined') return;

  const current = window.sessionStorage.getItem(CURRENT_KEY);
  if (current === pathname) return;

  if (current) window.sessionStorage.setItem(PREVIOUS_KEY, current);
  window.sessionStorage.setItem(CURRENT_KEY, pathname);
}

/** The path open right before the current one, if this log has one. */
export function getPreviousPortalPath(): string | null {
  if (typeof window === 'undefined') return null;

  return window.sessionStorage.getItem(PREVIOUS_KEY);
}
