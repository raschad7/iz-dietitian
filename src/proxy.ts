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
 * `NEXT_LOCALE` cookie, then `Accept-Language`. When neither expresses a usable
 * preference, `ar` wins (it is the default locale).
 */
const intlMiddleware = createIntlMiddleware(routing);

/** Route areas that require a session, keyed by the first segment after the locale. */
const PROTECTED_AREAS = new Set(['app', 'portal']);

export default function proxy(request: NextRequest) {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  const [maybeLocale, maybeArea] = segments;

  if (hasLocale(routing.locales, maybeLocale) && maybeArea !== undefined && PROTECTED_AREAS.has(maybeArea)) {
    /**
     * Optimistic check only: this reads the cookie without validating it, which
     * is all that is safe to do here. The real check — including `staff` vs
     * `client` — happens in the area layouts via `requireStaffSession` /
     * `requireClientSession`.
     */
    if (!getSessionCookie(request)) {
      const loginUrl = new URL(`/${maybeLocale}/login`, request.url);
      loginUrl.searchParams.set('redirect', request.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return intlMiddleware(request);
}

export const config = {
  // Everything except API routes, Next internals and files with an extension.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
