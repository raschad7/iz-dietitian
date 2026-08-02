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

    const columns = {
      userId,
      name: input.name,
      professionalTitle: input.professionalTitle,
      specialty: input.specialty,
      phone: input.phone,
      licenseNumber: input.licenseNumber,
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
      phone: professional.phone,
      licenseNumber: professional.licenseNumber,
    }).success;

    if (!clinicValid || !scheduleValid || !professionalValid) return false;

    await tx
      .update(clinics)
      .set({ onboardingCompletedAt: new Date(), updatedAt: new Date() })
      .where(eq(clinics.id, clinicId));

    return true;
  });
}
