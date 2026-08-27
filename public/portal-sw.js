/**
 * The client portal's service worker.
 *
 * ## What it will not do, and why that has not changed
 *
 * It does **not** cache the app shell's HTML, any `/portal` page, or any
 * `/api/` response. Every one of those can carry a signed-in client's personal
 * data (their plan, appointments, notifications), and a stale cached copy
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
 *    on a slow connection. Cache-first — **in production only**, see
 *    `isImmutableBuildAsset`.
 * 3. **An offline fallback for navigations** — network-first, and the network
 *    response is passed straight through and never stored. Only when the
 *    network *fails* does the precached offline page get served, so the
 *    installed app shows its own branded "you're offline" screen instead of the
 *    browser's error page inside a chrome-less window with no way back. That
 *    error page was the single biggest thing between this and a real app.
 * 4. **Web Push** — `push` draws the notification, `notificationclick` opens the
 *    screen it is about, and `pushsubscriptionchange` re-registers a device
 *    whose subscription the browser rotated. See the block at the foot of this
 *    file; the server half is `src/features/portal/push/`.
 *
 * ⚠ The push payload carries **no clinical data**, by rule — it is decrypted by
 * the browser and painted on a lock screen, which is the one surface in this
 * product a stranger holding the phone can read. The rule is stated and
 * enforced where the copy is written (`push/templates.ts`); this file must
 * never add a field to what it displays.
 *
 * ⚠ The offline page is a **static file** (`portal-offline-{ar,en}.html`), not
 * a Next route. A page that renders only when the network is gone cannot
 * depend on the server that is gone with it.
 */

/**
 * Every cache this worker owns starts with this. It is the guard on the
 * cleanup below and it is not decoration.
 *
 * ⚠ `caches` is **origin-wide**, not scoped to a service worker. The previous
 * version of this file deleted every key `caches.keys()` returned that was not
 * its own — which was harmless while the portal was the only worker on the
 * origin, and becomes data loss the moment the staff app ships one: whichever
 * of the two activated last would wipe the other's caches out from under it.
 * Anything added here must keep this prefix, and must never delete a key
 * without it.
 */
/**
 * Whether a development build registered this worker.
 *
 * A service worker is a static file in `public/`, so it has no build of its own
 * and no `NODE_ENV` to read; its own URL is the only channel there is.
 * `service-worker-register.tsx` appends `?dev=1` outside production — the same
 * reasoning that has `scopeLocale()` below read the locale off
 * `self.registration.scope` rather than opening a handshake for it.
 *
 * It gates exactly one rule, `isImmutableBuildAsset`. Everything else — the
 * icon caching, the offline fallback, the install prompt that depends on a
 * controlled `start_url` — behaves in development exactly as it ships, because
 * a PWA whose worker is switched off locally is a PWA nobody can test.
 */
const IS_DEV = new URL(self.location.href).searchParams.get('dev') === '1';

const CACHE_PREFIX = 'portal-';

const STATIC_CACHE = `${CACHE_PREFIX}static-v3`;
const SHELL_CACHE = `${CACHE_PREFIX}shell-v6`;

const CURRENT_CACHES = [STATIC_CACHE, SHELL_CACHE];

/**
 * The locale this registration is scoped to, read off the worker's own scope
 * rather than passed in.
 *
 * `service-worker-register.tsx` registers with `scope: '/{locale}/portal'`, so
 * `self.registration.scope` is the full URL of exactly that — the locale is
 * already here and does not need a second channel (a query string, an
 * `importScripts` config, a postMessage handshake) that could disagree with it.
 * Falls back to Arabic, the app's default locale, if the scope ever stops
 * matching.
 */
function scopeLocale() {
  const match = /\/([^/]+)\/portal\/?$/.exec(self.registration.scope);
  return match && match[1] === 'en' ? 'en' : 'ar';
}

function offlineUrl() {
  return `/portal-offline-${scopeLocale()}.html`;
}

/** Same-origin, unauthenticated, identical-for-everyone. Never `/portal` pages. */
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
 *
 * ⚠ **That is a property of the production build alone.** `next dev` names a
 * chunk after the modules inside it (`src_09nxu4-._.js`), not after their
 * contents, so one URL serves different bytes either side of an edit. Cached
 * first-wins, a development chunk is pinned to whatever the browser saw first —
 * and it survives a restarted dev server, a deleted `.next` and a hard reload
 * alike, because Cache Storage is none of those things.
 *
 * It is not a theoretical failure. A newly added export read `undefined` on the
 * client while the server rendered it perfectly well, surfacing as a hydration
 * mismatch on a single SVG attribute, because this rule was still serving the
 * copy of the module from the build before that export existed. Never
 * cache-first an asset whose URL is not a hash of its bytes.
 */
function isImmutableBuildAsset(url) {
  return (
    !IS_DEV && url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')
  );
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
        never activates, and the portal loses the icon caching and the install
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

/* ────────────────────────────────────────────────────────────────────────────
   Web Push
   ────────────────────────────────────────────────────────────────────────── */

/**
 * The five fields `PushPayload` carries — see `src/features/portal/push/types.ts`.
 *
 * ⚠ **The contract is duplicated, not imported, and it has to be.** A service
 * worker is a static file with no build step, so it cannot share a type with the
 * app. What it can do is read defensively, which is what `parsePayload` below
 * does — and it is the reason every field it reads has a fallback: an installed
 * worker keeps serving until it updates, so a payload sent by a newer server
 * will, for a while, be handled by this exact code. Anything added to the
 * payload has to be optional on arrival.
 */

/** Shown when a payload is missing, malformed, or from a version this cannot read. */
const PUSH_FALLBACK = {
  ar: { title: 'إنزيم', body: 'لديك تحديث جديد.' },
  en: { title: 'Enzyme', body: 'You have an update.' },
};

function parsePayload(event) {
  const locale = scopeLocale();
  const fallback = PUSH_FALLBACK[locale] || PUSH_FALLBACK.ar;

  let data = null;

  try {
    data = event.data ? event.data.json() : null;
  } catch {
    /*
      Not JSON. This is the case that matters most, because it is the one a
      developer hits first: DevTools' own "Push" button sends a plain string,
      and a worker that threw here would look completely dead. It is also what
      a payload-less push looks like — a service may strip the body under
      pressure — and `userVisibleOnly: true` means the browser reports an app
      that shows nothing at all. So this falls through to a generic
      notification rather than returning.
    */
  }

  const source = data && typeof data === 'object' ? data : {};

  return {
    title: typeof source.title === 'string' && source.title ? source.title : fallback.title,
    body: typeof source.body === 'string' && source.body ? source.body : fallback.body,
    // Same-origin paths only. The URL is server-written, but this is the one
    // value here that becomes a navigation, and a worker that would follow an
    // absolute one is a worker that opens whatever a payload names.
    url: typeof source.url === 'string' && source.url.startsWith('/') ? source.url : `/${locale}/portal`,
    tag: typeof source.tag === 'string' && source.tag ? source.tag : 'portal',
    kind: typeof source.kind === 'string' ? source.kind : 'portal',
  };
}

/**
 * Draws the notification.
 *
 * `event.waitUntil` is not optional: without it the worker may be killed before
 * `showNotification` resolves and nothing is ever drawn. It is also the promise
 * the browser watches to decide whether this app kept its `userVisibleOnly`
 * bargain — every push must produce something visible, so there is deliberately
 * no branch that resolves without showing one.
 *
 * `tag` collapses repeats: the server sends the delivery's own dedupe key, so a
 * client whose phone was off does not wake to four copies of one reminder, while
 * two different reminders still stack. `renotify` is what makes a *replacement*
 * alert again rather than swapping in silence — an updated reminder that buzzed
 * nothing would be worse than not sending it.
 *
 * The icon is the app's own PWA artwork, already precached by this worker
 * (`isCacheableStaticAsset`), so drawing it costs no network.
 *
 * **There is no `badge`.** Android's status-bar badge must be a monochrome
 * silhouette on transparency, and `/api/pwa-icons/*` serves only the four
 * full-colour tiles the manifest names — handing it one of those produces a
 * white blob. A generated glyph is a better answer than a bad one, and until
 * there is a route that serves it, Android's own default is better than both.
 */
self.addEventListener('push', (event) => {
  const payload = parsePayload(event);

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      renotify: true,
      icon: '/api/pwa-icons/192',
      // Read back by `notificationclick`, which is a separate event with access
      // to nothing else.
      data: { url: payload.url, kind: payload.kind },
      /*
        `silent`, `vibrate` and `requireInteraction` are deliberately left to the
        platform. They are ignored or actively penalised somewhere — iOS honours
        the system's own alert settings and nothing else — and a clinic reminder
        is not important enough to argue with a phone that has been put on
        silent.
      */
    }),
  );
});

/**
 * Opens the screen the notification is about.
 *
 * **Focus an open window before opening a new one**, and match on the portal
 * rather than on the exact URL: a client who already has the app open should
 * have *that* window brought forward and navigated, not a second copy opened
 * beside it. `navigate()` can reject on some platforms — an iOS standalone
 * window, notably — so the fallback is to focus what is there and let the app
 * be where it was. Being in the right app beats failing to be on the right
 * screen.
 *
 * `notification.close()` first: on Android the notification otherwise stays in
 * the shade after the tap.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const absolute = new URL(data.url || `/${scopeLocale()}/portal`, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

      for (const client of windows) {
        // Any window already on this origin's portal. `includeUncontrolled`
        // covers a tab loaded before this worker took control.
        if (client.url.indexOf('/portal') === -1) continue;

        try {
          await client.focus();
          if ('navigate' in client) await client.navigate(absolute);
        } catch {
          // Focused but could not navigate — see the note above.
        }

        return;
      }

      await self.clients.openWindow(absolute);
    })(),
  );
});

/**
 * The browser rotated this device's subscription.
 *
 * It happens on its own schedule — a push service expiring an endpoint, a
 * browser update — and the app is not told twice: whatever is stored server-side
 * is dead from this moment, and this event is the only chance to replace it.
 *
 * ⚠ **This cannot reach a server action.** Actions are invoked from a rendered
 * page, and this fires with no page open, so it posts to a plain route instead —
 * `/api/portal/push-subscription`, which authenticates with the session cookie
 * the browser attaches (`credentials: 'include'`).
 *
 * Support is uneven — Chrome fires it, Safari does not — so it is a repair
 * mechanism and never the primary path. The one that always works is the client
 * opening the app, where `usePushSubscription` reads the live subscription and
 * reconciles the server to it.
 *
 * `previousEndpoint` goes with it so the server can delete the row being
 * replaced; without it, every rotation would leave a dead endpoint behind.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      let next = event.newSubscription || null;

      if (!next && event.oldSubscription) {
        try {
          next = await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: event.oldSubscription.options.applicationServerKey,
          });
        } catch {
          return;
        }
      }

      if (!next) return;

      try {
        await fetch('/api/portal/push-subscription', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            locale: scopeLocale(),
            subscription: next.toJSON(),
            previousEndpoint: event.oldSubscription ? event.oldSubscription.endpoint : null,
          }),
        });
      } catch {
        // Offline, or signed out. The next visit repairs it — see above.
      }
    })(),
  );
});
