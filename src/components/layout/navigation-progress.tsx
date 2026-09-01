'use client';

import NProgress from 'nprogress';
/*
  `next/navigation`, and this is the one file in the app allowed to reach past
  `@/i18n/navigation` for it.

  next-intl's `usePathname` strips the locale prefix, which is exactly right for
  comparing a route against `/app/clients` and exactly wrong here: switching
  language is a full navigation, and `/ar/app` → `/en/app` reads as *no change*
  once the prefix is gone. This file is asking "did the router land somewhere
  new", so it wants the address bar's own answer.
*/
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

/**
 * How long a navigation has to still be running before the bar is drawn.
 *
 * Most navigations in this app are a prefetched route away and commit inside a
 * frame or two. A bar that flashed on those would be noise on the majority of
 * clicks to signal the minority — so the start is *armed*, not drawn, and a
 * navigation that beats the delay finishes without ever having shown anything.
 *
 * 80ms is under the ~100ms at which a response stops reading as instant, so
 * nothing that felt immediate grows a progress bar, and anything that did not
 * has one before the reader starts wondering.
 */
const APPEAR_AFTER_MS = 80;

/**
 * The longest the bar will trickle before it gives up and completes.
 *
 * The bar is finished by the route changing underneath it. A navigation that
 * lands on the address it started from — the same `?page=2` clicked twice —
 * never changes it, so without a ceiling the bar would trickle for the rest of
 * the session. Ten seconds is past any navigation this app has; a route slower
 * than that has a spinner on screen saying so, which is the better signal
 * anyway.
 */
const GIVE_UP_AFTER_MS = 10_000;

/*
  Module state rather than a context, because the two halves of this are not in
  the same tree: `startNavigationProgress` is called from a link's click handler
  anywhere in either app, and the component that finishes it is mounted once at
  the root. A provider spanning both would be a provider around the whole
  product for two booleans.
*/
let configured = false;
let appearTimer: ReturnType<typeof setTimeout> | undefined;
let giveUpTimer: ReturnType<typeof setTimeout> | undefined;
let drawn = false;

/**
 * nprogress ships no styles of its own — `#nprogress .bar` is ours, in
 * `globals.css`, on the app's tokens and flipped for Arabic. Only the timing
 * lives here.
 */
function configureOnce(): void {
  if (configured) return;

  NProgress.configure({
    /*
      No spinner. nprogress puts one in the far top corner, which on this
      product is where the notification bell sits on every staff screen — a
      second spinning glyph next to it reads as the bell doing something.
      The bar alone says what there is to say.
    */
    showSpinner: false,
    /*
      The bar appears already a fifth of the way across. It has been waiting out
      `APPEAR_AFTER_MS` by the time it is drawn, so starting at zero would
      understate how far along the navigation is — and a bar that begins as a
      few pixels in the corner is easy to miss entirely.
    */
    minimum: 0.2,
    trickleSpeed: 160,
    speed: 260,
    // The app's own curve, not nprogress's `ease` — this is written into an
    // inline `transition`, where a custom property resolves normally.
    easing: 'var(--ease-sweep)',
  });

  configured = true;
}

/**
 * Arm the bar for a navigation that is about to start.
 *
 * Called from the wrapped `Link` and `useRouter` in `@/i18n/navigation`, so no
 * call site has to remember it. Safe to call while a bar is already running: a
 * reader who clicks through three screens gets one bar that keeps going, not
 * three that restart each other.
 */
export function startNavigationProgress(): void {
  configureOnce();
  if (drawn || appearTimer !== undefined) return;

  appearTimer = setTimeout(() => {
    appearTimer = undefined;
    drawn = true;
    NProgress.start();
    giveUpTimer = setTimeout(finishNavigationProgress, GIVE_UP_AFTER_MS);
  }, APPEAR_AFTER_MS);
}

/**
 * Run the bar out to the end and take it off the page.
 *
 * A navigation that never got as far as being drawn is simply disarmed, which
 * is the whole point of the delay above.
 */
export function finishNavigationProgress(): void {
  if (appearTimer !== undefined) {
    clearTimeout(appearTimer);
    appearTimer = undefined;
  }

  if (giveUpTimer !== undefined) {
    clearTimeout(giveUpTimer);
    giveUpTimer = undefined;
  }

  if (drawn) {
    drawn = false;
    NProgress.done();
  }
}

/**
 * Watches the address bar and finishes the bar when it moves.
 *
 * **The bar ends when the reader arrives, not when the page is full.** With a
 * `loading.tsx` boundary on the route, arriving means that route's spinner —
 * and that is the right place to stop: the bar's job is the gap between
 * clicking and being somewhere, and from the spinner onwards the page itself
 * is saying that something is still on its way. Two loading indicators for one
 * wait is one too many, and a trickling bar above a turning spinner is the
 * worst pairing of the two — the same message at two different speeds.
 *
 * The search string is watched alongside the path because half the navigations
 * in the staff app are query-string ones — `?view=week`, `?status=archived`,
 * every keystroke of the client search — and each is a real round trip to the
 * server that the path alone would never see end.
 */
function NavigationProgressWatcher() {
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    finishNavigationProgress();
  }, [pathname, search]);

  // Nothing should outlive the tree that started it — a bar left running by an
  // unmount would have no one left to finish it.
  useEffect(() => finishNavigationProgress, []);

  return null;
}

/**
 * The navigation progress bar, mounted once for the whole product.
 *
 * Renders no markup of its own: nprogress appends `#nprogress` to `<body>` when
 * a navigation is slow enough to need it and removes it again afterwards, so
 * there is nothing on the page at rest.
 *
 * The `Suspense` is not optional. `useSearchParams` suspends during a static
 * prerender, and without a boundary of its own that would be the whole document
 * waiting on it.
 */
export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressWatcher />
    </Suspense>
  );
}
