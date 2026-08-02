import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { appointments, clinics, clinicWorkingHours, practitioners, user } from '@/db/schema';
import { createTestClient, createTestClinic, createTestPractitioner, resetDatabase } from '../../../tests/helpers';

import { defaultClinicScheduleRows } from './default-schedule';
import {
  completeOnboarding,
  saveClinicInformation,
  saveProfessionalProfile,
  saveWeeklySchedule,
} from './mutations';
import { countFutureScheduleConflicts, getClinicProfile, isClinicOnboardingComplete } from './queries';
import type { ClinicInformationInput, ProfessionalProfileInput, WeeklyScheduleInput } from './schema';

const CLINIC: ClinicInformationInput = {
  name: 'Qiwam Clinic',
  phone: '+970 59 123 4567',
  contactEmail: 'clinic@qiwam.test',
  address: 'Ramallah, Main Street',
};

const PROFESSIONAL: ProfessionalProfileInput = {
  name: 'Rania Khalil',
  professionalTitle: 'Clinical Dietitian',
  specialty: 'Sports nutrition',
  phone: '0599 123 456',
  licenseNumber: null,
};

const SCHEDULE: WeeklyScheduleInput = {
  days: [
    { weekday: 0, isWorking: true, openMinute: 9 * 60, closeMinute: 17 * 60 },
    { weekday: 1, isWorking: true, openMinute: 10 * 60, closeMinute: 14 * 60 },
    { weekday: 2, isWorking: false, openMinute: null, closeMinute: null },
    { weekday: 3, isWorking: true, openMinute: 9 * 60, closeMinute: 17 * 60 },
    { weekday: 4, isWorking: true, openMinute: 9 * 60, closeMinute: 17 * 60 },
    { weekday: 5, isWorking: false, openMinute: null, closeMinute: null },
    { weekday: 6, isWorking: false, openMinute: null, closeMinute: null },
  ],
};

let clinicId: string;
let userId: string;

async function createStaff(clinic: string, suffix: string): Promise<string> {
  const id = `staff-${suffix}`;
  await db.insert(user).values({
    id,
    name: 'Original Name',
    email: `${suffix}@qiwam.test`,
    role: 'staff',
    clinicId: clinic,
  });
  return id;
}

beforeEach(async () => {
  await resetDatabase();
  clinicId = await createTestClinic();
  userId = await createStaff(clinicId, 'owner');
  await db.insert(clinicWorkingHours).values(defaultClinicScheduleRows(clinicId));
});

describe('clinic-scoped profile writes', () => {
  test('updates only the requested clinic information', async () => {
    const otherClinicId = await createTestClinic('Other Clinic');

    expect(await saveClinicInformation(clinicId, CLINIC)).toBe(true);

    const [mine] = await db.select().from(clinics).where(eq(clinics.id, clinicId));
    const [other] = await db.select().from(clinics).where(eq(clinics.id, otherClinicId));
    expect(mine?.contactEmail).toBe('clinic@qiwam.test');
    expect(other?.contactEmail).toBeNull();
  });

  test('upserts a complete week without creating duplicate rows', async () => {
    await saveWeeklySchedule(clinicId, SCHEDULE);
    await saveWeeklySchedule(clinicId, SCHEDULE);

    const rows = await db
      .select()
      .from(clinicWorkingHours)
      .where(eq(clinicWorkingHours.clinicId, clinicId));
    expect(rows).toHaveLength(7);
    expect(rows.find((row) => row.weekday === 1)?.closeMinute).toBe(14 * 60);
    expect(rows.find((row) => row.weekday === 2)?.isWorking).toBe(false);
  });

  test('claims the legacy practitioner and keeps user and practitioner names synchronized', async () => {
    const practitionerId = await createTestPractitioner(clinicId, 'Original Name');

    expect(await saveProfessionalProfile(clinicId, userId, PROFESSIONAL)).toBe(true);

    const [staff] = await db.select().from(user).where(eq(user.id, userId));
    const [professional] = await db.select().from(practitioners).where(eq(practitioners.id, practitionerId));
    expect(staff?.name).toBe('Rania Khalil');
    expect(professional?.userId).toBe(userId);
    expect(professional?.name).toBe('Rania Khalil');
    expect(professional?.professionalTitle).toBe('Clinical Dietitian');
  });

  test('refuses to write a professional profile for a user from another clinic', async () => {
    const otherClinicId = await createTestClinic('Other Clinic');
    const otherUserId = await createStaff(otherClinicId, 'other-owner');

    expect(await saveProfessionalProfile(clinicId, otherUserId, PROFESSIONAL)).toBe(false);
    expect(await db.select().from(practitioners).where(eq(practitioners.clinicId, clinicId))).toHaveLength(0);
  });
});

describe('onboarding completion', () => {
  test('refuses completion until all required sections are present', async () => {
    expect(await completeOnboarding(clinicId, userId)).toBe(false);
    expect(await isClinicOnboardingComplete(clinicId)).toBe(false);
  });

  test('completes after clinic, schedule, and professional data are valid', async () => {
    await saveClinicInformation(clinicId, CLINIC);
    await saveWeeklySchedule(clinicId, SCHEDULE);
    await saveProfessionalProfile(clinicId, userId, PROFESSIONAL);

    expect(await completeOnboarding(clinicId, userId)).toBe(true);
    expect(await isClinicOnboardingComplete(clinicId)).toBe(true);

    const profile = await getClinicProfile(clinicId, userId);
    expect(profile?.clinic).toEqual(CLINIC);
    expect(profile?.professional).toEqual(PROFESSIONAL);
    expect(profile?.schedule.envelope).toEqual({ openMinute: 9 * 60, closeMinute: 17 * 60 });
  });
});

describe('future schedule conflicts', () => {
  test('counts appointments on a newly off day or outside the proposed range', async () => {
    const practitionerId = await createTestPractitioner(clinicId);
    const clientId = await createTestClient(clinicId);
    await db.insert(appointments).values([
      {
        clinicId,
        practitionerId,
        clientId,
        date: '2026-08-03',
        startMinute: 9 * 60,
        durationMinutes: 30,
      },
      {
        clinicId,
        practitionerId,
        clientId: await createTestClient(clinicId, 'Second Client'),
        date: '2026-08-04',
        startMinute: 11 * 60,
        durationMinutes: 30,
      },
      {
        clinicId,
        practitionerId,
        clientId: await createTestClient(clinicId, 'Third Client'),
        date: '2026-08-05',
        startMinute: 10 * 60,
        durationMinutes: 30,
      },
    ]);

    expect(await countFutureScheduleConflicts(clinicId, SCHEDULE.days, '2026-08-02')).toBe(2);
  });

  test('never counts another clinic appointments', async () => {
    const otherClinicId = await createTestClinic('Other Clinic');
    const otherPractitionerId = await createTestPractitioner(otherClinicId);
    const otherClientId = await createTestClient(otherClinicId);
    await db.insert(appointments).values({
      clinicId: otherClinicId,
      practitionerId: otherPractitionerId,
      clientId: otherClientId,
      date: '2026-08-04',
      startMinute: 11 * 60,
      durationMinutes: 30,
    });

    expect(await countFutureScheduleConflicts(clinicId, SCHEDULE.days, '2026-08-02')).toBe(0);
  });
});
