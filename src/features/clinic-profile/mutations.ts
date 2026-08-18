import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/db';
import { clinics, clinicWorkingHours, practitioners, user } from '@/db/schema';

import {
  clinicInformationSchema,
  professionalProfileSchema,
  weeklyScheduleSchema,
  type ClinicInformationInput,
  type ProfessionalProfileInput,
  type WeeklyScheduleInput,
} from './schema';

export async function saveClinicInformation(clinicId: string, input: ClinicInformationInput): Promise<boolean> {
  const rows = await db
    .update(clinics)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(clinics.id, clinicId))
    .returning({ id: clinics.id });

  return rows.length > 0;
}

/**
 * One column of the clinic row.
 *
 * The settings surface edits a field at a time through a dialog, so writing the
 * whole object back would mean reading four values in order to change one — and
 * would silently rewrite anything another tab had changed in between. The key
 * is a column on `clinics`, so Drizzle maps it; the caller has already validated
 * the value against that field's own schema.
 */
export type ClinicEditableColumn = keyof ClinicInformationInput | 'logoUrl';

export async function updateClinicField(
  clinicId: string,
  field: ClinicEditableColumn,
  value: string | null,
): Promise<boolean> {
  const rows = await db
    .update(clinics)
    .set({ [field]: value, updatedAt: new Date() })
    .where(eq(clinics.id, clinicId))
    .returning({ id: clinics.id });

  return rows.length > 0;
}

/**
 * One field of the signed-in practitioner's profile.
 *
 * Unlike the clinic above, this cannot be a single-column update: the
 * practitioner row may not exist yet, may exist unlinked from a legacy
 * onboarding, and `name` has to stay in step with `user.name`. All three live
 * in `saveProfessionalProfile`'s transaction, so this reads the current values,
 * patches the one that changed and hands the whole object back to it rather
 * than duplicating that logic.
 */
export async function updateProfessionalField(
  clinicId: string,
  userId: string,
  current: ProfessionalProfileInput,
  field: keyof ProfessionalProfileInput,
  value: string | null,
): Promise<boolean> {
  return saveProfessionalProfile(clinicId, userId, { ...current, [field]: value });
}

export async function saveWeeklySchedule(clinicId: string, input: WeeklyScheduleInput): Promise<boolean> {
  const values = input.days.map((day) => ({ ...day, clinicId }));

  await db
    .insert(clinicWorkingHours)
    .values(values)
    .onConflictDoUpdate({
      target: [clinicWorkingHours.clinicId, clinicWorkingHours.weekday],
      set: {
        isWorking: sql`excluded.is_working`,
        openMinute: sql`excluded.open_minute`,
        closeMinute: sql`excluded.close_minute`,
        updatedAt: new Date(),
      },
    });

  return true;
}

export async function saveProfessionalProfile(
  clinicId: string,
  userId: string,
  input: ProfessionalProfileInput,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [staff] = await tx
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, userId), eq(user.clinicId, clinicId), eq(user.role, 'staff')))
      .limit(1);

    if (!staff) return false;

    const [linked] = await tx
      .select({ id: practitioners.id })
      .from(practitioners)
      .where(and(eq(practitioners.clinicId, clinicId), eq(practitioners.userId, userId)))
      .limit(1);

    const [legacy] = linked
      ? []
      : await tx
          .select({ id: practitioners.id })
          .from(practitioners)
          .where(and(eq(practitioners.clinicId, clinicId), isNull(practitioners.userId)))
          .orderBy(asc(practitioners.createdAt), asc(practitioners.id))
          .limit(1);

    /*
      `phone` and `license_number` are not listed, so an existing row keeps
      whatever it already held. They were removed from every screen rather than
      from the table — see the ⚠ on `professionalProfileSchema` — and a bulk
      `.set()` naming them would quietly erase the old values on the next
      unrelated save.
    */
    const columns = {
      userId,
      name: input.name,
      professionalTitle: input.professionalTitle,
      specialty: input.specialty,
      updatedAt: new Date(),
    };

    if (linked ?? legacy) {
      await tx
        .update(practitioners)
        .set(columns)
        .where(and(eq(practitioners.id, (linked ?? legacy)!.id), eq(practitioners.clinicId, clinicId)));
    } else {
      await tx.insert(practitioners).values({ clinicId, ...columns });
    }

    await tx
      .update(user)
      .set({ name: input.name, updatedAt: new Date() })
      .where(and(eq(user.id, userId), eq(user.clinicId, clinicId)));

    return true;
  });
}

export async function completeOnboarding(clinicId: string, userId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [clinic] = await tx.select().from(clinics).where(eq(clinics.id, clinicId)).limit(1);
    const days = await tx
      .select()
      .from(clinicWorkingHours)
      .where(eq(clinicWorkingHours.clinicId, clinicId))
      .orderBy(asc(clinicWorkingHours.weekday));
    const [professional] = await tx
      .select()
      .from(practitioners)
      .where(and(eq(practitioners.clinicId, clinicId), eq(practitioners.userId, userId)))
      .limit(1);

    if (!clinic || !professional) return false;

    const clinicValid = clinicInformationSchema.safeParse({
      name: clinic.name,
      phone: clinic.phone,
      contactEmail: clinic.contactEmail,
      address: clinic.address,
    }).success;
    const scheduleValid = weeklyScheduleSchema.safeParse({
      days: days.map((day) => ({
        weekday: day.weekday,
        isWorking: day.isWorking,
        openMinute: day.openMinute,
        closeMinute: day.closeMinute,
      })),
    }).success;
    const professionalValid = professionalProfileSchema.safeParse({
      name: professional.name,
      professionalTitle: professional.professionalTitle,
      specialty: professional.specialty,
    }).success;

    if (!clinicValid || !scheduleValid || !professionalValid) return false;

    await tx
      .update(clinics)
      .set({ onboardingCompletedAt: new Date(), updatedAt: new Date() })
      .where(eq(clinics.id, clinicId));

    return true;
  });
}
