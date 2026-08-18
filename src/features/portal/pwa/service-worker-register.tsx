'use client';

import { useEffect } from 'react';

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
      .register('/portal-sw.js', { scope: `/${locale}/portal/` })
      .catch(() => {
        // Best-effort only: a failed registration should never block the
        // portal from working without a service worker.
      });
  }, [locale]);

  return null;
}
