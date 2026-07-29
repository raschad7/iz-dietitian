import { beforeEach, describe, expect, test } from 'bun:test';

import { db } from '@/db';
import { authAttempt } from '@/db/schema';

import { resetDatabase } from '../../../tests/helpers';
import {
  AUTH_LIMITS,
  checkRateLimit,
  clearAttempts,
  minutesUntilReset,
  recordAttempt,
} from './rate-limit';

beforeEach(async () => {
  await resetDatabase();
});

describe('minutesUntilReset', () => {
  test('rounds a partial minute up, so "try again in 0 minutes" is impossible', () => {
    const oldest = new Date(Date.now() - 30_000);
    expect(minutesUntilReset(oldest, 15 * 60)).toBe(15);
  });

  test('reports the remaining whole minutes of the window', () => {
    const oldest = new Date(Date.now() - 10 * 60_000);
    expect(minutesUntilReset(oldest, 15 * 60)).toBe(5);
  });

  test('never returns less than one minute', () => {
    const oldest = new Date(Date.now() - 15 * 60_000);
    expect(minutesUntilReset(oldest, 15 * 60)).toBe(1);
  });
});

describe('checkRateLimit for sign_in', () => {
  const email = 'staff@clinic.test';

  test('allows an attempt when nothing has been recorded', async () => {
    const result = await checkRateLimit('sign_in', { email, ipAddress: '1.1.1.1' });
    expect(result.allowed).toBe(true);
  });

  test('allows the attempt that reaches one below the limit', async () => {
    const limit = AUTH_LIMITS.sign_in.email.max;

    for (let i = 0; i < limit - 1; i += 1) {
      await recordAttempt('sign_in', { email, ipAddress: '1.1.1.1' });
    }

    const result = await checkRateLimit('sign_in', { email, ipAddress: '1.1.1.1' });
    expect(result.allowed).toBe(true);
  });

  test('blocks once the email limit is reached, and says how long', async () => {
    const limit = AUTH_LIMITS.sign_in.email.max;

    for (let i = 0; i < limit; i += 1) {
      await recordAttempt('sign_in', { email, ipAddress: '1.1.1.1' });
    }

    const result = await checkRateLimit('sign_in', { email, ipAddress: '1.1.1.1' });

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryInMinutes).toBeGreaterThan(0);
    }
  });

  test('blocks a different email from the same IP once the IP limit is reached', async () => {
    const limit = AUTH_LIMITS.sign_in.ip.max;

    for (let i = 0; i < limit; i += 1) {
      await recordAttempt('sign_in', { email: `person${i}@clinic.test`, ipAddress: '9.9.9.9' });
    }

    const result = await checkRateLimit('sign_in', { email: 'someone-else@clinic.test', ipAddress: '9.9.9.9' });
    expect(result.allowed).toBe(false);
  });

  test('counts attempts for addresses that do not exist, so lockout cannot confirm an account', async () => {
    const limit = AUTH_LIMITS.sign_in.email.max;

    for (let i = 0; i < limit; i += 1) {
      await recordAttempt('sign_in', { email: 'nobody@nowhere.test', ipAddress: '2.2.2.2' });
    }

    const result = await checkRateLimit('sign_in', { email: 'nobody@nowhere.test', ipAddress: '2.2.2.2' });
    expect(result.allowed).toBe(false);
  });

  test('ignores attempts older than the window', async () => {
    const limit = AUTH_LIMITS.sign_in.email.max;
    const longAgo = new Date(Date.now() - (AUTH_LIMITS.sign_in.email.windowSeconds + 60) * 1000);

    await db.insert(authAttempt).values(
      Array.from({ length: limit }, () => ({
        kind: 'sign_in',
        email,
        ipAddress: '1.1.1.1',
        createdAt: longAgo,
      })),
    );

    const result = await checkRateLimit('sign_in', { email, ipAddress: '1.1.1.1' });
    expect(result.allowed).toBe(true);
  });

  test('normalises the email, so casing and spacing cannot dodge the limit', async () => {
    const limit = AUTH_LIMITS.sign_in.email.max;

    for (let i = 0; i < limit; i += 1) {
      await recordAttempt('sign_in', { email: '  STAFF@Clinic.TEST ', ipAddress: '1.1.1.1' });
    }

    const result = await checkRateLimit('sign_in', { email, ipAddress: '1.1.1.1' });
    expect(result.allowed).toBe(false);
  });

  test('a kind with no IP rule is unaffected by other IP traffic', async () => {
    for (let i = 0; i < 50; i += 1) {
      await recordAttempt('sign_in', { email: `x${i}@clinic.test`, ipAddress: '3.3.3.3' });
    }

    const result = await checkRateLimit('password_reset', { email, ipAddress: '3.3.3.3' });
    expect(result.allowed).toBe(true);
  });
});

describe('clearAttempts', () => {
  test('a successful sign-in clears that email, and only that email', async () => {
    const limit = AUTH_LIMITS.sign_in.email.max;

    for (let i = 0; i < limit; i += 1) {
      await recordAttempt('sign_in', { email: 'a@clinic.test', ipAddress: '1.1.1.1' });
      await recordAttempt('sign_in', { email: 'b@clinic.test', ipAddress: '1.1.1.1' });
    }

    await clearAttempts('sign_in', 'a@clinic.test');

    const cleared = await checkRateLimit('sign_in', { email: 'a@clinic.test', ipAddress: null });
    const untouched = await checkRateLimit('sign_in', { email: 'b@clinic.test', ipAddress: null });

    expect(cleared.allowed).toBe(true);
    expect(untouched.allowed).toBe(false);
  });
});
