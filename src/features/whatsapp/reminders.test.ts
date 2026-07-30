import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { appointments, clients } from '@/db/schema';

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
import { listRecentMessages } from './queries';
import {
  isReminderDue,
  REMINDER_LEAD_MINUTES,
  reminderDateWindow,
  selectDueReminders,
  sendDueAppointmentReminders,
  wallClockMinutesBetween,
} from './reminders';
import { type ReminderCandidate } from './types';

/**
 * Reminder scheduling, in two halves: the pure wall-clock rule, and the run that
 * applies it against the database.
 *
 * The instants below are UTC and the clinic is `Asia/Hebron` (UTC+3 in summer), so
 * `2026-08-04T05:00:00Z` is 08:00 on the clinic's clock. That offset is the whole
 * reason this arithmetic is worth testing.
 */

const HEBRON_08_00_ON_AUG_4 = new Date('2026-08-04T05:00:00Z');

const candidate = (overrides: Partial<ReminderCandidate> = {}): ReminderCandidate => ({
  appointmentId: 'appointment-1',
  clientId: 'client-1',
  date: '2026-08-05',
  startMinute: 9 * 60,
  clientName: 'أحمد',
  phone: '0599123456',
  preferredLocale: 'ar',
  ...overrides,
});

describe('wallClockMinutesBetween', () => {
  test('counts minutes forward within one day', () => {
    expect(wallClockMinutesBetween({ date: '2026-08-05', minute: 8 * 60 }, { date: '2026-08-05', minute: 9 * 60 })).toBe(
      60,
    );
  });

  test('counts across a day boundary', () => {
    expect(
      wallClockMinutesBetween({ date: '2026-08-04', minute: 23 * 60 }, { date: '2026-08-05', minute: 1 * 60 }),
    ).toBe(120);
  });

  test('counts across a month boundary', () => {
    expect(wallClockMinutesBetween({ date: '2026-07-31', minute: 0 }, { date: '2026-08-01', minute: 0 })).toBe(1440);
  });

  test('goes negative for something already past', () => {
    expect(wallClockMinutesBetween({ date: '2026-08-05', minute: 600 }, { date: '2026-08-05', minute: 540 })).toBe(-60);
  });

  test('returns null for a date that is not a real one', () => {
    expect(wallClockMinutesBetween({ date: '2026-02-30', minute: 0 }, { date: '2026-03-01', minute: 0 })).toBeNull();
  });
});

describe('isReminderDue', () => {
  const now = { date: '2026-08-04', minute: 8 * 60 };

  test('is due once the appointment is inside the lead window', () => {
    // 25 hours away, reminded a day ahead: not yet.
    expect(isReminderDue({ date: '2026-08-05', startMinute: 9 * 60 }, now, 24 * 60)).toBe(false);
    // 24 hours away exactly: due. The boundary is inclusive so a tick that lands
    // on it does not have to wait for the next one.
    expect(isReminderDue({ date: '2026-08-05', startMinute: 8 * 60 }, now, 24 * 60)).toBe(true);
    expect(isReminderDue({ date: '2026-08-04', startMinute: 10 * 60 }, now, 24 * 60)).toBe(true);
  });

  test('is not due for an appointment that has already started', () => {
    // The lower bound is what stops a clinic connecting WhatsApp on a Friday from
    // reminding everybody about Monday through Thursday.
    expect(isReminderDue({ date: '2026-08-04', startMinute: 7 * 60 }, now, 24 * 60)).toBe(false);
    expect(isReminderDue({ date: '2026-08-01', startMinute: 9 * 60 }, now, 24 * 60)).toBe(false);
  });

  test('respects a short lead time', () => {
    expect(isReminderDue({ date: '2026-08-04', startMinute: 9 * 60 }, now, 120)).toBe(true);
    expect(isReminderDue({ date: '2026-08-04', startMinute: 11 * 60 }, now, 120)).toBe(false);
  });
});

describe('reminderDateWindow', () => {
  test('covers enough days for the lead time', () => {
    expect(reminderDateWindow({ date: '2026-08-04', minute: 8 * 60 }, 24 * 60)).toEqual({
      fromDate: '2026-08-04',
      toDate: '2026-08-06',
    });
  });

  test('a two-hour lead needs today only', () => {
    expect(reminderDateWindow({ date: '2026-08-04', minute: 8 * 60 }, 120)).toEqual({
      fromDate: '2026-08-04',
      toDate: '2026-08-05',
    });
  });
});

describe('selectDueReminders', () => {
  const now = { date: '2026-08-04', minute: 8 * 60 };

  test('keeps the due ones and orders them soonest first', () => {
    const due = selectDueReminders(
      [
        candidate({ appointmentId: 'later', date: '2026-08-04', startMinute: 15 * 60 }),
        candidate({ appointmentId: 'past', date: '2026-08-04', startMinute: 7 * 60 }),
        candidate({ appointmentId: 'soon', date: '2026-08-04', startMinute: 9 * 60 }),
        candidate({ appointmentId: 'far', date: '2026-08-09', startMinute: 9 * 60 }),
      ],
      now,
      24 * 60,
    );

    expect(due.map((entry) => entry.appointmentId)).toEqual(['soon', 'later']);
  });

  test('caps a run and keeps the closest appointments', () => {
    const due = selectDueReminders(
      [
        candidate({ appointmentId: 'a', startMinute: 9 * 60, date: '2026-08-04' }),
        candidate({ appointmentId: 'b', startMinute: 10 * 60, date: '2026-08-04' }),
        candidate({ appointmentId: 'c', startMinute: 11 * 60, date: '2026-08-04' }),
      ],
      now,
      24 * 60,
      2,
    );

    expect(due.map((entry) => entry.appointmentId)).toEqual(['a', 'b']);
  });
});

describe('sendDueAppointmentReminders', () => {
  let clinicId: string;
  let practitionerId: string;
  let clientId: string;

  beforeEach(async () => {
    await resetDatabase();
    enableWhatsappForTests();

    clinicId = await createTestClinic();
    practitionerId = await createTestPractitioner(clinicId);
    clientId = await createTestClient(clinicId, 'أحمد خليل');

    await db.update(clients).set({ phone: '0599123456' }).where(eq(clients.id, clientId));
  });

  afterAll(() => {
    disableWhatsappForTests();
  });

  async function book(date: string, startMinute: number): Promise<string> {
    const [row] = await db
      .insert(appointments)
      .values({ clinicId, practitionerId, clientId, date, startMinute, durationMinutes: 30 })
      .returning({ id: appointments.id });

    if (!row) throw new Error('insert into appointments returned no row');

    return row.id;
  }

  const run = (gateway: ReturnType<typeof createFakeGateway>) =>
    sendDueAppointmentReminders({ gateway, now: HEBRON_08_00_ON_AUG_4, spacingMs: 0 });

  test('reminds about tomorrow morning, in Arabic', async () => {
    await createTestWhatsappSettings(clinicId);
    await book('2026-08-05', 7 * 60 + 30);

    const gateway = createFakeGateway();
    const summary = await run(gateway);

    expect(summary).toMatchObject({ clinics: 1, sent: 1, failed: 0 });
    expect(gateway.sent).toHaveLength(1);
    expect(gateway.sent[0]?.chatId).toBe('970599123456@c.us');
    expect(gateway.sent[0]?.text).toContain('نذكّرك بموعدك');
    // Western digits in Arabic, per the project's nu-latn rule.
    expect(gateway.sent[0]?.text).toContain('7:30');
  });

  test('writes to a client whose record says English in Arabic anyway', async () => {
    // `preferred_locale` governs the portal, where the client chose it. Every
    // WhatsApp message is Arabic — see PATIENT_MESSAGE_LOCALE.
    await db.update(clients).set({ preferredLocale: 'en' }).where(eq(clients.id, clientId));

    await createTestWhatsappSettings(clinicId);
    await book('2026-08-05', 8 * 60);

    const gateway = createFakeGateway();
    await run(gateway);

    expect(gateway.sent[0]?.text).toContain('نذكّرك بموعدك');
    expect(gateway.sent[0]?.text).not.toContain('A reminder of your appointment');
  });

  test('the lead time is one day: 23 hours out is due, 25 is not', async () => {
    // The clinic's rule, and the only lead in use. `now` is 08:00 on the 4th.
    await createTestWhatsappSettings(clinicId);
    await book('2026-08-05', 7 * 60);

    const gateway = createFakeGateway();
    expect(await run(gateway)).toMatchObject({ sent: 1 });

    const otherClientId = await createTestClient(clinicId, 'سارة');
    await db.update(clients).set({ phone: '0598222333' }).where(eq(clients.id, otherClientId));
    await db.insert(appointments).values({
      clinicId,
      practitionerId,
      clientId: otherClientId,
      date: '2026-08-05',
      startMinute: 9 * 60,
      durationMinutes: 30,
    });

    // 25 hours away: still nothing new to send.
    expect(await run(gateway)).toMatchObject({ sent: 0 });
    expect(gateway.sent).toHaveLength(1);
  });

  test('the stored lead is one day out of the box', async () => {
    const settings = await createTestWhatsappSettings(clinicId);

    expect(settings.reminderLeadMinutes).toBe(REMINDER_LEAD_MINUTES);
    expect(REMINDER_LEAD_MINUTES).toBe(24 * 60);
  });

  test('sends each reminder exactly once across repeated runs', async () => {
    await createTestWhatsappSettings(clinicId);
    await book('2026-08-05', 7 * 60 + 30);

    const gateway = createFakeGateway();

    await run(gateway);
    const second = await run(gateway);

    expect(gateway.sent).toHaveLength(1);
    expect(second).toMatchObject({ sent: 0, skipped: 1 });
  });

  test('leaves an appointment outside the lead window alone', async () => {
    // A hand-set lead on the row, to prove the run still reads the column rather
     // than the constant — the only way a clinic can differ from one day.
    await createTestWhatsappSettings(clinicId, { reminderLeadMinutes: 120 });
    await book('2026-08-05', 9 * 60);

    const gateway = createFakeGateway();

    expect(await run(gateway)).toMatchObject({ sent: 0 });
    expect(gateway.sent).toHaveLength(0);
  });

  test('ignores a clinic with reminders switched off', async () => {
    await createTestWhatsappSettings(clinicId, { remindersEnabled: false });
    await book('2026-08-05', 8 * 60);

    const gateway = createFakeGateway();

    expect(await run(gateway)).toMatchObject({ clinics: 0, sent: 0 });
    expect(gateway.sent).toHaveLength(0);
  });

  test('ignores a clinic whose phone is not paired right now', async () => {
    await createTestWhatsappSettings(clinicId, { status: 'disconnected' });
    await book('2026-08-05', 8 * 60);

    expect(await run(createFakeGateway())).toMatchObject({ clinics: 0, sent: 0 });
  });

  test('skips a client with no phone number, and says nothing was sent', async () => {
    await db.update(clients).set({ phone: null }).where(eq(clients.id, clientId));

    await createTestWhatsappSettings(clinicId);
    await book('2026-08-05', 8 * 60);

    const gateway = createFakeGateway();

    expect(await run(gateway)).toMatchObject({ sent: 0, skipped: 0 });
    expect(gateway.sent).toHaveLength(0);
  });

  test('records a gateway failure without stopping the run', async () => {
    await createTestWhatsappSettings(clinicId);
    await book('2026-08-05', 8 * 60);

    const gateway = createFakeGateway();
    gateway.failWith = new Error('gateway is down');

    expect(await run(gateway)).toMatchObject({ sent: 0, failed: 1 });

    const [row] = await listRecentMessages(clinicId);
    expect(row?.status).toBe('failed');
    expect(row?.kind).toBe('appointment_reminder');
  });

  test('reminds each clinic about its own appointments only', async () => {
    const otherClinicId = await createTestClinic('Other Clinic');
    const otherPractitionerId = await createTestPractitioner(otherClinicId, 'Dr Other');
    const otherClientId = await createTestClient(otherClinicId, 'سارة');

    await db.update(clients).set({ phone: '0598222333' }).where(eq(clients.id, otherClientId));

    await createTestWhatsappSettings(clinicId);
    await createTestWhatsappSettings(otherClinicId);

    await book('2026-08-05', 8 * 60);
    await db.insert(appointments).values({
      clinicId: otherClinicId,
      practitionerId: otherPractitionerId,
      clientId: otherClientId,
      date: '2026-08-05',
      // Inside a 24-hour lead from 08:00 on the 4th; 09:00 would be 25 hours out.
      startMinute: 7 * 60,
      durationMinutes: 30,
    });

    const gateway = createFakeGateway();
    const summary = await run(gateway);

    expect(summary).toMatchObject({ clinics: 2, sent: 2 });
    expect(new Set(gateway.sent.map((entry) => entry.sessionId)).size).toBe(2);

    // Each clinic's log holds only its own message.
    expect(await listRecentMessages(clinicId)).toHaveLength(1);
    expect(await listRecentMessages(otherClinicId)).toHaveLength(1);
  });
});
