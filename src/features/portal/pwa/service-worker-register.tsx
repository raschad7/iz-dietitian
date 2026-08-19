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
 *
 * ⚠ **No trailing slash on the scope, and that is the whole point.** A service
 * worker scope is matched as a literal string prefix, not as a path segment:
 * with `/${locale}/portal/` the worker controlled every page *under* the
 * portal and not the portal itself, because `'/ar/portal'` does not start with
 * `'/ar/portal/'`. The manifest's `start_url` is exactly `/${locale}/portal`
 * (no trailing slash, and Next runs `trailingSlash: false` so nothing
 * redirects it into place), which meant the one URL the installed app opens on
 * was the one URL the worker did not control — and Chromium decides
 * installability against `start_url`, so `beforeinstallprompt` never fired and
 * the settings row sat on its "unavailable" state forever. The two strings
 * have to be written the same way; if `start_url` ever gains a trailing slash,
 * this must gain one with it.
 */
export function ServiceWorkerRegister({ locale }: { locale: string }) {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/portal-sw.js', { scope: `/${locale}/portal` })
      .catch(() => {
        // Best-effort only: a failed registration should never block the
        // portal from working without a service worker.
      });
  }, [locale]);

  return null;
}
