import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { appointments, clinics, clinicWorkingHours, practitioners, user } from '@/db/schema';
import { createTestClient, createTestClinic, createTestPractitioner, resetDatabase } from '../../../tests/helpers';

import {
  completeOnboarding,
  saveClinicInformation,
  saveProfessionalProfile,
  saveWeeklySchedule,
  updateClinicField,
} from './mutations';
import {
  countFutureScheduleConflicts,
  getClinicBrand,
  getClinicProfile,
  isClinicOnboardingComplete,
} from './queries';
import type { ClinicInformationInput, ProfessionalProfileInput, WeeklyScheduleInput } from './schema';

const CLINIC: ClinicInformationInput = {
  name: 'Enzyme Clinic',
  phone: '+970599123456',
  contactEmail: 'clinic@enzyme.test',
  address: 'Ramallah, Main Street',
};

const PROFESSIONAL: ProfessionalProfileInput = {
  name: 'Rania Khalil',
  professionalTitle: 'أخصائي تغذية سريرية',
  specialty: 'التغذية الرياضية',
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
    email: `${suffix}@enzyme.test`,
    role: 'staff',
    clinicId: clinic,
  });
  return id;
}

beforeEach(async () => {
  await resetDatabase();
  clinicId = await createTestClinic();
  userId = await createStaff(clinicId, 'owner');
});

describe('clinic-scoped profile writes', () => {
  test('updates only the requested clinic information', async () => {
    const otherClinicId = await createTestClinic('Other Clinic');

    expect(await saveClinicInformation(clinicId, CLINIC)).toBe(true);

    const [mine] = await db.select().from(clinics).where(eq(clinics.id, clinicId));
    const [other] = await db.select().from(clinics).where(eq(clinics.id, otherClinicId));
    expect(mine?.contactEmail).toBe('clinic@enzyme.test');
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
    expect(professional?.professionalTitle).toBe('أخصائي تغذية سريرية');
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
    expect(profile?.clinic).toEqual({ ...CLINIC, logoUrl: null });
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

/**
 * The clinic mark round-trips through a column, so the things worth pinning are
 * that it survives a write unchanged — base64 is punctuation-heavy and any
 * accidental escaping would corrupt it silently — and that the two readers used
 * by the settings page and the rail both return it.
 */
describe('the clinic logo', () => {
  const LOGO = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';

  test('persists a data URI byte for byte and is read back by both queries', async () => {
    const userId = await createStaff(clinicId, 'logo-owner');
    expect(await updateClinicField(clinicId, 'logoUrl', LOGO)).toBe(true);

    const [row] = await db.select().from(clinics).where(eq(clinics.id, clinicId));
    expect(row?.logoUrl).toBe(LOGO);

    // The rail reads its own narrow projection; the settings page reads the
    // whole profile. A logo visible in one and not the other is the bug this
    // pins down.
    expect((await getClinicBrand(clinicId))?.logoUrl).toBe(LOGO);

    await saveClinicInformation(clinicId, CLINIC);
    await saveWeeklySchedule(clinicId, SCHEDULE);
    await saveProfessionalProfile(clinicId, userId, PROFESSIONAL);
    expect((await getClinicProfile(clinicId, userId))?.clinic.logoUrl).toBe(LOGO);
  });

  test('clears to null rather than to an empty string', async () => {
    await updateClinicField(clinicId, 'logoUrl', LOGO);
    await updateClinicField(clinicId, 'logoUrl', null);

    const [row] = await db.select().from(clinics).where(eq(clinics.id, clinicId));
    expect(row?.logoUrl).toBeNull();
  });

  test('leaves every other clinic column alone', async () => {
    await saveClinicInformation(clinicId, CLINIC);
    await updateClinicField(clinicId, 'logoUrl', LOGO);

    const [row] = await db.select().from(clinics).where(eq(clinics.id, clinicId));
    expect(row?.contactEmail).toBe('clinic@enzyme.test');
    expect(row?.address).toBe('Ramallah, Main Street');
  });

  /**
   * The regression this suite exists for.
   *
   * `saveClinicInformation` writes with `.set({ ...input })`, so while the mark
   * was a member of `clinicInformationSchema` every bulk write cleared it —
   * including the onboarding wizard, which has no logo field to carry it
   * forward with. Editing an address wiped the logo, which reads to a user as
   * "the picture would not save".
   */
  test('survives a bulk clinic write that does not mention it', async () => {
    await updateClinicField(clinicId, 'logoUrl', LOGO);

    await saveClinicInformation(clinicId, { ...CLINIC, address: 'A new street entirely' });

    const [row] = await db.select().from(clinics).where(eq(clinics.id, clinicId));
    expect(row?.address).toBe('A new street entirely');
    expect(row?.logoUrl).toBe(LOGO);
  });

  test('survives onboarding completion', async () => {
    const userId = await createStaff(clinicId, 'onboarding-owner');
    await updateClinicField(clinicId, 'logoUrl', LOGO);
    await saveClinicInformation(clinicId, CLINIC);
    await saveWeeklySchedule(clinicId, SCHEDULE);
    await saveProfessionalProfile(clinicId, userId, PROFESSIONAL);

    expect(await completeOnboarding(clinicId, userId)).toBe(true);

    const [row] = await db.select().from(clinics).where(eq(clinics.id, clinicId));
    expect(row?.logoUrl).toBe(LOGO);
  });

  test('never reaches another clinic', async () => {
    const otherClinicId = await createTestClinic('Other Clinic');
    await updateClinicField(clinicId, 'logoUrl', LOGO);

    const [other] = await db.select().from(clinics).where(eq(clinics.id, otherClinicId));
    expect(other?.logoUrl).toBeNull();
  });
});
