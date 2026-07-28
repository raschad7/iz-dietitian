import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { clients } from '@/db/schema';

import { resetDatabase } from '../../../tests/helpers';
import { archiveClient, createClient, restoreClient, updateClient } from './mutations';

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
