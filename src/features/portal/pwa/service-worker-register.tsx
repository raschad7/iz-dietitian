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

    navigator.serviceWorker
      .register(SCRIPT_URL, { scope: `/${locale}/portal/` })
      .catch(() => {
        // Best-effort only: a failed registration should never block the
        // portal from working without a service worker.
      });
  }, [locale]);

  return null;
}
