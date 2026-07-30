import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { clients, user } from '@/db/schema';

import { createTestClinic, resetDatabase } from '../../../tests/helpers';
import { archiveClient, createClient, deleteClient, restoreClient, updateClient } from './mutations';
import { issuePortalCredentials, revokePortalAccess } from './portal-credentials';

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

// `issuePortalCredentials` and `revokePortalAccess` now live in
// `./portal-credentials`, and their own coverage moved with them — see
// `portal-credentials.test.ts`. What is left here is coverage for
// `createClient` / `updateClient` / `archiveClient` / `deleteClient`
// interacting correctly with a linked portal account.

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

    expect(await issuePortalCredentials(clinicId, id, 'isolation-0001')).toEqual({
      ok: false,
      code: 'not_found',
    });
    expect(await readUsers()).toHaveLength(0);

    // Grant it legitimately, then confirm the other clinic still cannot revoke.
    expect((await issuePortalCredentials(otherClinicId, id, 'isolation-0002')).ok).toBe(true);
    expect(await revokePortalAccess(clinicId, id)).toBe(false);
    expect(await readUsers()).toHaveLength(1);
  });
});

describe('deleteClient', () => {
  test('removes the client', async () => {
    const { id } = await createClient(clinicId, { fullName: 'سجل مكرر', preferredLocale: 'ar' });

    expect(await deleteClient(clinicId, id)).toBe(true);
    expect(await readClient(id)).toBeUndefined();
  });

  test('takes the portal account with it, leaving no orphan login', async () => {
    const { id } = await createClient(clinicId, {
      fullName: 'سارة',
      preferredLocale: 'ar',
      email: 'sara@clinic.ps',
    });
    await issuePortalCredentials(clinicId, id, 'delete-with-portal-0001');
    expect(await readUsers()).toHaveLength(1);

    await deleteClient(clinicId, id);

    // The whole point: no users row survives to sign in against a record that
    // no longer exists.
    expect(await readUsers()).toHaveLength(0);
  });

  test('returns false for an unknown id', async () => {
    expect(await deleteClient(clinicId, '00000000-0000-4000-8000-000000000000')).toBe(false);
  });

  test('cannot delete another clinic\u2019s client', async () => {
    const otherClinicId = await createTestClinic('Other Clinic');
    const { id } = await createClient(otherClinicId, { fullName: 'سارة', preferredLocale: 'ar' });

    expect(await deleteClient(clinicId, id)).toBe(false);
    expect(await readClient(id)).toBeDefined();
  });
});
