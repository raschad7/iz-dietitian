import { describe, expect, test } from 'bun:test';

import { shouldUseSecureAuthCookies } from './auth-url';

describe('shouldUseSecureAuthCookies', () => {
  test('allows a local production build to authenticate over plain HTTP', () => {
    expect(shouldUseSecureAuthCookies('http://localhost:3000')).toBe(false);
  });

  test('keeps secure cookies enabled for an HTTPS deployment', () => {
    expect(shouldUseSecureAuthCookies('https://app.example.com')).toBe(true);
  });
});
