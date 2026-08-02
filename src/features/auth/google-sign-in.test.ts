import { describe, expect, test } from 'bun:test';

import { attemptGoogleSignIn } from './google-sign-in';

describe('attemptGoogleSignIn', () => {
  test('reports a rejected network request without throwing', async () => {
    expect(await attemptGoogleSignIn(async () => { throw new TypeError('Failed to fetch'); })).toBe(false);
  });

  test('reports an auth response error', async () => {
    expect(await attemptGoogleSignIn(async () => ({ error: { message: 'provider rejected' } }))).toBe(false);
  });

  test('reports success when Better Auth accepts the redirect request', async () => {
    expect(await attemptGoogleSignIn(async () => ({ error: null }))).toBe(true);
  });
});
