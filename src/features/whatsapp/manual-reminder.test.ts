import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { appointments, clients, whatsappSettings } from '@/db/schema';
import { wallClockIn } from '@/features/booking/completed';
import { addDays } from '@/features/booking/date';
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
import { sendAppointmentReminderNow } from './notify';

/**
 * The reminder the dietitian sends by pressing a button.
 *
 * Its three interesting properties are the three ways it differs from the
 * nightly run, and every one of them is a thing somebody could reasonably have
 * built the other way: it ignores the automation switch, it sends again when
 * pressed again, and it still refuses an appointment that has already started.
 *
 * The clock is real here rather than injected — `isPast` reads the clinic's own
 * wall clock — so the appointments are booked relative to the clinic's today.
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
  await db.update(clients).set({ phone: '0599123456' }).where(eq(clients.id, clientId));
});

afterAll(() => {
  disableWhatsappForTests();
});

async function book(date: string, startMinute = 10 * 60): Promise<string> {
  const [row] = await db
    .insert(appointments)
    .values({ clinicId, practitionerId, clientId, date, startMinute, durationMinutes: 30 })
    .returning({ id: appointments.id });

  if (!row) throw new Error('insert into appointments returned no row');

  return row.id;
}

describe('sendAppointmentReminderNow', () => {
  test('sends the same reminder the run sends, in Arabic', async () => {
    const id = await book(addDays(CLINIC_TODAY, 3));
    const gateway = createFakeGateway();

    const result = await sendAppointmentReminderNow(clinicId, id, { gateway });

    expect(result.status).toBe('sent');
    expect(gateway.sent).toHaveLength(1);
    expect(gateway.sent[0]?.text).toContain('نذكّرك بموعدك');
  });

  /*
    The switch governs the automation. A clinic that turned the nightly run off
    did so to take the decision back, not to lose the ability to remind anybody
    — and a button that silently did nothing because of a setting on another
    screen is the worst version of this control.
  */
  test('sends even when the clinic has the nightly reminders switched off', async () => {
    await db
      .update(whatsappSettings)
      .set({ remindersEnabled: false })
      .where(eq(whatsappSettings.clinicId, clinicId));

    const id = await book(addDays(CLINIC_TODAY, 3));
    const gateway = createFakeGateway();

    expect((await sendAppointmentReminderNow(clinicId, id, { gateway })).status).toBe('sent');
  });

  /* A person pressing twice means it twice — see `manualReminderDedupeKey`. */
  test('pressing it again sends again', async () => {
    const id = await book(addDays(CLINIC_TODAY, 3));
    const gateway = createFakeGateway();

    await sendAppointmentReminderNow(clinicId, id, { gateway });
    await sendAppointmentReminderNow(clinicId, id, { gateway });

    expect(gateway.sent).toHaveLength(2);
  });

  test('refuses an appointment that has already gone', async () => {
    const id = await book(addDays(CLINIC_TODAY, -1));
    const gateway = createFakeGateway();

    const result = await sendAppointmentReminderNow(clinicId, id, { gateway });

    expect(result).toMatchObject({ status: 'skipped', reason: 'in_the_past' });
    expect(gateway.sent).toHaveLength(0);
  });

  test('a client with no number is a skip, not a failure', async () => {
    await db.update(clients).set({ phone: null }).where(eq(clients.id, clientId));

    const id = await book(addDays(CLINIC_TODAY, 3));
    const gateway = createFakeGateway();

    expect(await sendAppointmentReminderNow(clinicId, id, { gateway })).toMatchObject({
      status: 'skipped',
      reason: 'no_phone',
    });
  });

  /* The tenant boundary: an id from another clinic resolves to nothing here. */
  test('will not remind another clinic’s patient', async () => {
    const otherClinic = await createTestClinic('Other');
    const otherClient = await createTestClient(otherClinic, 'سارة');
    const otherPractitioner = await createTestPractitioner(otherClinic);

    await db.update(clients).set({ phone: '0598222333' }).where(eq(clients.id, otherClient));

    const [row] = await db
      .insert(appointments)
      .values({
        clinicId: otherClinic,
        practitionerId: otherPractitioner,
        clientId: otherClient,
        date: addDays(CLINIC_TODAY, 3),
        startMinute: 10 * 60,
        durationMinutes: 30,
      })
      .returning({ id: appointments.id });

    const gateway = createFakeGateway();

    expect(await sendAppointmentReminderNow(clinicId, row!.id, { gateway })).toMatchObject({
      status: 'skipped',
    });
    expect(gateway.sent).toHaveLength(0);
  });
});
