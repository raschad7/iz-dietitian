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
 * ⚠ This used to say that *only* document loads reach here. They do not: the
 * root layout is re-rendered for the router's own fetches too, and reading the
 * cache headers of one of those is how the tile came to play over a page
 * nobody had reloaded. The first guard in the body is what makes the sentence
 * above true; do not remove it.
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

  /*
    ⚠ **First: is this a document request at all?**

    The cache-header rule below only means anything for a navigation the browser
    made. This layout is also re-rendered for requests the App Router's own
    client makes — a route prefetch, a `router.refresh()`, and the tree that
    comes back when a Server Action calls `revalidatePath` — and *none of those
    carry a `Cache-Control` header*. Read without this guard they all look like
    `isFreshVisit`, so the gate answered "the app is starting" and put a tile
    into an RSC payload, which React then mounted over a running page.

    That is what played the launch screen on top of a client's record after
    "issue a new password": one `revalidatePath` in the action, a re-render of
    the tree from the root, and the splash arrived as data. `playedInThisDocument`
    was no defence — it is only armed by a tile that has actually played, and on
    a document that came up through a quick reload nothing ever had.

    Three signals, because one alone leaves a gap:

    - `RSC` is set on every router fetch — prefetch and navigation alike.
    - `Next-Action` is set on the Server Action POST, which is where a
      revalidating action re-renders the tree.
    - `Sec-Fetch-Dest` is the browser's own word for what it is fetching, and it
      says `document` for exactly the case this component exists for. Safari
      before 16.4 omits the `Sec-Fetch-*` family entirely, so an absent value is
      read as `document` and left to the two headers above — the same direction
      the coverage note errs in.
  */
  const isRouterFetch = requestHeaders.has('rsc') || requestHeaders.has('next-action');
  const fetchDest = requestHeaders.get('sec-fetch-dest') ?? 'document';

  if (isRouterFetch || fetchDest !== 'document') return null;

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
