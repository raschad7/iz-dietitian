import { beforeEach, describe, expect, test } from 'bun:test';

import { db } from '@/db';
import { clientPlanAdherence } from '@/db/schema';
import { createTestClient, createTestClinic, resetDatabase } from '../../../tests/helpers';

import { listPlanAdherence, listPlanAdherenceForClinic } from './queries';

/**
 * Integration tests against `TEST_DATABASE_URL`.
 *
 * `listPlanAdherence` is the read behind every progress screen — the pure
 * derivation in `adherence.ts` is thoroughly tested against hand-built rows,
 * but nothing previously proved the query that produces those rows respects
 * the date window and the client/clinic boundary. That is a property of the
 * query, not of a pure function, so it belongs here.
 */

let clinicId: string;
let otherClinicId: string;
let clientId: string;
let otherClientId: string;

async function insertAdherence(
  forClientId: string,
  forClinicId: string,
  date: string,
  completed: number,
  total: number,
): Promise<void> {
  const level = completed <= 0 ? 'missed' : completed >= total ? 'full' : 'partial';

  await db.insert(clientPlanAdherence).values({
    clinicId: forClinicId,
    clientId: forClientId,
    date,
    level,
    completedMeals: completed,
    totalMeals: total,
  });
}

beforeEach(async () => {
  await resetDatabase();
  clinicId = await createTestClinic();
  otherClinicId = await createTestClinic('Other Clinic');
  clientId = await createTestClient(clinicId, 'سارة عبد الله');
  otherClientId = await createTestClient(clinicId, 'ليلى حسن');
});

describe('listPlanAdherence', () => {
  test('returns only rows for the given client, ordered by date', async () => {
    await insertAdherence(clientId, clinicId, '2026-08-04', 2, 4);
    await insertAdherence(clientId, clinicId, '2026-08-02', 1, 4);
    await insertAdherence(otherClientId, clinicId, '2026-08-03', 4, 4);

    const rows = await listPlanAdherence(clientId, '2026-08-01', '2026-08-07');

    expect(rows.map((row) => row.date)).toEqual(['2026-08-02', '2026-08-04']);
    expect(rows.every((row) => row.completedMeals <= row.totalMeals)).toBe(true);
  });

  test('excludes rows outside the requested date window', async () => {
    await insertAdherence(clientId, clinicId, '2026-08-01', 1, 4);
    await insertAdherence(clientId, clinicId, '2026-08-10', 4, 4);

    const rows = await listPlanAdherence(clientId, '2026-08-02', '2026-08-08');

    expect(rows).toHaveLength(0);
  });

  test('carries the exact completed/total pair, not just the level', async () => {
    await insertAdherence(clientId, clinicId, '2026-08-04', 1, 3);

    const [row] = await listPlanAdherence(clientId, '2026-08-01', '2026-08-07');

    expect(row).toMatchObject({ level: 'partial', completedMeals: 1, totalMeals: 3 });
  });

  test('a client with no reports gets an empty list, not an error', async () => {
    const rows = await listPlanAdherence(clientId, '2026-08-01', '2026-08-07');
    expect(rows).toEqual([]);
  });
});

describe('listPlanAdherenceForClinic', () => {
  test('refuses a client read through the wrong clinic', async () => {
    await insertAdherence(clientId, clinicId, '2026-08-04', 2, 4);

    const rows = await listPlanAdherenceForClinic(otherClinicId, clientId, '2026-08-01', '2026-08-07');

    expect(rows).toEqual([]);
  });

  test('returns the rows when the clinic matches', async () => {
    await insertAdherence(clientId, clinicId, '2026-08-04', 2, 4);

    const rows = await listPlanAdherenceForClinic(clinicId, clientId, '2026-08-01', '2026-08-07');

    expect(rows).toHaveLength(1);
  });
});
