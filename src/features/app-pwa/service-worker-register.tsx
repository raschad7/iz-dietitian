'use client';

import { useEffect } from 'react';

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

    navigator.serviceWorker.register('/app-sw.js', { scope: `/${locale}/app` }).catch(() => {
      // Best-effort only: a failed registration should never block the staff
      // app from working without a service worker.
    });
  }, [locale]);

  return null;
}
