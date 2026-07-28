import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { clients, user } from '@/db/schema';

import { createTestClinic, resetDatabase } from '../../../tests/helpers';
import {
  archiveClient,
  createClient,
  invitePortalAccess,
  restoreClient,
  revokePortalAccess,
  updateClient,
} from './mutations';

let clinicId: string;

beforeEach(async () => {
  await resetDatabase();
  clinicId = await createTestClinic();
});

async function readClient(id: string) {
  const [row] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  return row;
}

describe('createClient', () => {
  test('stores a client and returns its id', async () => {
    const { id } = await createClient(clinicId, { fullName: 'أحمد خليل', preferredLocale: 'ar' });
    const row = await readClient(id);

    expect(row?.fullName).toBe('أحمد خليل');
    expect(row?.status).toBe('active');
    expect(row?.userId).toBeNull();
  });

  test('writes the normalised search name', async () => {
    const { id } = await createClient(clinicId, { fullName: 'أحمد', preferredLocale: 'ar' });
    expect((await readClient(id))?.searchName).toBe('احمد');
  });

  test('stores the optional intake fields', async () => {
    const { id } = await createClient(clinicId, {
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
    const { id } = await createClient(clinicId, { fullName: 'أحمد', preferredLocale: 'ar' });
    await updateClient(clinicId, id, { fullName: 'إبراهيم', preferredLocale: 'ar' });

    const row = await readClient(id);
    expect(row?.fullName).toBe('إبراهيم');
    expect(row?.searchName).toBe('ابراهيم');
  });

  test('clears a field that was emptied', async () => {
    const { id } = await createClient(clinicId, { fullName: 'سارة', preferredLocale: 'ar', phone: '0599000000' });
    await updateClient(clinicId, id, { fullName: 'سارة', preferredLocale: 'ar' });

    expect((await readClient(id))?.phone).toBeNull();
  });

  test('returns false for an unknown id', async () => {
    expect(await updateClient(clinicId, '00000000-0000-4000-8000-000000000000', {
      fullName: 'لا أحد',
      preferredLocale: 'ar',
    })).toBe(false);
  });
});

describe('archiveClient / restoreClient', () => {
  test('round-trips the status', async () => {
    const { id } = await createClient(clinicId, { fullName: 'أحمد', preferredLocale: 'ar' });

    expect(await archiveClient(clinicId, id)).toBe(true);
    expect((await readClient(id))?.status).toBe('archived');

    expect(await restoreClient(clinicId, id)).toBe(true);
    expect((await readClient(id))?.status).toBe('active');
  });

  test('archiving never deletes the row', async () => {
    const { id } = await createClient(clinicId, { fullName: 'أحمد', preferredLocale: 'ar' });
    await archiveClient(clinicId, id);
    expect(await readClient(id)).toBeDefined();
  });
});

async function readUsers() {
  return db.select().from(user);
}

describe('invitePortalAccess', () => {
  test('creates a client-role user and links it', async () => {
    const { id } = await createClient(clinicId, { fullName: 'سارة', preferredLocale: 'en', email: 'sara@clinic.ps' });

    const result = await invitePortalAccess(clinicId, id);
    expect(result.ok).toBe(true);

    const users = await readUsers();
    expect(users).toHaveLength(1);
    expect(users[0]?.email).toBe('sara@clinic.ps');
    expect(users[0]?.role).toBe('client');
    expect(users[0]?.locale).toBe('en');

    expect((await readClient(id))?.userId).toBe(users[0]?.id ?? '');
  });

  test('refuses a client with no email and writes nothing', async () => {
    const { id } = await createClient(clinicId, { fullName: 'أحمد', preferredLocale: 'ar' });

    const result = await invitePortalAccess(clinicId, id);
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

    const { id } = await createClient(clinicId, { fullName: 'سارة', preferredLocale: 'ar', email: 'taken@clinic.ps' });

    const result = await invitePortalAccess(clinicId, id);
    expect(result).toEqual({ ok: false, code: 'email_taken' });

    // The pre-existing user is untouched and no second row appeared.
    expect(await readUsers()).toHaveLength(1);
    expect((await readClient(id))?.userId).toBeNull();
  });

  test('refuses a second invite for an already-linked client', async () => {
    const { id } = await createClient(clinicId, { fullName: 'سارة', preferredLocale: 'ar', email: 'sara@clinic.ps' });
    await invitePortalAccess(clinicId, id);

    expect(await invitePortalAccess(clinicId, id)).toEqual({ ok: false, code: 'already_invited' });
    expect(await readUsers()).toHaveLength(1);
  });

  test('refuses an unknown client', async () => {
    expect(await invitePortalAccess(clinicId, '00000000-0000-4000-8000-000000000000')).toEqual({
      ok: false,
      code: 'not_found',
    });
  });
});

describe('revokePortalAccess', () => {
  test('deletes the user and leaves the client record intact', async () => {
    const { id } = await createClient(clinicId, { fullName: 'سارة', preferredLocale: 'ar', email: 'sara@clinic.ps' });
    await invitePortalAccess(clinicId, id);

    expect(await revokePortalAccess(clinicId, id)).toBe(true);
    expect(await readUsers()).toHaveLength(0);

    const row = await readClient(id);
    expect(row).toBeDefined();
    expect(row?.userId).toBeNull();
    expect(row?.fullName).toBe('سارة');
  });

  test('returns false for a client with no portal access', async () => {
    const { id } = await createClient(clinicId, { fullName: 'أحمد', preferredLocale: 'ar' });
    expect(await revokePortalAccess(clinicId, id)).toBe(false);
  });

  test('a client can be re-invited after a revoke', async () => {
    const { id } = await createClient(clinicId, { fullName: 'سارة', preferredLocale: 'ar', email: 'sara@clinic.ps' });
    await invitePortalAccess(clinicId, id);
    await revokePortalAccess(clinicId, id);

    expect((await invitePortalAccess(clinicId, id)).ok).toBe(true);
    expect(await readUsers()).toHaveLength(1);
  });
});

describe('clinic isolation', () => {
  test('a write aimed at another clinic\u2019s client changes nothing', async () => {
    const otherClinicId = await createTestClinic('Other Clinic');
    const { id } = await createClient(otherClinicId, { fullName: 'سارة', preferredLocale: 'ar' });

    expect(await updateClient(clinicId, id, { fullName: 'مُخترَق', preferredLocale: 'ar' })).toBe(false);
    expect(await archiveClient(clinicId, id)).toBe(false);
    expect(await restoreClient(clinicId, id)).toBe(false);

    const row = await readClient(id);
    expect(row?.fullName).toBe('سارة');
    expect(row?.status).toBe('active');
  });

  test('portal access cannot be granted or revoked across clinics', async () => {
    const otherClinicId = await createTestClinic('Other Clinic');
    const { id } = await createClient(otherClinicId, {
      fullName: 'سارة',
      preferredLocale: 'ar',
      email: 'sara@clinic.ps',
    });

    expect(await invitePortalAccess(clinicId, id)).toEqual({ ok: false, code: 'not_found' });
    expect(await readUsers()).toHaveLength(0);

    // Grant it legitimately, then confirm the other clinic still cannot revoke.
    expect((await invitePortalAccess(otherClinicId, id)).ok).toBe(true);
    expect(await revokePortalAccess(clinicId, id)).toBe(false);
    expect(await readUsers()).toHaveLength(1);
  });
});
