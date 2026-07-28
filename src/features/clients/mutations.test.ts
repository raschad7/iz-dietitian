import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { clients, user } from '@/db/schema';

import { resetDatabase } from '../../../tests/helpers';
import {
  archiveClient,
  createClient,
  invitePortalAccess,
  restoreClient,
  revokePortalAccess,
  updateClient,
} from './mutations';

beforeEach(async () => {
  await resetDatabase();
});

async function readClient(id: string) {
  const [row] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  return row;
}

describe('createClient', () => {
  test('stores a client and returns its id', async () => {
    const { id } = await createClient({ fullName: 'أحمد خليل', preferredLocale: 'ar' });
    const row = await readClient(id);

    expect(row?.fullName).toBe('أحمد خليل');
    expect(row?.status).toBe('active');
    expect(row?.userId).toBeNull();
  });

  test('writes the normalised search name', async () => {
    const { id } = await createClient({ fullName: 'أحمد', preferredLocale: 'ar' });
    expect((await readClient(id))?.searchName).toBe('احمد');
  });

  test('stores the optional intake fields', async () => {
    const { id } = await createClient({
      fullName: 'سارة',
      preferredLocale: 'en',
      email: 'sara@clinic.ps',
      dateOfBirth: '1994-03-02',
      heightCm: 165,
      goal: 'weight_loss',
      activityLevel: 'moderate',
      allergies: 'الفول السوداني',
    });

    const row = await readClient(id);
    expect(row?.dateOfBirth).toBe('1994-03-02');
    expect(row?.heightCm).toBe(165);
    expect(row?.goal).toBe('weight_loss');
    expect(row?.preferredLocale).toBe('en');
  });
});

describe('updateClient', () => {
  test('keeps the search name in sync when the name changes', async () => {
    const { id } = await createClient({ fullName: 'أحمد', preferredLocale: 'ar' });
    await updateClient(id, { fullName: 'إبراهيم', preferredLocale: 'ar' });

    const row = await readClient(id);
    expect(row?.fullName).toBe('إبراهيم');
    expect(row?.searchName).toBe('ابراهيم');
  });

  test('clears a field that was emptied', async () => {
    const { id } = await createClient({ fullName: 'سارة', preferredLocale: 'ar', phone: '0599000000' });
    await updateClient(id, { fullName: 'سارة', preferredLocale: 'ar' });

    expect((await readClient(id))?.phone).toBeNull();
  });

  test('returns false for an unknown id', async () => {
    expect(await updateClient('00000000-0000-4000-8000-000000000000', {
      fullName: 'لا أحد',
      preferredLocale: 'ar',
    })).toBe(false);
  });
});

describe('archiveClient / restoreClient', () => {
  test('round-trips the status', async () => {
    const { id } = await createClient({ fullName: 'أحمد', preferredLocale: 'ar' });

    expect(await archiveClient(id)).toBe(true);
    expect((await readClient(id))?.status).toBe('archived');

    expect(await restoreClient(id)).toBe(true);
    expect((await readClient(id))?.status).toBe('active');
  });

  test('archiving never deletes the row', async () => {
    const { id } = await createClient({ fullName: 'أحمد', preferredLocale: 'ar' });
    await archiveClient(id);
    expect(await readClient(id)).toBeDefined();
  });
});

async function readUsers() {
  return db.select().from(user);
}

describe('invitePortalAccess', () => {
  test('creates a client-role user and links it', async () => {
    const { id } = await createClient({ fullName: 'سارة', preferredLocale: 'en', email: 'sara@clinic.ps' });

    const result = await invitePortalAccess(id);
    expect(result.ok).toBe(true);

    const users = await readUsers();
    expect(users).toHaveLength(1);
    expect(users[0]?.email).toBe('sara@clinic.ps');
    expect(users[0]?.role).toBe('client');
    expect(users[0]?.locale).toBe('en');

    expect((await readClient(id))?.userId).toBe(users[0]?.id ?? '');
  });

  test('refuses a client with no email and writes nothing', async () => {
    const { id } = await createClient({ fullName: 'أحمد', preferredLocale: 'ar' });

    const result = await invitePortalAccess(id);
    expect(result).toEqual({ ok: false, code: 'no_email' });
    expect(await readUsers()).toHaveLength(0);
  });

  test('refuses when the email already belongs to a user, and writes nothing', async () => {
    await db.insert(user).values({
      id: 'existing-user',
      name: 'Existing',
      email: 'taken@clinic.ps',
      role: 'staff',
    });

    const { id } = await createClient({ fullName: 'سارة', preferredLocale: 'ar', email: 'taken@clinic.ps' });

    const result = await invitePortalAccess(id);
    expect(result).toEqual({ ok: false, code: 'email_taken' });

    // The pre-existing user is untouched and no second row appeared.
    expect(await readUsers()).toHaveLength(1);
    expect((await readClient(id))?.userId).toBeNull();
  });

  test('refuses a second invite for an already-linked client', async () => {
    const { id } = await createClient({ fullName: 'سارة', preferredLocale: 'ar', email: 'sara@clinic.ps' });
    await invitePortalAccess(id);

    expect(await invitePortalAccess(id)).toEqual({ ok: false, code: 'already_invited' });
    expect(await readUsers()).toHaveLength(1);
  });

  test('refuses an unknown client', async () => {
    expect(await invitePortalAccess('00000000-0000-4000-8000-000000000000')).toEqual({
      ok: false,
      code: 'not_found',
    });
  });
});

describe('revokePortalAccess', () => {
  test('deletes the user and leaves the client record intact', async () => {
    const { id } = await createClient({ fullName: 'سارة', preferredLocale: 'ar', email: 'sara@clinic.ps' });
    await invitePortalAccess(id);

    expect(await revokePortalAccess(id)).toBe(true);
    expect(await readUsers()).toHaveLength(0);

    const row = await readClient(id);
    expect(row).toBeDefined();
    expect(row?.userId).toBeNull();
    expect(row?.fullName).toBe('سارة');
  });

  test('returns false for a client with no portal access', async () => {
    const { id } = await createClient({ fullName: 'أحمد', preferredLocale: 'ar' });
    expect(await revokePortalAccess(id)).toBe(false);
  });

  test('a client can be re-invited after a revoke', async () => {
    const { id } = await createClient({ fullName: 'سارة', preferredLocale: 'ar', email: 'sara@clinic.ps' });
    await invitePortalAccess(id);
    await revokePortalAccess(id);

    expect((await invitePortalAccess(id)).ok).toBe(true);
    expect(await readUsers()).toHaveLength(1);
  });
});
