import { beforeEach, describe, expect, test } from 'bun:test';

import { db } from '@/db';
import { appointments, clientPlanAdherence, clientSettings, weeklyPlans } from '@/db/schema';

import {
  createTestClient,
  createTestClinic,
  createTestPractitioner,
  createTestPushSubscription,
  resetDatabase,
} from '../../../../tests/helpers';
import { hasPushConsent, listCheckInReminderCandidates, listPushReminderCandidates } from './queries';

/**
 * The candidate queries, which decide who a tick even considers.
 *
 * They matter more than they look: consent is enforced *in SQL* here rather
 * than by a filter afterwards, so a mistake in one of these predicates is a
 * client notified against their wishes, or a client who is never notified at
 * all — and neither shows up anywhere else. The `coalesce` against the column
 * defaults is the specific thing worth pinning down, because almost every
 * client has no `client_settings` row.
 */

const TODAY = '2026-09-01';

let clinicId: string;
let clientId: string;
let practitionerId: string;

beforeEach(async () => {
  await resetDatabase();

  clinicId = await createTestClinic();
  clientId = await createTestClient(clinicId, 'أحمد خليل');
  practitionerId = await createTestPractitioner(clinicId);
});

async function bookAppointment(date = TODAY, startMinute = 10 * 60): Promise<string> {
  const [row] = await db
    .insert(appointments)
    .values({ clinicId, clientId, practitionerId, date, startMinute, durationMinutes: 30 })
    .returning({ id: appointments.id });

  if (!row) throw new Error('insert into appointments returned no row');

  return row.id;
}

async function publishPlanCovering(weekStartDate: string): Promise<void> {
  await db.insert(weeklyPlans).values({
    clinicId,
    clientId,
    weekStartDate,
    status: 'published',
    kcalTargetSnapshot: 1800,
  });
}

describe('hasPushConsent', () => {
  test('a client with no settings row consents to all four', async () => {
    // The majority case — the row is written lazily on first save.
    expect(await hasPushConsent(clientId, 'appointment_reminder')).toBe(true);
    expect(await hasPushConsent(clientId, 'check_in_reminder')).toBe(true);
    expect(await hasPushConsent(clientId, 'plan_update')).toBe(true);
    expect(await hasPushConsent(clientId, 'clinic_message')).toBe(true);
  });

  test('reads the switch the client actually set', async () => {
    await db.insert(clientSettings).values({ clientId, notifyAppointmentReminder: false });

    expect(await hasPushConsent(clientId, 'appointment_reminder')).toBe(false);
    // The other three are untouched by that one switch.
    expect(await hasPushConsent(clientId, 'plan_update')).toBe(true);
  });
});

describe('listPushReminderCandidates', () => {
  test('finds an appointment for a client with a device', async () => {
    const appointmentId = await bookAppointment();
    await createTestPushSubscription(clientId);

    const rows = await listPushReminderCandidates(TODAY, TODAY);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ clientId, appointmentId, date: TODAY, startMinute: 600 });
  });

  test('ignores a client with no device', async () => {
    await bookAppointment();

    expect(await listPushReminderCandidates(TODAY, TODAY)).toHaveLength(0);
  });

  test('ignores a client who turned appointment reminders off', async () => {
    await bookAppointment();
    await createTestPushSubscription(clientId);
    await db.insert(clientSettings).values({ clientId, notifyAppointmentReminder: false });

    expect(await listPushReminderCandidates(TODAY, TODAY)).toHaveLength(0);
  });

  test('one candidate per appointment, however many devices', async () => {
    await bookAppointment();
    await createTestPushSubscription(clientId);
    await createTestPushSubscription(clientId);

    // `exists`, not a join — a client with a phone and a tablet is reminded
    // once, on both.
    expect(await listPushReminderCandidates(TODAY, TODAY)).toHaveLength(1);
  });

  test('respects the date window', async () => {
    await bookAppointment('2026-09-05');
    await createTestPushSubscription(clientId);

    expect(await listPushReminderCandidates(TODAY, '2026-09-03')).toHaveLength(0);
    expect(await listPushReminderCandidates(TODAY, '2026-09-07')).toHaveLength(1);
  });
});

describe('listCheckInReminderCandidates', () => {
  test('nudges a client on a published plan who has not logged today', async () => {
    await publishPlanCovering(TODAY);
    await createTestPushSubscription(clientId);

    const rows = await listCheckInReminderCandidates(TODAY);

    expect(rows).toEqual([{ clientId }]);
  });

  test('says nothing to a client who already logged today', async () => {
    await publishPlanCovering(TODAY);
    await createTestPushSubscription(clientId);
    await db.insert(clientPlanAdherence).values({
      clinicId,
      clientId,
      date: TODAY,
      level: 'full',
      completedMeals: 4,
      totalMeals: 4,
    });

    expect(await listCheckInReminderCandidates(TODAY)).toHaveLength(0);
  });

  test('says nothing to a client with no plan to log against', async () => {
    await createTestPushSubscription(clientId);

    expect(await listCheckInReminderCandidates(TODAY)).toHaveLength(0);
  });

  test('a plan whose week has ended does not count', async () => {
    // The week window is `weekStartDate .. weekStartDate + 6`, the same one
    // the plan screen opens on.
    await publishPlanCovering('2026-08-24');
    await createTestPushSubscription(clientId);

    expect(await listCheckInReminderCandidates(TODAY)).toHaveLength(0);

    // The last day of a week that does still cover today.
    await publishPlanCovering('2026-08-26');
    expect(await listCheckInReminderCandidates('2026-09-01')).toHaveLength(1);
  });

  test('a draft plan does not count', async () => {
    await db.insert(weeklyPlans).values({
      clinicId,
      clientId,
      weekStartDate: TODAY,
      status: 'draft',
      kcalTargetSnapshot: 1800,
    });
    await createTestPushSubscription(clientId);

    expect(await listCheckInReminderCandidates(TODAY)).toHaveLength(0);
  });

  test('ignores a client who turned check-in reminders off', async () => {
    await publishPlanCovering(TODAY);
    await createTestPushSubscription(clientId);
    await db.insert(clientSettings).values({ clientId, notifyCheckInReminder: false });

    expect(await listCheckInReminderCandidates(TODAY)).toHaveLength(0);
  });

  test('ignores a client with no device', async () => {
    await publishPlanCovering(TODAY);

    expect(await listCheckInReminderCandidates(TODAY)).toHaveLength(0);
  });
});
