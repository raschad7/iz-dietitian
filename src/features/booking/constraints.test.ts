import { beforeEach, describe, expect, test } from 'bun:test';

import { db } from '@/db';
import { CHECK_VIOLATION, EXCLUSION_VIOLATION, UNIQUE_VIOLATION, pgConstraintName, pgErrorCode } from '@/db/errors';
import { appointments, clinics, practitioners } from '@/db/schema';

import { createTestClient, createTestClinic, createTestPractitioner, resetDatabase } from '../../../tests/helpers';

/**
 * The database enforces the booking rules on its own.
 *
 * `validateBooking` runs on the client for instant feedback and again on the
 * server inside the write transaction — but two staff members booking the same
 * slot in the same instant both read a clean set of rows before either writes,
 * and no amount of application code closes that window. These tests bypass the
 * feature entirely and write through Drizzle, so they fail if the constraints
 * are ever dropped or the custom migration is lost.
 */

const DATE = '2026-08-05';

let clinicId: string;
let practitionerId: string;
let clientId: string;

beforeEach(async () => {
  await resetDatabase();
  clinicId = await createTestClinic();
  practitionerId = await createTestPractitioner(clinicId);
  clientId = await createTestClient(clinicId, 'أحمد خليل');
});

/**
 * Asserts a write is refused, and hands back its SQLSTATE and constraint name.
 *
 * Checking the code rather than "something threw" is what makes these tests
 * meaningful: it proves *which* constraint rejected the write, and it pins the
 * codes the server actions map to translated messages.
 *
 * Deliberately not `expect(promise).rejects.toThrow()`: under Bun 1.3.14 that
 * matcher never settles for a rejected postgres.js query, which hangs the whole
 * file — the connection keeps its RowExclusiveLock, every later `beforeEach`
 * blocks on TRUNCATE behind it, and the run dies of timeouts rather than
 * reporting a failure. A plain try/catch has no such problem.
 */
async function expectRejected(write: () => Promise<unknown>): Promise<{ code: string | null; constraint: string | null }> {
  try {
    await write();
  } catch (error) {
    return { code: pgErrorCode(error), constraint: pgConstraintName(error) };
  }

  throw new Error('expected the database to reject this write, but it succeeded');
}

/**
 * `async`, not a bare `return db.insert(…)`: Drizzle's query builder is a lazy
 * thenable, so returning it unawaited would never run the statement at all.
 */
async function book(overrides: Partial<typeof appointments.$inferInsert> = {}): Promise<void> {
  await db.insert(appointments).values({
    clinicId,
    practitionerId,
    clientId,
    date: DATE,
    startMinute: 10 * 60,
    durationMinutes: 60,
    ...overrides,
  });
}

async function insertPractitioner(color: string): Promise<void> {
  await db.insert(practitioners).values({ clinicId, name: 'Dr Bad', color });
}

async function insertClinicHours(openMinute: number, closeMinute: number): Promise<void> {
  await db.insert(clinics).values({ name: 'Backwards', openMinute, closeMinute });
}

describe('overlap exclusion constraint', () => {
  test('accepts the first booking', async () => {
    await book();
    expect((await db.select().from(appointments)).length).toBe(1);
  });

  test('rejects a second appointment overlapping the first for one practitioner', async () => {
    const other = await createTestClient(clinicId, 'سارة عبد الله');
    await book();

    // 10:30–11:30 against 10:00–11:00.
    const error = await expectRejected(() => book({ clientId: other, startMinute: 10 * 60 + 30 }));

    expect(error.code).toBe(EXCLUSION_VIOLATION);
    // Names the constraint from drizzle/0004, so losing that custom migration
    // fails here rather than silently letting double-bookings through.
    expect(error.constraint).toBe('appointments_practitioner_no_overlap');
  });

  test('accepts appointments that touch exactly, because the range is half-open', async () => {
    const other = await createTestClient(clinicId, 'سارة عبد الله');
    await book(); // 10:00–11:00

    // 11:00–12:00 begins exactly when the previous ends.
    await book({ clientId: other, startMinute: 11 * 60 });

    expect((await db.select().from(appointments)).length).toBe(2);
  });

  test('accepts an appointment ending exactly when the next begins', async () => {
    const other = await createTestClient(clinicId, 'سارة عبد الله');
    await book(); // 10:00–11:00

    // 09:00–10:00.
    await book({ clientId: other, startMinute: 9 * 60 });

    expect((await db.select().from(appointments)).length).toBe(2);
  });

  test('rejects an overlap of a single minute', async () => {
    const other = await createTestClient(clinicId, 'سارة عبد الله');
    await book(); // 10:00–11:00

    const error = await expectRejected(() =>
      book({ clientId: other, startMinute: 10 * 60 + 59, durationMinutes: 30 }),
    );
    expect(error.code).toBe(EXCLUSION_VIOLATION);
  });

  test('permits a second practitioner to book the very same slot', async () => {
    const otherPractitioner = await createTestPractitioner(clinicId, 'Dr Second');
    const other = await createTestClient(clinicId, 'سارة عبد الله');

    await book();
    await book({ practitionerId: otherPractitioner, clientId: other });

    expect((await db.select().from(appointments)).length).toBe(2);
  });

  test('permits the same practitioner and time on a different date', async () => {
    await book();
    await book({ date: '2026-08-06' });

    expect((await db.select().from(appointments)).length).toBe(2);
  });

  test('rejects an appointment that swallows an existing one', async () => {
    const other = await createTestClient(clinicId, 'سارة عبد الله');
    await book(); // 10:00–11:00

    const error = await expectRejected(() =>
      book({ clientId: other, startMinute: 9 * 60, durationMinutes: 180 }),
    );
    expect(error.code).toBe(EXCLUSION_VIOLATION);
  });
});

describe('one booking per client per day', () => {
  test('rejects a second appointment for the same client on the same date', async () => {
    const otherPractitioner = await createTestPractitioner(clinicId, 'Dr Second');
    await book();

    // A different practitioner and a non-overlapping time — only the unique
    // index can reject this one.
    const error = await expectRejected(() => book({ practitionerId: otherPractitioner, startMinute: 14 * 60 }));

    expect(error.code).toBe(UNIQUE_VIOLATION);
    expect(error.constraint).toBe('appointments_client_id_date_idx');
  });

  test('permits the same client on a different date', async () => {
    await book();
    await book({ date: '2026-08-06' });

    expect((await db.select().from(appointments)).length).toBe(2);
  });
});

describe('column check constraints', () => {
  test('rejects a duration under one slot', async () => {
    expect((await expectRejected(() => book({ durationMinutes: 14 }))).code).toBe(CHECK_VIOLATION);
  });

  test('rejects an appointment running past midnight', async () => {
    const error = await expectRejected(() => book({ startMinute: 23 * 60, durationMinutes: 120 }));
    expect(error.code).toBe(CHECK_VIOLATION);
  });

  test('rejects a start minute outside the day', async () => {
    expect((await expectRejected(() => book({ startMinute: -15 }))).code).toBe(CHECK_VIOLATION);
    expect((await expectRejected(() => book({ startMinute: 1440, durationMinutes: 15 }))).code).toBe(CHECK_VIOLATION);
  });

  test('rejects a colour that is not a six-digit hex', async () => {
    expect((await expectRejected(() => insertPractitioner('red'))).code).toBe(CHECK_VIOLATION);
    expect((await expectRejected(() => insertPractitioner('#abc'))).code).toBe(CHECK_VIOLATION);
  });

  test('rejects a clinic that closes before it opens', async () => {
    const error = await expectRejected(() => insertClinicHours(18 * 60, 8 * 60));
    expect(error.code).toBe(CHECK_VIOLATION);
  });
});

describe('clinic defaults', () => {
  test('a new clinic opens Sunday to Thursday, 08:00 to 18:00', async () => {
    const [clinic] = await db.select().from(clinics).limit(1);

    expect(clinic?.workingDays).toEqual([0, 1, 2, 3, 4]);
    expect(clinic?.openMinute).toBe(480);
    expect(clinic?.closeMinute).toBe(1080);
  });
});
