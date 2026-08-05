import { describe, expect, test } from 'bun:test';

import { DEFAULT_AUTH_BASE_URL, resolveAuthBaseURL, shouldUseSecureAuthCookies } from './auth-url';

describe('resolveAuthBaseURL', () => {
  test('prefers BETTER_AUTH_URL, the more specific of the two', () => {
    expect(resolveAuthBaseURL('https://auth.example.com', 'https://app.example.com')).toBe(
      'https://auth.example.com',
    );
  });

  test('falls back to APP_URL so emailed links still resolve', () => {
    expect(resolveAuthBaseURL(undefined, 'https://app.example.com')).toBe('https://app.example.com');
  });

  test('treats a blank value as unset — `APP_URL=` is easy to write by accident', () => {
    expect(resolveAuthBaseURL('   ', 'https://app.example.com')).toBe('https://app.example.com');
    expect(resolveAuthBaseURL('', '')).toBe(DEFAULT_AUTH_BASE_URL);
  });

  test('drops a trailing slash, which would otherwise produce `//api` paths', () => {
    expect(resolveAuthBaseURL('https://app.example.com/')).toBe('https://app.example.com');
  });

  test('refuses an origin that would mint dead links', () => {
    expect(() => resolveAuthBaseURL('app.example.com')).toThrow();
    expect(() => resolveAuthBaseURL('ftp://app.example.com')).toThrow();
  });
});

describe('shouldUseSecureAuthCookies', () => {
  test('allows a local production build to authenticate over plain HTTP', () => {
    expect(shouldUseSecureAuthCookies('http://localhost:3000')).toBe(false);
  });

  test('keeps secure cookies enabled for an HTTPS deployment', () => {
    expect(shouldUseSecureAuthCookies('https://app.example.com')).toBe(true);
  });
});
