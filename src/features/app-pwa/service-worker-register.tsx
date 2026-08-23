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
 * in `public/app-sw.js`.
 *
 * A registration is keyed by its **scope**, not by its script URL, so this
 * replaces an existing registration rather than adding a second one beside it.
 */
const SCRIPT_URL =
  process.env.NODE_ENV === 'production' ? '/app-sw.js' : '/app-sw.js?dev=1';

/**
 * Registers `public/app-sw.js`, scoped to this locale's `/app` tree — the
 * staff-side counterpart to `features/portal/pwa/service-worker-register.tsx`.
 *
 * Two workers on one origin is fine and intended: their scopes (`/{locale}/app`
 * and `/{locale}/portal`) do not overlap, so neither ever controls the other's
 * pages. What they *do* share is the origin's `caches` storage, which is why
 * each one only ever deletes keys carrying its own prefix — see the note above
 * `CACHE_PREFIX` in either worker.
 *
 * Renders nothing; a plain `useEffect` rather than a library, since the only
 * job is a one-line registration call.
 *
 * ⚠ **No trailing slash on the scope.** A service worker scope is matched as a
 * literal string prefix, not per path segment: `'/ar/app'` does not start with
 * `'/ar/app/'`, so a trailing slash here would leave the manifest's own
 * `start_url` — the one URL the installed app launches on — uncontrolled, and
 * Chromium decides installability against `start_url`. That exact mismatch is
 * what kept the client portal from ever firing `beforeinstallprompt`. This
 * string and `start_url` in `app/manifest.webmanifest/route.ts` must stay
 * written the same way.
 */
export function ServiceWorkerRegister({ locale }: { locale: string }) {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register(SCRIPT_URL, { scope: `/${locale}/app` }).catch(() => {
      // Best-effort only: a failed registration should never block the staff
      // app from working without a service worker.
    });
  }, [locale]);

  return null;
}
