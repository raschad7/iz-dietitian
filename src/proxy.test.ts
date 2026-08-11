import { describe, expect, test } from 'bun:test';
import { NextRequest } from 'next/server';

import proxy from './proxy';

/**
 * The portal renders in the language the client chose, whatever the URL says —
 * see the note on `portalLocaleRedirect` in `proxy.ts` for why that rule exists
 * and why it is scoped to `/portal/**`.
 *
 * These drive the exported middleware rather than the helper, because the
 * ordering is half the behaviour: the locale rule has to run after the session
 * check and before `intlMiddleware`, which would otherwise rewrite the cookie
 * from the prefix and erase the disagreement being tested.
 */

/** Whatever better-auth is calling its session cookie under this config. */
const SESSION_COOKIE = 'better-auth.session_token';

function request(
  path: string,
  { locale, session = true, method = 'GET' }: { locale?: string; session?: boolean; method?: string } = {},
) {
  const cookies: string[] = [];
  if (session) cookies.push(`${SESSION_COOKIE}=test-session-token`);
  if (locale) cookies.push(`NEXT_LOCALE=${locale}`);

  return new NextRequest(new URL(path, 'https://clinic.example'), {
    method,
    headers: cookies.length ? { cookie: cookies.join('; ') } : undefined,
  });
}

/** The `Location` of a redirect response, or null when the request was let through. */
function redirectedTo(response: Response): string | null {
  const location = response.headers.get('location');
  return location ? new URL(location, 'https://clinic.example').pathname : null;
}

describe('portal locale enforcement', () => {
  test('a stale prefix is corrected to the language the client chose', () => {
    // The exact case a back press lands on: an entry rendered before the switch.
    expect(redirectedTo(proxy(request('/ar/portal/profile', { locale: 'en' })))).toBe('/en/portal/profile');
  });

  test('it reaches every depth, not just the screen the switch happened on', () => {
    expect(redirectedTo(proxy(request('/ar/portal/settings/security', { locale: 'en' })))).toBe(
      '/en/portal/settings/security',
    );
  });

  test('it corrects in both directions', () => {
    expect(redirectedTo(proxy(request('/en/portal', { locale: 'ar' })))).toBe('/ar/portal');
  });

  test('the query string survives the correction', () => {
    const response = proxy(request('/ar/portal/appointments?tab=past', { locale: 'en' }));
    const location = new URL(response.headers.get('location')!, 'https://clinic.example');

    expect(location.pathname).toBe('/en/portal/appointments');
    expect(location.search).toBe('?tab=past');
  });

  test('an agreeing prefix is left alone, so there is no redirect loop', () => {
    expect(redirectedTo(proxy(request('/en/portal/profile', { locale: 'en' })))).toBeNull();
  });

  test('no cookie means no opinion — the prefix stands', () => {
    expect(redirectedTo(proxy(request('/ar/portal/profile')))).toBeNull();
  });

  test('a cookie naming something that is not a locale is ignored', () => {
    expect(redirectedTo(proxy(request('/ar/portal/profile', { locale: 'fr' })))).toBeNull();
  });
});

describe('what the rule deliberately does not touch', () => {
  test('the staff area keeps prefix-wins routing', () => {
    expect(redirectedTo(proxy(request('/ar/app/clients', { locale: 'en' })))).toBeNull();
  });

  test('the auth screens keep prefix-wins routing', () => {
    // No session here, and none needed: `client-login` is not a protected area.
    expect(redirectedTo(proxy(request('/ar/client-login', { locale: 'en', session: false })))).toBeNull();
  });

  test('a POST is never bounced — it is how the language is changed in the first place', () => {
    // `updateLanguageAction` posts to the Arabic URL and sets the cookie to `en`
    // as it runs. Redirecting that request would redirect the update itself.
    expect(
      redirectedTo(proxy(request('/ar/portal/settings', { locale: 'en', method: 'POST' }))),
    ).toBeNull();
  });

  test('a signed-out request still goes to sign-in first', () => {
    expect(redirectedTo(proxy(request('/ar/portal/profile', { locale: 'en', session: false })))).toBe(
      '/ar/client-login',
    );
  });
});
