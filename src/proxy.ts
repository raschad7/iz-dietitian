import { getSessionCookie } from 'better-auth/cookies';
import { hasLocale } from 'next-intl';
import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';

import { routing } from '@/i18n/routing';

/**
 * Request middleware. Next.js 16 renamed the `middleware.ts` file convention to
 * `proxy.ts`; the API is unchanged and this still runs before every matched
 * request.
 */

/**
 * Locale detection and redirect. With `localePrefix: 'always'`, a request to
 * `/login` is redirected to `/ar/login` or `/en/login` based on the
 * `NEXT_LOCALE` cookie alone — `Accept-Language` is not consulted, because
 * `localeDetection` is off in `src/i18n/routing.ts`. A visitor with no cookie
 * gets `ar`, the default locale.
 */
const intlMiddleware = createIntlMiddleware(routing);

/**
 * Route areas that require a session, mapped to the sign-in page that area's
 * users belong on. Staff and clients authenticate differently — password versus
 * magic link — so bouncing a client to the staff form would be a dead end.
 */
const PROTECTED_AREAS: Record<string, string> = {
  app: 'login',
  portal: 'client-login',
};

/**
 * The locale root is protected too, and it is the one entry nobody types a path
 * for: `enzyme.iztech.net`, the browser's restored tab, the bookmark, the
 * installed icon.
 *
 * There is nothing public at `/[locale]` any more — the page there only decides
 * which area you belong in and redirects. So an anonymous request can be turned
 * around here on the cookie alone, which saves rendering a page whose whole
 * body is a `redirect`. Signed-in requests still fall through to it, because
 * only the page can tell a dietitian from a client: the session cookie is
 * opaque and says *that* someone is signed in, never which of the two they are.
 */
const ROOT_LOGIN_PATH = 'login';

/**
 * `routing.localeCookie` is a fixed object in `src/i18n/routing.ts`, never the
 * `boolean` its type also allows — the guard is only to satisfy that wider type.
 * Same reasoning as the write in `updateLanguageAction`.
 */
const LOCALE_COOKIE_NAME =
  typeof routing.localeCookie === 'object' ? (routing.localeCookie.name ?? 'NEXT_LOCALE') : 'NEXT_LOCALE';

/**
 * The client portal renders in the language the client chose, whatever locale
 * the URL names.
 *
 * **The portal's language is an account setting, not a property of a URL.** A
 * client picks it once in Settings; `updateLanguageAction` writes it to
 * `clients.preferred_locale` and mirrors it into this cookie. Everywhere else
 * in the app a locale prefix is authoritative — `/ar/login` and `/en/login` are
 * both real, addressable pages — but inside `/portal/**` a stale prefix is
 * never something the client asked for. It is a leftover.
 *
 * **What it is a leftover of: history.** A locale switch can only ever fix the
 * entry it happens on. Every entry already behind it was rendered in the old
 * language and keeps its old prefix, and nothing client-side can rewrite them —
 * so the browser's back arrow, a bookmark, or a restored tab would each drop
 * the client back into Arabic after they had chosen English. This replaces a
 * `PORTAL_LOCALE_SWITCH` cookie that covered exactly one back press, by
 * swapping the pre-switch screen for a fresh copy in the new language; that
 * left the *old* copy one step further back, which is why the language flipped
 * on the second press rather than the first. Correcting the request instead of
 * the history covers every depth, and the browser's own arrow as well as ours.
 *
 * GET only. A server action POSTs to the page's own URL, and the action that
 * changes the language runs while the cookie still names the old one — bouncing
 * that request would redirect the very POST that is trying to update the
 * setting.
 */
function portalLocaleRedirect(request: NextRequest, urlLocale: string): NextResponse | undefined {
  if (request.method !== 'GET') return undefined;

  const chosen = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
  if (!hasLocale(routing.locales, chosen) || chosen === urlLocale) return undefined;

  const url = request.nextUrl.clone();
  // `/ar/portal/profile` -> `/portal/profile` -> `/en/portal/profile`, with the
  // query string carried along by `clone()`.
  url.pathname = `/${chosen}${request.nextUrl.pathname.slice(urlLocale.length + 1)}`;
  return NextResponse.redirect(url);
}

export default function proxy(request: NextRequest) {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  const [maybeLocale, maybeArea] = segments;

  /*
    `/ar` on its own is `maybeArea === undefined`, and that is the locale root
    rather than an unprotected page — see `ROOT_LOGIN_PATH`. Anything else
    unrecognised (`/ar/settings-typo`) stays public and reaches the 404.
  */
  const loginPath =
    maybeArea === undefined ? ROOT_LOGIN_PATH : PROTECTED_AREAS[maybeArea];

  if (hasLocale(routing.locales, maybeLocale) && loginPath !== undefined) {
    /**
     * Optimistic check only: this reads the cookie without validating it, which
     * is all that is safe to do here. The real check — including `staff` vs
     * `client` — happens in the area layouts via `requireStaffSession` /
     * `requireClientSession`.
     */
    if (!getSessionCookie(request)) {
      const loginUrl = new URL(`/${maybeLocale}/${loginPath}`, request.url);
      /*
        No `?redirect=` from the root. The parameter exists to return someone to
        the screen they were reaching for, and the root is not a screen — it is
        the redirect itself. Setting it would send them back here after signing
        in, for a second bounce to the area `resolveSafeRedirect` would have
        picked anyway.
      */
      if (maybeArea !== undefined) {
        loginUrl.searchParams.set('redirect', request.nextUrl.pathname);
      }
      return NextResponse.redirect(loginUrl);
    }

    /*
      Before `intlMiddleware`, and that ordering is load-bearing: it writes the
      locale cookie from the prefix it finds, so by the time it has run the
      cookie agrees with the URL and the disagreement this reads is gone.
    */
    if (maybeArea === 'portal') {
      const localeRedirect = portalLocaleRedirect(request, maybeLocale);
      if (localeRedirect) return localeRedirect;
    }
  }

  return intlMiddleware(request);
}

export const config = {
  // Everything except API routes, Next internals and files with an extension.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
