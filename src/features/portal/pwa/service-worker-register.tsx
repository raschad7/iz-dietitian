'use client';

import { useEffect } from 'react';

/**
 * The worker's own URL, carrying whether this is a development build.
 *
 * The worker keeps `/_next/static/*` cache-first on the grounds that those URLs
 * are content-hashed and so can never go stale. `next dev` does not hash them —
 * it names a chunk after the modules in it — so in development that rule pins
 * every chunk to the first bytes the browser ever saw, and it holds them
 * through a restarted dev server, a deleted `.next` and a hard reload, none of
 * which are Cache Storage. A flag on the URL is how a static file in `public/`
 * with no build of its own gets told which it is; see `isImmutableBuildAsset`
 * in `public/portal-sw.js`.
 *
 * A registration is keyed by its **scope**, not by its script URL, so this
 * replaces an existing registration rather than adding a second one beside it.
 */
const SCRIPT_URL =
  process.env.NODE_ENV === 'production' ? '/portal-sw.js' : '/portal-sw.js?dev=1';

/**
 * Registers `public/portal-sw.js`, scoped to this locale's `/portal` tree —
 * mounted once from `portal/layout.tsx` so every portal page (including
 * `set-password`) is covered, and nothing outside `/portal` ever calls
 * `serviceWorker.register`, so the staff app is untouched.
 *
 * Renders nothing; a plain `useEffect` rather than a library, since the only
 * job is a one-line registration call. See `public/portal-sw.js` for what the
 * worker itself does (and deliberately does not cache).
 */
export function ServiceWorkerRegister({ locale }: { locale: string }) {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    /*
     * No trailing slash — it has to match the manifest's own `scope` and
     * `start_url` exactly (`/${locale}/portal`, see
     * `portal/manifest.webmanifest/route.ts`), or the registration covers a
     * different URL than the one Chromium checks for installability.
     *
     * Service-worker scope matching is a plain string prefix check, not a
     * directory-aware one: a scope of `/ar/portal/` does not cover the URL
     * `/ar/portal` (no trailing slash), because the shorter string can never
     * start with the longer one. `start_url` in the manifest has no trailing
     * slash, so a scope that adds one leaves `start_url` outside the
     * service worker's own scope — which means Chromium finds no
     * controlling service worker for it, one of the installability checks
     * fails silently, `beforeinstallprompt` never fires, and every surface
     * reading `useInstallPrompt()` reports the install action as
     * `'unavailable'` even though nothing else is wrong. `portal-sw.js`'s own
     * `scopeLocale()` comment already documented the scope this way; this
     * registration had drifted from it.
     */
    navigator.serviceWorker
      .register(SCRIPT_URL, { scope: `/${locale}/portal` })
      .catch(() => {
        // Best-effort only: a failed registration should never block the
        // portal from working without a service worker.
      });
  }, [locale]);

  return null;
}
