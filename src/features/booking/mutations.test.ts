import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { appointments, clients, clinics, practitioners } from '@/db/schema';

import { createTestClient, createTestClinic, createTestPractitioner, resetDatabase } from '../../../tests/helpers';
import {
  createAppointment,
  createClientAndBook,
  deleteAppointment,
  ensurePractitioner,
  updateAppointment,
  type BookingContext,
} from './mutations';

/**
 * The server-side half of the rules.
 *
 * `validation.test.ts` proves the rules themselves; these prove the mutations
 * apply them against rows read inside the transaction, that every write is
 * scoped to the caller's clinic, and that the practitioner is resolved from the
 * session rather than accepted from the request.
 */

/** 2026-08-05 is a Wednesday; 2026-08-07 a Friday, which the clinic is closed on. */
const WEDNESDAY = '2026-08-05';
const THURSDAY = '2026-08-06';
const FRIDAY = '2026-08-07';

let context: BookingContext;
let clientId: string;

beforeEach(async () => {
  await resetDatabase();
  const clinicId = await createTestClinic();
  context = { clinicId, ownerName: 'د. ريم عوّاد' };
  clientId = await createTestClient(clinicId, 'أحمد خليل');
});

function booking(overrides: Partial<Parameters<typeof createAppointment>[1]> = {}) {
  return {
    clientId,
    date: WEDNESDAY,
    startMinute: 10 * 60,
    durationMinutes: 30,
    reason: undefined,
    ...overrides,
  };
}

async function countAppointments(): Promise<number> {
  return (await db.select().from(appointments)).length;
}

describe('the clinic practitioner', () => {
  test('is created on first use and named after the account holder', async () => {
    const id = await ensurePractitioner(context);

    const [row] = await db.select().from(practitioners).where(eq(practitioners.id, id));
    expect(row?.name).toBe('د. ريم عوّاد');
    expect(row?.clinicId).toBe(context.clinicId);
  });

  test('is reused rather than duplicated', async () => {
    const first = await ensurePractitioner(context);
    const second = await ensurePractitioner(context);

    expect(second).toBe(first);
    expect((await db.select().from(practitioners)).length).toBe(1);
  });

  test('is provisioned by a booking, so nothing has to be set up first', async () => {
    const result = await createAppointment(context, booking());

    expect(result.ok).toBe(true);
    expect((await db.select().from(practitioners)).length).toBe(1);
  });

  test('is never another clinic\'s, even when that one was created first', async () => {
    const otherClinic = await createTestClinic('Other Clinic');
    const foreign = await createTestPractitioner(otherClinic, 'Dr Elsewhere');

    const id = await ensurePractitioner(context);

    expect(id).not.toBe(foreign);
  });

  test('an existing practitioner is adopted rather than a second one created', async () => {
    const seeded = await createTestPractitioner(context.clinicId, 'Dr Already Here');

    expect(await ensurePractitioner(context)).toBe(seeded);
  });
});

describe('createAppointment', () => {
  test('stores a valid booking and returns its id', async () => {
    const result = await createAppointment(context, booking());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [row] = await db.select().from(appointments).where(eq(appointments.id, result.data.id));
    expect(row?.startMinute).toBe(600);
    expect(row?.durationMinutes).toBe(30);
    expect(row?.clinicId).toBe(context.clinicId);
  });

  test('leaves reason empty when none was given — no default, anywhere', async () => {
    const result = await createAppointment(context, booking());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [row] = await db.select().from(appointments).where(eq(appointments.id, result.data.id));
    expect(row?.reason).toBeNull();
  });

  test('rejects a closed day with the rule 2 key', async () => {
    const result = await createAppointment(context, booking({ date: FRIDAY }));

    expect(result).toEqual({ ok: false, error: 'errors.closedDay' });
    expect(await countAppointments()).toBe(0);
  });

  test('rejects an appointment running past closing time', async () => {
    const result = await createAppointment(context, booking({ startMinute: 17 * 60 + 45, durationMinutes: 60 }));

    expect(result).toEqual({ ok: false, error: 'errors.outsideHours' });
    expect(await countAppointments()).toBe(0);
  });

  test('rejects a duration under one slot', async () => {
    expect(await createAppointment(context, booking({ durationMinutes: 10 }))).toEqual({
      ok: false,
      error: 'errors.tooShort',
    });
  });

  test('rejects an overlap', async () => {
    const other = await createTestClient(context.clinicId, 'سارة عبد الله');
    await createAppointment(context, booking({ durationMinutes: 60 }));

    const result = await createAppointment(context, booking({ clientId: other, startMinute: 10 * 60 + 30 }));

    expect(result).toEqual({ ok: false, error: 'errors.overlap' });
    expect(await countAppointments()).toBe(1);
  });

  test('permits appointments that touch exactly', async () => {
    const other = await createTestClient(context.clinicId, 'سارة عبد الله');
    await createAppointment(context, booking({ durationMinutes: 60 })); // 10:00–11:00

    const result = await createAppointment(context, booking({ clientId: other, startMinute: 11 * 60 }));

    expect(result.ok).toBe(true);
  });

  test('rejects a second booking for the same client that day', async () => {
    await createAppointment(context, booking());

    const result = await createAppointment(context, booking({ startMinute: 14 * 60 }));

    expect(result).toEqual({ ok: false, error: 'errors.clientBooked' });
    expect(await countAppointments()).toBe(1);
  });

  test('permits the same client on the next day', async () => {
    await createAppointment(context, booking());

    expect((await createAppointment(context, booking({ date: THURSDAY }))).ok).toBe(true);
  });

  test('refuses a client belonging to another clinic', async () => {
    const otherClinic = await createTestClinic('Other Clinic');
    const foreign = await createTestClient(otherClinic, 'Someone Else');

    const result = await createAppointment(context, booking({ clientId: foreign }));

    expect(result).toEqual({ ok: false, error: 'errors.notFound' });
    expect(await countAppointments()).toBe(0);
  });

  test('honours opening hours read from the clinic row, not a constant', async () => {
    const shortDay = await createTestClinic('Half Day');
    // A clinic open 09:00–13:00.
    await db.update(clinics).set({ openMinute: 9 * 60, closeMinute: 13 * 60 }).where(eq(clinics.id, shortDay));

    const shortContext: BookingContext = { clinicId: shortDay, ownerName: 'Dr Short' };
    const client = await createTestClient(shortDay, 'Short Day Client');

    const result = await createAppointment(shortContext, {
      clientId: client,
      date: WEDNESDAY,
      startMinute: 14 * 60,
      durationMinutes: 30,
      reason: undefined,
    });

    expect(result).toEqual({ ok: false, error: 'errors.outsideHours' });
  });
});

describe('updateAppointment', () => {
  async function seed(): Promise<string> {
    const result = await createAppointment(context, booking({ durationMinutes: 60 }));
    if (!result.ok) throw new Error('seed booking failed');
    return result.data.id;
  }

  test('moves an appointment', async () => {
    const id = await seed();

    const result = await updateAppointment(context, { ...booking({ startMinute: 14 * 60 }), id });

    expect(result.ok).toBe(true);

    const [row] = await db.select().from(appointments).where(eq(appointments.id, id));
    expect(row?.startMinute).toBe(840);
  });

  test('keeps the appointment on its original practitioner', async () => {
    const id = await seed();
    const [before] = await db.select().from(appointments).where(eq(appointments.id, id));

    await updateAppointment(context, { ...booking({ startMinute: 14 * 60 }), id });

    const [after] = await db.select().from(appointments).where(eq(appointments.id, id));
    expect(after?.practitionerId).toBe(before!.practitionerId);
  });

  test('an appointment does not conflict with itself when resized in place', async () => {
    const id = await seed(); // 10:00–11:00

    expect((await updateAppointment(context, { ...booking({ durationMinutes: 90 }), id })).ok).toBe(true);
  });

  test('an appointment does not trip the one-per-day rule against itself', async () => {
    const id = await seed();

    expect((await updateAppointment(context, { ...booking({ startMinute: 15 * 60 }), id })).ok).toBe(true);
  });

  test('rejects a move onto a different appointment', async () => {
    const id = await seed(); // 10:00–11:00
    const other = await createTestClient(context.clinicId, 'سارة عبد الله');
    await createAppointment(context, booking({ clientId: other, startMinute: 12 * 60, durationMinutes: 60 }));

    const result = await updateAppointment(context, { ...booking({ startMinute: 12 * 60 }), id });

    expect(result).toEqual({ ok: false, error: 'errors.overlap' });

    // The original is untouched.
    const [row] = await db.select().from(appointments).where(eq(appointments.id, id));
    expect(row?.startMinute).toBe(600);
  });

  test('rejects a move onto a closed day', async () => {
    const id = await seed();

    expect(await updateAppointment(context, { ...booking({ date: FRIDAY }), id })).toEqual({
      ok: false,
      error: 'errors.closedDay',
    });
  });

  test('rejects an appointment id from another clinic', async () => {
    const otherClinic = await createTestClinic('Other Clinic');
    const id = await seed();

    const result = await updateAppointment(
      { clinicId: otherClinic, ownerName: 'Dr Elsewhere' },
      { ...booking(), id },
    );

    expect(result).toEqual({ ok: false, error: 'errors.notFound' });
  });

  test('reports a missing appointment as not found', async () => {
    expect(await updateAppointment(context, { ...booking(), id: crypto.randomUUID() })).toEqual({
      ok: false,
      error: 'errors.notFound',
    });
  });

  /**
   * The UI never opens the editor for a finished appointment, but a server
   * action is a public endpoint — the dialog being closed stops an honest
   * mistake, not a crafted request. These write the row directly so the check
   * is tested on its own terms.
   */
  describe('a finished appointment', () => {
    /** Far enough in the past to be finished under any clinic clock. */
    const LAST_YEAR = '2025-08-06'; // a Wednesday

    async function seedPast(): Promise<string> {
      const [row] = await db
        .insert(appointments)
        .values({
          clinicId: context.clinicId,
          practitionerId: await ensurePractitioner(context),
          clientId,
          date: LAST_YEAR,
          startMinute: 10 * 60,
          durationMinutes: 60,
        })
        .returning({ id: appointments.id });

      if (!row) throw new Error('insert into appointments returned no row');
      return row.id;
    }

    test('cannot be edited', async () => {
      const id = await seedPast();

      const result = await updateAppointment(context, { ...booking({ date: LAST_YEAR }), id });

      expect(result).toEqual({ ok: false, error: 'errors.completedLocked' });
    });

    test('is left exactly as it was', async () => {
      const id = await seedPast();

      await updateAppointment(context, { ...booking({ date: WEDNESDAY, startMinute: 14 * 60 }), id });

      const [row] = await db.select().from(appointments).where(eq(appointments.id, id));
      expect(row?.date).toBe(LAST_YEAR);
      expect(row?.startMinute).toBe(600);
      expect(row?.durationMinutes).toBe(60);
    });

    test('cannot be dragged out of the past onto a future date either', async () => {
      const id = await seedPast();

      // The *stored* row is what is judged, so moving it forward is still barred.
      const result = await updateAppointment(context, { ...booking({ date: '2027-08-04' }), id });

      expect(result).toEqual({ ok: false, error: 'errors.completedLocked' });
    });

    test('can still be deleted, the one escape hatch for a mistaken record', async () => {
      const id = await seedPast();

      expect((await deleteAppointment(context.clinicId, id)).ok).toBe(true);
      expect(await countAppointments()).toBe(0);
    });

    test('a future appointment is still editable, so the rule is not blanket', async () => {
      const result = await createAppointment(context, booking({ date: '2027-08-04' }));
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const moved = await updateAppointment(context, {
        ...booking({ date: '2027-08-04', startMinute: 14 * 60 }),
        id: result.data.id,
      });

      expect(moved.ok).toBe(true);
    });
  });
});

describe('deleteAppointment', () => {
  test('removes the appointment', async () => {
    const created = await createAppointment(context, booking());
    if (!created.ok) throw new Error('seed booking failed');

    expect((await deleteAppointment(context.clinicId, created.data.id)).ok).toBe(true);
    expect(await countAppointments()).toBe(0);
  });

  test("refuses to delete another clinic's appointment", async () => {
    const otherClinic = await createTestClinic('Other Clinic');
    const created = await createAppointment(context, booking());
    if (!created.ok) throw new Error('seed booking failed');

    expect(await deleteAppointment(otherClinic, created.data.id)).toEqual({ ok: false, error: 'errors.notFound' });
    expect(await countAppointments()).toBe(1);
  });

  test('reports a missing appointment as not found', async () => {
    expect(await deleteAppointment(context.clinicId, crypto.randomUUID())).toEqual({
      ok: false,
      error: 'errors.notFound',
    });
  });
});

describe('createClientAndBook', () => {
  const newClient = { fullName: 'ليلى حداد', phone: '0599123456' };

  function pending(overrides: Record<string, unknown> = {}) {
    return {
      client: newClient,
      booking: {
        date: WEDNESDAY,
        startMinute: 10 * 60,
        durationMinutes: 30,
        reason: undefined,
        ...overrides,
      },
    };
  }

  test('creates the client and the appointment together', async () => {
    expect((await createClientAndBook(context, pending())).ok).toBe(true);

    const [created] = await db.select().from(clients).where(eq(clients.fullName, newClient.fullName));
    expect(created?.phone).toBe('0599123456');
    expect(created?.clinicId).toBe(context.clinicId);
    expect(await countAppointments()).toBe(1);
  });

  test('assigns the new client an avatar colour', async () => {
    await createClientAndBook(context, pending());

    const [created] = await db.select().from(clients).where(eq(clients.fullName, newClient.fullName));
    expect(created?.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test('writes the normalised search name so the client is findable', async () => {
    await createClientAndBook(context, pending());

    const [created] = await db.select().from(clients).where(eq(clients.fullName, newClient.fullName));
    expect(created?.searchName).toBe('ليلي حداد');
  });

  test('rolls the client back when the slot is rejected', async () => {
    const other = await createTestClient(context.clinicId, 'سارة عبد الله');
    await createAppointment(context, booking({ clientId: other, durationMinutes: 60 }));

    const result = await createClientAndBook(context, pending({ startMinute: 10 * 60 + 30 }));

    expect(result).toEqual({ ok: false, error: 'errors.overlap' });

    // No half-finished record left in the register.
    expect((await db.select().from(clients).where(eq(clients.fullName, newClient.fullName))).length).toBe(0);
  });

  test('rolls the client back when the day is closed', async () => {
    expect(await createClientAndBook(context, pending({ date: FRIDAY }))).toEqual({
      ok: false,
      error: 'errors.closedDay',
    });
    expect((await db.select().from(clients).where(eq(clients.fullName, newClient.fullName))).length).toBe(0);
  });

  test('books with the clinic\'s own practitioner', async () => {
    const result = await createClientAndBook(context, pending());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [row] = await db.select().from(appointments).where(eq(appointments.id, result.data.id));
    const [practitioner] = await db.select().from(practitioners).where(eq(practitioners.id, row!.practitionerId));

    expect(practitioner?.clinicId).toBe(context.clinicId);
  });
});
