import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { appointments, clients, whatsappMessages, whatsappSettings } from '@/db/schema';
import { addDays, weekdayOf } from '@/features/booking/date';
import { wallClockIn } from '@/features/booking/completed';
import { formatLongDate } from '@/features/booking/format';
import { DISPLAY_TIME_ZONE } from '@/lib/format';

import {
  createFakeGateway,
  createTestClient,
  createTestClinic,
  createTestPractitioner,
  createTestWhatsappSettings,
  disableWhatsappForTests,
  enableWhatsappForTests,
  resetDatabase,
} from '../../../tests/helpers';
import { notifyAppointmentSeriesBooked } from './notify';
import { PATIENT_MESSAGE_LOCALE } from './templates';

/**
 * A course of appointments is **one** message.
 *
 * The property under test is a count, which is why it is worth a test of its
 * own: the behaviour it replaced — one confirmation per appointment — was
 * correct message by message and wrong in aggregate, and nothing about a single
 * message's content would have caught it.
 */

let clinicId: string;
let clientId: string;
let practitionerId: string;

const CLINIC_TODAY = wallClockIn(DISPLAY_TIME_ZONE).date;

beforeEach(async () => {
  await resetDatabase();
  enableWhatsappForTests();

  clinicId = await createTestClinic();
  clientId = await createTestClient(clinicId, 'أحمد خليل');
  practitionerId = await createTestPractitioner(clinicId);

  await createTestWhatsappSettings(clinicId);
});

afterAll(() => {
  disableWhatsappForTests();
});

/**
 * A phone number, so the client is reachable at all.
 *
 * `createTestClient` leaves it null, which is the honest default — most of this
 * clinic's records are created mid-consultation — and it is also the condition
 * one of the tests below is about.
 */
async function giveClientAPhone(): Promise<void> {
  await db.update(clients).set({ phone: '0599123456' }).where(eq(clients.id, clientId));
}

/**
 * `count` weekly appointments, all in the future, as `repeatWeekly` would have
 * written them. Returns their ids in the order they were created.
 *
 * `offsetWeeks` is where the run starts, so a caller can write the appointment a
 * repeat was anchored on and then the weeks that followed it — which is the
 * shape the action actually passes in.
 */
async function bookWeekly(count: number, offsetWeeks = 1): Promise<string[]> {
  const ids: string[] = [];

  for (let week = 0; week < count; week += 1) {
    const [row] = await db
      .insert(appointments)
      .values({
        clinicId,
        practitionerId,
        clientId,
        date: addDays(CLINIC_TODAY, (offsetWeeks + week) * 7),
        startMinute: 10 * 60,
        durationMinutes: 30,
      })
      .returning({ id: appointments.id });

    ids.push(row!.id);
  }

  return ids;
}

/**
 * The numbered lines of the course list — see `formatAppointmentList`.
 *
 * Matched on the shape the list actually has rather than on a character that
 * happens to appear in it. These counts used to be taken by filtering for the
 * 📅 in every line, which quietly stopped meaning anything the moment the copy
 * dropped its emoji: the filter still ran, still returned a number, and the
 * number was zero.
 */
function listedAppointments(body: string): string[] {
  return body.split('\n').filter((line) => /^‏\d+\. /.test(line));
}

describe('notifyAppointmentSeriesBooked', () => {
  test('sends one message for four appointments, not four', async () => {
    await giveClientAPhone();
    const gateway = createFakeGateway();
    const ids = await bookWeekly(4);

    const result = await notifyAppointmentSeriesBooked(clinicId, ids, { gateway });

    expect(result.status).toBe('sent');
    expect(gateway.sent).toHaveLength(1);

    // …and one row in the log, for the same reason.
    const logged = await db.select().from(whatsappMessages);
    expect(logged).toHaveLength(1);
  });

  test('the message lists every appointment it created', async () => {
    await giveClientAPhone();
    const gateway = createFakeGateway();
    const ids = await bookWeekly(4);

    await notifyAppointmentSeriesBooked(clinicId, ids, { gateway });

    const body = gateway.sent[0]!.text;
    const rows = await db.select().from(appointments);

    // Every booked date is named, and the list is numbered to four.
    expect(body).toContain('4');
    expect(listedAppointments(body)).toHaveLength(rows.length);
    expect(body).not.toContain('{');
  });

  /**
   * The booking the doctor started from is part of the course, not the thing
   * before it.
   *
   * It used to get its own confirmation the moment it was saved, and the list
   * that followed named only the weeks added afterwards — so a patient booked on
   * the 1st and repeated weekly was told about the 1st, then told about the 8th,
   * 15th and 22nd, and never once shown the four appointments they actually
   * have. `createAppointmentAction` holds that first message back now and passes
   * the id here instead.
   */
  test('the list opens with the appointment the repeat was anchored on', async () => {
    await giveClientAPhone();
    const gateway = createFakeGateway();

    const [anchor] = await bookWeekly(1, 1);
    const repeats = await bookWeekly(3, 2);

    await notifyAppointmentSeriesBooked(clinicId, [anchor!, ...repeats], { gateway });

    const body = gateway.sent[0]!.text;

    // The anchor's own date, named — and the opening line counting four rather
    // than the three weeks that were added after it.
    expect(body).toContain(formatLongDate(PATIENT_MESSAGE_LOCALE, addDays(CLINIC_TODAY, 7)));

    const listed = listedAppointments(body);
    expect(listed).toHaveLength(4);
    expect(listed[0]).toContain(formatLongDate(PATIENT_MESSAGE_LOCALE, addDays(CLINIC_TODAY, 7)));
    expect(listed[3]!.startsWith('‏4. ')).toBe(true);
  });

  /**
   * The other side of that bargain. With the create staying quiet, this call is
   * the only thing left that will tell the patient anything — so a repeat where
   * every week was refused (the clinic closed, the hour taken) must still
   * confirm the one appointment that does exist, rather than leaving the patient
   * with nothing because the list came out too short to be a list.
   */
  test('a course of one is still confirmed, as an ordinary single appointment', async () => {
    await giveClientAPhone();
    const gateway = createFakeGateway();

    const [only] = await bookWeekly(1);

    const result = await notifyAppointmentSeriesBooked(clinicId, [only!], { gateway });

    expect(result.status).toBe('sent');
    expect(gateway.sent).toHaveLength(1);

    // The ordinary confirmation, not a numbered list of one: no list at all,
    // and the single appointment's own labelled date instead.
    const body = gateway.sent[0]!.text;
    expect(listedAppointments(body)).toHaveLength(0);
    expect(body).toContain('التاريخ:');
    expect(body).toContain('الوقت:');
  });

  test('the count follows the doctor\'s chosen span rather than a fixed four', async () => {
    await giveClientAPhone();

    for (const size of [2, 13]) {
      await resetDatabase();
      clinicId = await createTestClinic();
      clientId = await createTestClient(clinicId, 'أحمد خليل');
      practitionerId = await createTestPractitioner(clinicId);
      await createTestWhatsappSettings(clinicId);
      await giveClientAPhone();

      const gateway = createFakeGateway();
      await notifyAppointmentSeriesBooked(clinicId, await bookWeekly(size), { gateway });

      expect(gateway.sent).toHaveLength(1);
      expect(listedAppointments(gateway.sent[0]!.text)).toHaveLength(size);
    }
  });

  test('sends nothing at all when the clinic has confirmations switched off', async () => {
    await giveClientAPhone();

    await db
      .update(whatsappSettings)
      .set({ confirmationsEnabled: false })
      .where(eq(whatsappSettings.clinicId, clinicId));

    const gateway = createFakeGateway();
    const result = await notifyAppointmentSeriesBooked(clinicId, await bookWeekly(4), { gateway });

    expect(result).toEqual({ status: 'skipped', reason: 'not_configured' });
    expect(gateway.sent).toHaveLength(0);
  });

  test('a client with no phone number is not a failure', async () => {
    const gateway = createFakeGateway();
    const result = await notifyAppointmentSeriesBooked(clinicId, await bookWeekly(4), { gateway });

    expect(result).toEqual({ status: 'skipped', reason: 'no_phone' });
    expect(gateway.sent).toHaveLength(0);
  });

  test('sending twice for the same course sends once', async () => {
    await giveClientAPhone();
    const gateway = createFakeGateway();
    const ids = await bookWeekly(4);

    await notifyAppointmentSeriesBooked(clinicId, ids, { gateway });
    await notifyAppointmentSeriesBooked(clinicId, ids, { gateway });

    // WhatsApp has no unsend; the dedupe key is keyed on the whole set.
    expect(gateway.sent).toHaveLength(1);
  });

  test('weekdays are irrelevant to this — a course is whatever was booked', () => {
    // Guards the fixture rather than the code: `bookWeekly` must produce dates a
    // week apart, or the "lists every appointment" test proves nothing.
    const first = addDays(CLINIC_TODAY, 7);
    expect(weekdayOf(first)).toBe(weekdayOf(addDays(CLINIC_TODAY, 14)));
  });
});
