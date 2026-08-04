import { beforeEach, describe, expect, test } from 'bun:test';

import { db } from '@/db';
import { clientCheckIns, type NewClientCheckIn } from '@/db/schema';

import { createTestClient, createTestClinic, resetDatabase } from '../../../tests/helpers';
import { listCheckIns } from './queries';

/** The clinic week of Wednesday 5 August 2026. */
const SUNDAY = '2026-08-02';
const MONDAY = '2026-08-03';
const SATURDAY = '2026-08-08';

let clinicId: string;
let clientId: string;

beforeEach(async () => {
  await resetDatabase();
  clinicId = await createTestClinic();
  clientId = await createTestClient(clinicId);
});

function checkIn(overrides: Partial<NewClientCheckIn> & { date: string }): NewClientCheckIn {
  return { clinicId, clientId, score: 8, ...overrides };
}

/** `.execute()`, because Drizzle's builder is a thenable rather than a promise. */
function insert(values: NewClientCheckIn): Promise<unknown> {
  return db.insert(clientCheckIns).values(values).execute();
}

/**
 * The error a query rejected with, or null if it resolved.
 *
 * Written out rather than using `expect(...).rejects.toThrow()`: that matcher
 * never settles on a postgres.js rejection under Bun 1.3.14, and the test
 * times out instead of failing. The rejection itself arrives in about 15ms.
 */
async function rejectionOf(promise: Promise<unknown>): Promise<Error | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error as Error;
  }
}

describe('listCheckIns', () => {
  test('returns the range inclusive of both ends, in date order', async () => {
    await db
      .insert(clientCheckIns)
      .values([checkIn({ date: SATURDAY }), checkIn({ date: SUNDAY }), checkIn({ date: MONDAY })]);

    const rows = await listCheckIns(clientId, SUNDAY, SATURDAY);

    expect(rows.map((row) => row.date)).toEqual([SUNDAY, MONDAY, SATURDAY]);
  });

  test('excludes days outside the range', async () => {
    await db.insert(clientCheckIns).values([checkIn({ date: '2026-08-01' }), checkIn({ date: SUNDAY })]);

    const rows = await listCheckIns(clientId, SUNDAY, SATURDAY);

    expect(rows.map((row) => row.date)).toEqual([SUNDAY]);
  });

  test('never returns another client’s check-ins', async () => {
    const otherId = await createTestClient(clinicId, 'Someone Else');

    await db
      .insert(clientCheckIns)
      .values([checkIn({ date: SUNDAY }), checkIn({ date: SUNDAY, clientId: otherId, score: 3 })]);

    const rows = await listCheckIns(clientId, SUNDAY, SATURDAY);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.score).toBe(8);
  });

  test('carries unanswered metrics through as nulls rather than zeroes', async () => {
    await db.insert(clientCheckIns).values(checkIn({ date: SUNDAY, energy: 4 }));

    const [row] = await listCheckIns(clientId, SUNDAY, SATURDAY);

    expect(row?.energy).toBe(4);
    expect(row?.sleep).toBeNull();
    expect(row?.water).toBeNull();
  });

  test('one check-in per client per day is enforced by the database', async () => {
    await db.insert(clientCheckIns).values(checkIn({ date: SUNDAY }));

    expect(await rejectionOf(insert(checkIn({ date: SUNDAY, score: 2 })))).not.toBeNull();
  });

  test('refuses a score outside 0–10', async () => {
    expect(await rejectionOf(insert(checkIn({ date: SUNDAY, score: 11 })))).not.toBeNull();
  });

  test('refuses a metric outside 1–5', async () => {
    expect(await rejectionOf(insert(checkIn({ date: SUNDAY, mood: 0 })))).not.toBeNull();
  });
});
