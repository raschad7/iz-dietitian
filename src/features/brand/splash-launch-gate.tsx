import { headers } from 'next/headers';

import { SplashScreen } from './splash-screen';

/**
 * Decides whether this document load gets the launch screen, on the server.
 *
 * ## Why the server, when the tile is a client component
 *
 * The rule asked for is "a hard reload plays it, a quick reload does not", and
 * **the browser does not tell JavaScript which kind of reload it was.**
 * `PerformanceNavigationTiming.type` reports `reload` for both, with no
 * cache-bypass flag anywhere on the entry. Every client-side trick for it is a
 * heuristic — the service worker being bypassed (Chromium-only, and only under
 * `/app` and `/portal` where a worker is registered), or subresource
 * `transferSize` (unavailable at parse time, and wrong in dev, where nothing is
 * cached). Neither is something to hang a full-screen surface on.
 *
 * The request itself says it plainly, though, and only the server can hear it.
 * Browsers advertise their intent toward the cache in the navigation request:
 *
 * | Load                              | `Cache-Control` request header |
 * | --------------------------------- | ------------------------------ |
 * | Fresh visit, PWA launch, a link   | *(absent)*                     |
 * | Quick reload (F5, ⌘R)             | `max-age=0`                    |
 * | Hard reload (Ctrl/⇧⌘ + Shift + R) | `no-cache` (+ `Pragma`)        |
 *
 * So the decision is made before a byte of HTML is written, and a load that
 * should not play it simply has no tile in its markup. That is also why there
 * is no `display: none` gate in `globals.css` any more and no inline script in
 * the tile: nothing can flash if nothing was sent.
 *
 * ## ⚠ The cost, which is real
 *
 * `headers()` is a Dynamic API, so reading it here opts every route in the app
 * out of static rendering — including the landing and sign-in screens, which
 * `resolveLocale`'s `setRequestLocale` had deliberately made static. Everything
 * behind a session guard was already dynamic (those read cookies), so the change
 * lands on a handful of small public pages. It is a deliberate trade, made
 * because no client-side approach answers the question correctly; if the splash
 * rule is ever relaxed, delete this file and mount `SplashScreen` directly to
 * get static rendering back.
 *
 * ## What this does not decide
 *
 * Only *document loads* reach here. Signing in, signing up, signing out and
 * every route change are client-side navigations that never re-render this, so
 * they cannot play the tile — and a locale switch, which does re-render it,
 * is caught by `playedInThisDocument` inside `SplashScreen`.
 *
 * ## Coverage
 *
 * Chrome, Edge and Firefox all send `max-age=0` for a quick reload and
 * `no-cache` for a hard one. Safari is less consistent about the hard-reload
 * header; where it sends neither, its reloads read as quick ones and stay quiet,
 * which is the safe direction to be wrong in.
 */
export async function SplashLaunchGate({ locale }: { locale: string }) {
  const requestHeaders = await headers();

  const cacheControl = requestHeaders.get('cache-control') ?? '';
  const pragma = requestHeaders.get('pragma') ?? '';

  /*
    A hard reload announces itself as `no-cache` on either header — `Pragma` is
    the HTTP/1.0 spelling and some browsers still send both. Matched as a
    substring because the value can carry more than one directive.
  */
  const isHardReload = cacheControl.includes('no-cache') || pragma.includes('no-cache');

  /*
    No `Cache-Control` at all means the browser was not reloading anything: a
    typed URL, a link, or the installed PWA being launched. That is the app
    starting, so it plays — the tile would otherwise never be seen by anyone who
    had not thought to press Ctrl+Shift+R.

    A quick reload is the remaining case (`max-age=0` without `no-cache`), and it
    is the one that must stay quiet.
  */
  const isFreshVisit = cacheControl === '';

  if (!isHardReload && !isFreshVisit) return null;

  return <SplashScreen locale={locale} />;
}
