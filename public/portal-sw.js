/**
 * The client portal's service worker.
 *
 * This exists only to satisfy Android/Chrome's install-banner requirement of
 * a registered, controlling service worker — it deliberately does NOT cache
 * the app shell, any HTML page, or any `/api/` response. Every one of those
 * can carry a signed-in client's personal data (their plan, appointments,
 * notifications), and a stale cached copy served to the wrong moment — after
 * sign-out, on a shared device, after the clinic updates a record — is a
 * privacy bug, not a performance win. See CLAUDE.md: "Do NOT cache private
 * client data or authenticated API responses."
 *
 * The only thing cached is this file's own static, unauthenticated, brand
 * artwork (`/api/pwa-icons/*`, the manifest) — content that is identical for
 * every visitor and carries no session state.
 */

const STATIC_CACHE = 'portal-static-v1';

// Same-origin, unauthenticated, identical-for-everyone paths only. Never add
// `/api/`, `/portal` pages, or anything that varies by signed-in client here.
function isCacheableStaticAsset(url) {
  return url.origin === self.location.origin && (url.pathname.startsWith('/api/pwa-icons/') || url.pathname.endsWith('/manifest.webmanifest'));
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Never intercept anything but a same-origin GET — POSTs (form actions),
  // cross-origin requests, and non-GET methods pass straight through.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!isCacheableStaticAsset(url)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;

      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    })(),
  );
});
