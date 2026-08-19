/**
 * The staff app's service worker.
 *
 * ## What it will not do, and why that has not changed
 *
 * It does **not** cache the app shell's HTML, any `/app` page, or any
 * `/api/` response. Every one of those can carry the clinic's own
 * data (every client record the clinic holds), and a stale cached copy
 * served at the wrong moment — after sign-out, on a shared device, after the
 * clinic updates a record — is a privacy bug, not a performance win. See
 * CLAUDE.md: "Do NOT cache private client data or authenticated API responses."
 *
 * ## What it does do
 *
 * Three things, none of which touch session state:
 *
 * 1. **Static brand artwork** (`/api/pwa-icons/*`, the manifest) — identical
 *    for every visitor, carries nothing personal. Cache-first.
 * 2. **Next's build assets** (`/_next/static/*`) — content-hashed and
 *    immutable, which is what makes them safe: a hashed URL names one exact
 *    build output, so a cached copy can never be *stale*, only unused. This is
 *    what stops an installed app from re-downloading its whole JS/CSS payload
 *    on a slow connection. Cache-first.
 * 3. **An offline fallback for navigations** — network-first, and the network
 *    response is passed straight through and never stored. Only when the
 *    network *fails* does the precached offline page get served, so the
 *    installed app shows its own branded "you're offline" screen instead of the
 *    browser's error page inside a chrome-less window with no way back. That
 *    error page was the single biggest thing between this and a real app.
 *
 * ⚠ The offline page is a **static file** (`app-offline-{ar,en}.html`), not
 * a Next route. A page that renders only when the network is gone cannot
 * depend on the server that is gone with it.
 */

/**
 * Every cache this worker owns starts with this. It is the guard on the
 * cleanup below and it is not decoration.
 *
 * ⚠ `caches` is **origin-wide**, not scoped to a service worker. This origin
 * runs two workers — this one and `portal-sw.js` — so a cleanup that deleted
 * every key `caches.keys()` returned would wipe the other app's caches out
 * from under it, whichever of the two activated last. Anything added here must
 * keep this prefix, and must never delete a key without it.
 */
const CACHE_PREFIX = 'staff-';

const STATIC_CACHE = `${CACHE_PREFIX}static-v2`;
const SHELL_CACHE = `${CACHE_PREFIX}shell-v2`;

const CURRENT_CACHES = [STATIC_CACHE, SHELL_CACHE];

/**
 * The locale this registration is scoped to, read off the worker's own scope
 * rather than passed in.
 *
 * `app/service-worker-register.tsx` registers with `scope: '/{locale}/app'`, so
 * `self.registration.scope` is the full URL of exactly that — the locale is
 * already here and does not need a second channel (a query string, an
 * `importScripts` config, a postMessage handshake) that could disagree with it.
 * Falls back to Arabic, the app's default locale, if the scope ever stops
 * matching.
 */
function scopeLocale() {
  const match = /\/([^/]+)\/app\/?$/.exec(self.registration.scope);
  return match && match[1] === 'en' ? 'en' : 'ar';
}

function offlineUrl() {
  return `/app-offline-${scopeLocale()}.html`;
}

/** Same-origin, unauthenticated, identical-for-everyone. Never `/app` pages. */
function isCacheableStaticAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/api/pwa-icons/') || url.pathname.endsWith('/manifest.webmanifest'))
  );
}

/**
 * Content-hashed build output. Safe to keep forever precisely because the hash
 * is in the filename — a new build produces new URLs rather than new contents
 * at old ones.
 */
function isImmutableBuildAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith('/_next/static/');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      /*
        Precached at install so it is already there the first time it is
        needed — fetching the offline page at the moment the network fails is
        the one time it is guaranteed not to arrive.
      */
      const cache = await caches.open(SHELL_CACHE);
      await cache.add(new Request(offlineUrl(), { cache: 'reload' }));
    })().catch(() => {
      /*
        A failed precache must not fail the install. Without this the worker
        never activates, and the staff app loses the icon caching and the install
        prompt along with the offline page it could not fetch.
      */
    }),
  );

  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys
          // Ours, and out of date. See the note on CACHE_PREFIX above.
          .filter((key) => key.startsWith(CACHE_PREFIX) && !CURRENT_CACHES.includes(key))
          .map((key) => caches.delete(key)),
      );

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

  /*
    Navigations: network-first, and the response is returned untouched and
    unstored. This branch exists only to replace the browser's error page with
    ours; it is not a caching strategy and must never become one, for the
    privacy reason at the top of this file.

    `mode === 'navigate'` is the whole test. It covers the initial launch at
    `start_url` and every in-app link that performs a real navigation, and it
    excludes the `fetch`/RSC traffic Next uses for client-side transitions —
    which must keep failing normally so the app's own error handling sees it,
    rather than being handed a page of HTML where JSON was expected.
  */
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const offline = await cache.match(offlineUrl());

          /*
            If even the fallback is missing (a precache that failed at install
            and a network that is still down) there is nothing useful left to
            return, so re-throw into the browser's own handling rather than
            resolving with a misleading empty response.
          */
          if (!offline) throw new Error('offline fallback unavailable');

          return offline;
        }
      })(),
    );

    return;
  }

  if (isCacheableStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (isImmutableBuildAsset(url)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // Everything else — pages, `/api/`, anything authenticated — is untouched.
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);

  /*
    `response.ok` only. An opaque or error response stored here would be served
    back as though it were the real asset for as long as the cache lives.
  */
  if (response.ok) cache.put(request, response.clone());

  return response;
}
