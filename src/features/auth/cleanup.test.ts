import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { clients, clinics, user } from '@/db/schema';

import { resetDatabase } from '../../../tests/helpers';
import { purgeUnverifiedAccounts } from './cleanup';

const DAY_MS = 24 * 60 * 60 * 1000;

async function makeUnverifiedStaff(email: string, createdAt: Date): Promise<{ userId: string; clinicId: string }> {
  const [clinic] = await db.insert(clinics).values({ name: 'Pending Clinic' }).returning({ id: clinics.id });
  if (!clinic) throw new Error('insert into clinics returned no row');

  const userId = crypto.randomUUID();

  await db.insert(user).values({
    id: userId,
    name: 'Pending',
    email,
    emailVerified: false,
    role: 'staff',
    clinicId: clinic.id,
    createdAt,
  });

  return { userId, clinicId: clinic.id };
}

beforeEach(async () => {
  await resetDatabase();
});

describe('purgeUnverifiedAccounts', () => {
  test('deletes an unverified account older than the cutoff, and its empty clinic', async () => {
    const { userId, clinicId } = await makeUnverifiedStaff('stale@clinic.test', new Date(Date.now() - 2 * DAY_MS));

    const removed = await purgeUnverifiedAccounts();

    expect(removed).toBe(1);
    expect(await db.select().from(user).where(eq(user.id, userId))).toHaveLength(0);
    expect(await db.select().from(clinics).where(eq(clinics.id, clinicId))).toHaveLength(0);
  });

  test('keeps an unverified account that is still inside the window', async () => {
    const { userId } = await makeUnverifiedStaff('fresh@clinic.test', new Date(Date.now() - 60_000));

    const removed = await purgeUnverifiedAccounts();

    expect(removed).toBe(0);
    expect(await db.select().from(user).where(eq(user.id, userId))).toHaveLength(1);
  });

  test('never touches a verified account, however old', async () => {
    const [clinic] = await db.insert(clinics).values({ name: 'Real Clinic' }).returning({ id: clinics.id });
    if (!clinic) throw new Error('insert into clinics returned no row');

    const userId = crypto.randomUUID();
    await db.insert(user).values({
      id: userId,
      name: 'Real',
      email: 'real@clinic.test',
      emailVerified: true,
      role: 'staff',
      clinicId: clinic.id,
      createdAt: new Date(Date.now() - 400 * DAY_MS),
    });

    const removed = await purgeUnverifiedAccounts();

    expect(removed).toBe(0);
    expect(await db.select().from(user).where(eq(user.id, userId))).toHaveLength(1);
  });

  test('keeps a clinic that holds clients, even when its only staff account expires', async () => {
    const { clinicId } = await makeUnverifiedStaff('stale2@clinic.test', new Date(Date.now() - 2 * DAY_MS));

    await db.insert(clients).values({
      clinicId,
      fullName: 'Recorded Patient',
      searchName: 'recorded patient',
    });

    await purgeUnverifiedAccounts();

    // The account goes; the clinical records it created must not.
    expect(await db.select().from(clinics).where(eq(clinics.id, clinicId))).toHaveLength(1);
    expect(await db.select().from(clients).where(eq(clients.clinicId, clinicId))).toHaveLength(1);
  });
});
