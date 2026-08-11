import { beforeEach, describe, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { appointments, clients, clinicWorkingHours, practitioners } from '@/db/schema';
import { getClient } from '@/features/clients/queries';
import { DISPLAY_TIME_ZONE } from '@/lib/format';

import { createTestClient, createTestClinic, createTestPractitioner, resetDatabase } from '../../../tests/helpers';
import { wallClockIn } from './completed';
import { addDays, weekdayOf } from './date';
import {
  createAppointment,
  createClientAndBook,
  deleteAppointment,
  ensurePractitioner,
  repeatWeekly,
  updateAppointment,
  type BookingContext,
} from './mutations';
import { patientHue } from './patient-color';
import { listAppointments } from './queries';
import { weeklyRepeatDates } from './repeat';

/**
 * The server-side half of the rules.
 *
 * `validation.test.ts` proves the rules themselves; these prove the mutations
 * apply them against rows read inside the transaction, that every write is
 * scoped to the caller's clinic, and that the practitioner is resolved from the
 * session rather than accepted from the request.
 */

const CLINIC_TODAY = wallClockIn(DISPLAY_TIME_ZONE).date;

/**
 * The next such weekday, strictly after today.
 *
 * These used to be fixed dates. They cannot be any more: a booking before today
 * is now refused, so a hardcoded 2026-08-05 would quietly start failing every
 * test in this file the day it passed. Strictly after today rather than on or
 * after, because a fixture landing on today would also trip the completed-lock
 * once the clinic's clock passed the appointment's time — a suite that passed
 * in the morning and failed in the afternoon.
 */
function upcoming(weekday: number): string {
  for (let offset = 1; offset <= 7; offset += 1) {
    const date = addDays(CLINIC_TODAY, offset);
    if (weekdayOf(date) === weekday) return date;
  }

  throw new Error(`no date with weekday ${weekday} in the coming week`);
}

/** The clinic works Sunday–Thursday, so Friday is its weekend. */
const WEDNESDAY = upcoming(3);
const THURSDAY = upcoming(4);
const FRIDAY = upcoming(5);

/**
 * Yesterday — which staff may now book, so what it lands on matters.
 *
 * It used to be irrelevant: the past-date rule fired before the working-day one
 * whatever weekday it was. With no floor on staff writes, the clinic's weekend
 * is the only thing left that can refuse it, and that depends on the day this
 * suite happens to run. Hence the `closedDay` branch in the cases below.
 */
const YESTERDAY = addDays(CLINIC_TODAY, -1);

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

  /**
   * Staff writes pass no `earliestDate`, so no date is too old to record. The
   * clinic writes visits up after they happen, and this is the path that has to
   * accept them — the portal is the caller that still carries a floor, and it
   * books through `appointmentRequests` rather than here.
   */
  test('accepts yesterday, so a visit can be written up after it happened', async () => {
    const result = await createAppointment(context, booking({ date: YESTERDAY }));

    // Yesterday may be the clinic's weekend, in which case the closed-day rule
    // refuses it — the point being asserted is only that it is never `pastDate`.
    if (!result.ok) expect(result.error).toBe('errors.closedDay');
    else expect(await countAppointments()).toBe(1);
  });

  test('accepts a date years in the past', async () => {
    const result = await createAppointment(context, booking({ date: '2020-01-06' }));

    if (!result.ok) expect(result.error).toBe('errors.closedDay');
    else expect(await countAppointments()).toBe(1);
  });

  test('accepts today, since no rule here is about the hour either', async () => {
    const result = await createAppointment(context, booking({ date: CLINIC_TODAY }));

    if (!result.ok) expect(result.error).toBe('errors.closedDay');
    else expect(await countAppointments()).toBe(1);
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

  test('honours opening hours read from the weekday schedule, not a constant', async () => {
    const shortDay = await createTestClinic('Half Day');
    // A clinic open 09:00–13:00.
    await db
      .update(clinicWorkingHours)
      .set({ openMinute: 9 * 60, closeMinute: 13 * 60 })
      .where(and(eq(clinicWorkingHours.clinicId, shortDay), eq(clinicWorkingHours.isWorking, true)));

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

  /**
   * The action tells a reschedule from an ordinary edit by comparing these to
   * what was submitted, and names the old slot in the message. This transaction
   * is the last place the previous values exist.
   */
  test('reports where the appointment was before the move', async () => {
    const id = await seed();

    const result = await updateAppointment(context, { ...booking({ startMinute: 14 * 60 }), id });

    expect(result).toEqual({ ok: true, data: { previous: { date: WEDNESDAY, startMinute: 10 * 60 } } });
  });

  test('reports the previous slot even when nothing about it changed', async () => {
    const id = await seed();

    // An edit that leaves date and time alone: the caller compares and sends the
    // confirmation rather than a "your appointment moved" message.
    const result = await updateAppointment(context, { ...booking({ reason: 'متابعة' }), id });

    expect(result).toEqual({ ok: true, data: { previous: { date: WEDNESDAY, startMinute: 10 * 60 } } });
  });

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

  /**
   * Moving is judged exactly like creating, and neither has a floor. The two
   * used to disagree in one direction or the other, which is what made the same
   * slot reachable by typing a date and not by dragging onto it.
   */
  test('accepts a move onto a date that has already passed', async () => {
    const id = await seed();

    const result = await updateAppointment(context, { ...booking({ date: YESTERDAY }), id });
    const [row] = await db.select().from(appointments).where(eq(appointments.id, id));

    if (result.ok) {
      expect(row?.date).toBe(YESTERDAY);
    } else {
      // Only the clinic's weekend can refuse it now, and then nothing moved.
      expect(result.error).toBe('errors.closedDay');
      expect(row?.date).toBe(WEDNESDAY);
    }
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

  /**
   * The cancellation message is sent after the row is gone, so the delete has to
   * hand back who it was for and when. Without this there is nothing left to
   * join against and the patient is never told.
   */
  test('returns who the appointment was for and when, so it can be cancelled by message', async () => {
    const created = await createAppointment(context, booking({ startMinute: 11 * 60 }));
    if (!created.ok) throw new Error('seed booking failed');

    const result = await deleteAppointment(context.clinicId, created.data.id);

    expect(result).toEqual({
      ok: true,
      data: { id: created.data.id, clientId, date: WEDNESDAY, startMinute: 11 * 60 },
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

  /*
    The colour is not written anywhere — it is the client's position in the
    clinic, so it exists the moment the row does. What this proves is that the
    two surfaces read the same one: the register colours the new client from the
    `seq` on their record, the calendar colours the block from the `clientSeq`
    that travels with the appointment, and a patient whose card did not match
    their register disc is exactly the bug this shape removes.

    Position 1, not 0: `beforeEach` registers أحمد خليل first, so a new client
    landing on 0 would mean the numbering collided rather than appended — and
    two patients on one hue is the other half of the same bug.
  */
  test('gives the new client the colour their appointment card is drawn in', async () => {
    const result = await createClientAndBook(context, pending());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const record = await getClient(context.clinicId, result.data.clientId);
    const [block] = await listAppointments(context.clinicId, WEDNESDAY, WEDNESDAY);

    expect(record?.seq).toBe(1);
    expect(block?.clientSeq).toBe(record?.seq);
    expect(patientHue(block!.clientSeq)).toBe(patientHue(record!.seq));
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

  test('takes a client and a past date together, so a walk-in can be written up after the fact', async () => {
    const result = await createClientAndBook(context, pending({ date: YESTERDAY }));
    const created = await db.select().from(clients).where(eq(clients.fullName, newClient.fullName));

    if (result.ok) {
      expect(created.length).toBe(1);
      expect(await countAppointments()).toBe(1);
    } else {
      // The clinic's weekend is the only refusal left, and it still rolls the
      // client back — which the closed-day case above pins down directly.
      expect(result.error).toBe('errors.closedDay');
      expect(created.length).toBe(0);
      expect(await countAppointments()).toBe(0);
    }
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

/**
 * The offer made straight after a booking is saved.
 *
 * The point of these is the best-effort contract: a week the calendar refuses
 * is skipped and counted, not allowed to take the rest of the month down with
 * it. Everything about *whether* a given week is bookable is already proven
 * above — these prove only what the repeat does with the answer.
 */
describe('repeatWeekly', () => {
  /** A booking plus how many weekly appointments to add after it. */
  function repeating(weeks: number, overrides = {}) {
    return { ...booking(overrides), weeks };
  }

  test('books one appointment a week for the span asked for', async () => {
    const result = await repeatWeekly(context, repeating(3));

    expect(result).toEqual({ ok: true, data: { ids: expect.any(Array), created: 3, skipped: 0 } });

    const rows = await db.select().from(appointments).where(eq(appointments.clientId, clientId));

    expect(rows.map((row) => row.date).sort()).toEqual([7, 14, 21].map((days) => addDays(WEDNESDAY, days)));
    // Same hour, same length — a repeat is the same appointment a week later.
    expect(rows.every((row) => row.startMinute === 600 && row.durationMinutes === 30)).toBe(true);
  });

  test('one week is the single appointment after this one, not none', async () => {
    const result = await repeatWeekly(context, repeating(1));

    expect(result.ok && result.data.created).toBe(1);

    const rows = await db.select().from(appointments).where(eq(appointments.clientId, clientId));
    expect(rows.map((row) => row.date)).toEqual([addDays(WEDNESDAY, 7)]);
  });

  test('the dates written are the ones the dialog previewed', async () => {
    await repeatWeekly(context, repeating(13));

    const rows = await db.select().from(appointments).where(eq(appointments.clientId, clientId));
    // Same function the dialog counts with, so a preview cannot promise three
    // months the server then declines to write.
    expect(rows.map((row) => row.date).sort()).toEqual(weeklyRepeatDates(WEDNESDAY, 13));
  });

  test('skips a week whose slot is taken and reports how many', async () => {
    const other = await createTestClient(context.clinicId, 'سارة عبد الله');
    await createAppointment(context, booking({ clientId: other, date: addDays(WEDNESDAY, 14) }));

    const result = await repeatWeekly(context, repeating(3));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data).toEqual({ ids: expect.any(Array), created: 2, skipped: 1 });

    // The other two weeks still went in — the refused one is not contagious.
    const rows = await db.select().from(appointments).where(eq(appointments.clientId, clientId));
    expect(rows.map((row) => row.date).sort()).toEqual([addDays(WEDNESDAY, 7), addDays(WEDNESDAY, 21)]);
  });

  test('never books another clinic\'s client, however many weeks are asked for', async () => {
    const otherClinic = await createTestClinic('Other Clinic');
    const foreign = await createTestClient(otherClinic, 'مريم سالم');

    expect(await repeatWeekly(context, repeating(26, { clientId: foreign }))).toEqual({
      ok: false,
      error: 'errors.notFound',
    });
    expect(await countAppointments()).toBe(0);
  });
});
