'use client';

import { INSTALL_PROMPT_EVENT, INSTALL_PROMPT_GLOBAL } from './install-prompt-globals';

/**
 * Catches Chromium's `beforeinstallprompt` before React can miss it.
 *
 * ## The bug this fixes
 *
 * `beforeinstallprompt` fires **once**, and it fires as soon as the browser has
 * fetched the manifest and decided the page is installable — which on a warm
 * cache is well before a Next.js document has hydrated. `useInstallPrompt`
 * attaches its listener from a `useEffect`, i.e. after hydration, so on most
 * real visits the event had already come and gone by the time anything was
 * listening. The captured prompt was therefore `null`, `installAction`
 * resolved to `'unavailable'`, and both install surfaces fell back to their
 * "not available right now" state on a browser that was in fact perfectly
 * ready to install. It looked like an installability failure and was actually
 * a timing failure.
 *
 * ## Why there is no `<script>` here any more
 *
 * The listener has to be attached before hydration, and the obvious way to do
 * that is an inline `<script>` in `<head>`. It works, and it is noisy: React
 * logs "Encountered a script tag while rendering React component" every time a
 * `<script>` element is produced by a *client* render, because such a script is
 * never executed. Two attempts to place that tag somewhere quiet both failed:
 *
 * - **Moving it to the root layout's `<head>`.** The premise was that a root
 *   layout renders on the server and afterwards only hydrates. It does not: a
 *   root layout re-renders on the client on every Fast Refresh in development,
 *   and on any `router.refresh()` — which this app calls, from the intake
 *   dialog among others. The warning simply moved.
 * - **`next/script` with `strategy="beforeInteractive"`.** Next serialises the
 *   snippet into `self.__next_s`, but the element carrying that push is still a
 *   `<script>` that React renders, so React still warns — from inside
 *   `<Script>` instead of from here.
 *
 * The tag is what React objects to, so there is no longer a tag. This module is
 * a client module, and the two `addEventListener` calls below run when its
 * chunk is evaluated — during the client bundle's bootstrap, before React
 * begins hydrating and long before any `useEffect`. That is the same moment the
 * `__next_s` queue was being drained at, reached without asking React to render
 * an element it refuses to execute.
 *
 * The component itself renders `null`. It stays a component, and stays mounted
 * from the root layout, so that this module is part of the initial chunk for
 * every page rather than something a bundler could decide to defer.
 *
 * ## The handoff
 *
 * The event is stashed on `window` under {@link INSTALL_PROMPT_GLOBAL} and a
 * {@link INSTALL_PROMPT_EVENT} notification is dispatched. `useInstallPrompt`
 * reads the stash on mount (covering "fired before hydration") *and* listens
 * for both the notification and the native event (covering "fires after"), so
 * whichever order the two happen in, the prompt is found exactly once. The
 * stash is cleared on `appinstalled` so a consumed prompt is never re-offered.
 *
 * `preventDefault()` here rather than in the hook, because it has to happen
 * inside the original event dispatch to suppress Chrome's own mini-infobar —
 * doing it later, from a stored reference, is too late.
 */

/**
 * Guards the attach against running twice on one `window`.
 *
 * A module body executes once per module instance, which is normally once per
 * document — but a Fast Refresh re-evaluates it, and a second copy of these
 * listeners would `preventDefault()` an event that had already been stashed.
 * The flag lives on `window` rather than in a module variable for exactly that
 * reason: the module is what gets replaced.
 */
const ATTACHED = '__izInstallPromptCaptureAttached';

if (typeof window !== 'undefined') {
  const store = window as unknown as Record<string, unknown>;

  if (!store[ATTACHED]) {
    store[ATTACHED] = true;

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      store[INSTALL_PROMPT_GLOBAL] = event;
      window.dispatchEvent(new Event(INSTALL_PROMPT_EVENT));
    });

    window.addEventListener('appinstalled', () => {
      store[INSTALL_PROMPT_GLOBAL] = null;
    });
  }
}

export function InstallPromptCapture() {
  return null;
}
