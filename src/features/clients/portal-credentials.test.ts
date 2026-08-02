import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { account, clients, user } from '@/db/schema';
import { auth } from '@/lib/auth';

import { createTestClinic, resetDatabase } from '../../../tests/helpers';
import { createClient } from './mutations';
import {
  issuePortalCredentials,
  replacePortalPassword,
  revokePortalAccess,
} from './portal-credentials';

let clinicId: string;

beforeEach(async () => {
  await resetDatabase();
  clinicId = await createTestClinic();
});

/**
 * Asserts a promise rejects, without `expect(…).rejects`.
 *
 * Same helper and same reasoning as `src/features/booking/constraints.test.ts`
 * and `src/features/weekly-plans/mutations.test.ts`: under Bun 1.3.14
 * `expect(promise).rejects.toThrow()` never settles for a rejected postgres.js
 * query. The file hangs, the connection keeps its lock, every later `beforeEach`
 * blocks on this suite's `TRUNCATE` — and the run dies of timeouts in a *different*
 * file, reporting foreign-key violations that have nothing to do with the real
 * problem. A plain try/catch has no such problem.
 */
async function expectRejected(work: () => Promise<unknown>): Promise<unknown> {
  try {
    await work();
  } catch (error) {
    return error;
  }

  throw new Error('expected this call to reject, but it resolved');
}

async function makeClient(fullName = 'أحمد خليل') {
  return createClient(clinicId, { fullName, preferredLocale: 'ar' });
}

describe('issuePortalCredentials', () => {
  test('creates exactly one user and one account, and links the client', async () => {
    const client = await makeClient();

    const result = await issuePortalCredentials(clinicId, client.id, 'ahmd-khlyl-1234');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [row] = await db.select().from(clients).where(eq(clients.id, client.id));
    expect(row?.userId).not.toBeNull();

    const users = await db.select().from(user).where(eq(user.username, 'ahmd-khlyl-1234'));
    expect(users).toHaveLength(1);
    expect(users[0]?.role).toBe('client');

    const accounts = await db.select().from(account).where(eq(account.userId, users[0]!.id));
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.providerId).toBe('credential');
  });

  test('marks the account verified, or the global gate would lock it out forever', async () => {
    const client = await makeClient();
    await issuePortalCredentials(clinicId, client.id, 'verified-0001');

    const [row] = await db.select().from(user).where(eq(user.username, 'verified-0001'));
    expect(row?.emailVerified).toBe(true);
  });

  test('requires the client to change the password it hands out', async () => {
    const client = await makeClient();
    await issuePortalCredentials(clinicId, client.id, 'mustchange-0001');

    const [row] = await db.select().from(user).where(eq(user.username, 'mustchange-0001'));
    expect(row?.mustChangePassword).toBe(true);
  });

  test('the temporary password it returns actually authenticates', async () => {
    const client = await makeClient();
    const result = await issuePortalCredentials(clinicId, client.id, 'signin-0001');
    if (!result.ok) throw new Error('issuing failed');

    const signedIn = await auth.api.signInUsername({
      body: { username: 'signin-0001', password: result.temporaryPassword },
    });

    expect(signedIn).toBeTruthy();
  });

  test('gives the account a non-routable synthetic address', async () => {
    const client = await makeClient();
    await issuePortalCredentials(clinicId, client.id, 'synthetic-0001');

    const [row] = await db.select().from(user).where(eq(user.username, 'synthetic-0001'));
    expect(row?.email).toBe('synthetic-0001@portal.invalid');
  });

  test('refuses a username that is already taken', async () => {
    const first = await makeClient('First Client');
    const second = await makeClient('Second Client');

    await issuePortalCredentials(clinicId, first.id, 'taken-0001');
    const result = await issuePortalCredentials(clinicId, second.id, 'taken-0001');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('username_taken');
  });

  test('refuses a client that already has portal access', async () => {
    const client = await makeClient();
    await issuePortalCredentials(clinicId, client.id, 'already-0001');

    const result = await issuePortalCredentials(clinicId, client.id, 'already-0002');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('already_issued');
  });

  test('cannot issue credentials for another clinic’s client', async () => {
    const otherClinic = await createTestClinic('Other Clinic');
    const client = await makeClient();

    const result = await issuePortalCredentials(otherClinic, client.id, 'crosstenant-0001');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('not_found');
  });
});

describe('replacePortalPassword', () => {
  async function issueTo(username: string) {
    const client = await makeClient();
    const result = await issuePortalCredentials(clinicId, client.id, username);
    if (!result.ok) throw new Error('issuing failed');
    return result;
  }

  test('the chosen password authenticates and the temporary one stops working', async () => {
    const issued = await issueTo('chosen-0001');
    const [row] = await db.select().from(user).where(eq(user.username, 'chosen-0001'));

    await replacePortalPassword(row!.id, 'chosen-password');

    const signedIn = await auth.api.signInUsername({
      body: { username: 'chosen-0001', password: 'chosen-password' },
    });
    expect(signedIn).toBeTruthy();

    await expectRejected(() =>
      auth.api.signInUsername({
        body: { username: 'chosen-0001', password: issued.temporaryPassword },
      }),
    );
  });

  test('clears the flag that pins the client to the set-password page', async () => {
    await issueTo('cleared-0001');
    const [row] = await db.select().from(user).where(eq(user.username, 'cleared-0001'));

    await replacePortalPassword(row!.id, 'cleared-password');

    const [after] = await db.select().from(user).where(eq(user.id, row!.id));
    expect(after?.mustChangePassword).toBe(false);
  });

  test('refuses a user id with no credential account rather than reporting success', async () => {
    // Was unawaited, so it asserted nothing at all — the promise settled after the
    // test had already passed, and its rejection leaked into the next file.
    await expectRejected(() => replacePortalPassword(crypto.randomUUID(), 'orphan-password'));
  });
});

describe('revokePortalAccess', () => {
  test('removes the account but leaves the clinical record intact', async () => {
    const client = await makeClient();
    await issuePortalCredentials(clinicId, client.id, 'revoke-0001');

    await revokePortalAccess(clinicId, client.id);

    expect(await db.select().from(user).where(eq(user.username, 'revoke-0001'))).toHaveLength(0);

    const [row] = await db.select().from(clients).where(eq(clients.id, client.id));
    expect(row).toBeTruthy();
    expect(row?.userId).toBeNull();
  });
});
