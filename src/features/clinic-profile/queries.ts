import { and, asc, eq, gte } from 'drizzle-orm';

import { db } from '@/db';
import { appointments, clinics, clinicWorkingHours, practitioners, user } from '@/db/schema';
import { weekdayOf } from '@/features/booking/date';

import { toClinicSchedule } from './schedule';
import type { ClinicDayHours, ClinicProfileSnapshot } from './types';

export async function isClinicOnboardingComplete(clinicId: string): Promise<boolean> {
  const [row] = await db
    .select({ completedAt: clinics.onboardingCompletedAt })
    .from(clinics)
    .where(eq(clinics.id, clinicId))
    .limit(1);

  return row?.completedAt !== null && row?.completedAt !== undefined;
}

/**
 * Just enough of the clinic to draw the rail's head.
 *
 * Two columns, not `select()`. The app layout runs this on **every** staff page
 * load, and `logo_url` holds a data URI of roughly 40 KB — worth fetching for
 * the row that draws it, not worth dragging the opening hours and the
 * onboarding timestamp along with it.
 */
export async function getClinicBrand(clinicId: string): Promise<{ logoUrl: string | null; name: string } | null> {
  const [row] = await db
    .select({ logoUrl: clinics.logoUrl, name: clinics.name })
    .from(clinics)
    .where(eq(clinics.id, clinicId))
    .limit(1);

  return row ?? null;
}

export async function getClinicProfile(clinicId: string, userId: string): Promise<ClinicProfileSnapshot | null> {
  const [clinicRows, scheduleRows, professionalRows, userRows] = await Promise.all([
    db.select().from(clinics).where(eq(clinics.id, clinicId)).limit(1),
    db
      .select()
      .from(clinicWorkingHours)
      .where(eq(clinicWorkingHours.clinicId, clinicId))
      .orderBy(asc(clinicWorkingHours.weekday)),
    db
      .select()
      .from(practitioners)
      .where(and(eq(practitioners.clinicId, clinicId), eq(practitioners.userId, userId)))
      .limit(1),
    db
      .select({ name: user.name })
      .from(user)
      .where(and(eq(user.id, userId), eq(user.clinicId, clinicId)))
      .limit(1),
  ]);

  const clinic = clinicRows[0];
  const staff = userRows[0];
  if (!clinic || !staff || scheduleRows.length !== 7) return null;

  const professional = professionalRows[0];
  return {
    clinic: {
      name: clinic.name,
      phone: clinic.phone ?? '',
      contactEmail: clinic.contactEmail ?? '',
      address: clinic.address ?? '',
      logoUrl: clinic.logoUrl,
    },
    schedule: toClinicSchedule(scheduleRows),
    professional: {
      name: professional?.name ?? staff.name,
      professionalTitle: professional?.professionalTitle ?? '',
      specialty: professional?.specialty ?? '',
    },
    onboardingCompletedAt: clinic.onboardingCompletedAt,
  };
}

export async function countFutureScheduleConflicts(
  clinicId: string,
  proposedDays: readonly ClinicDayHours[],
  today: string,
): Promise<number> {
  const rows = await db
    .select({ date: appointments.date, startMinute: appointments.startMinute, durationMinutes: appointments.durationMinutes })
    .from(appointments)
    .where(and(eq(appointments.clinicId, clinicId), gte(appointments.date, today)));

  const byWeekday = new Map(proposedDays.map((day) => [day.weekday, day]));

  return rows.filter((appointment) => {
    const weekday = weekdayOf(appointment.date);
    if (weekday === null) return true;
    const day = byWeekday.get(weekday);
    if (!day?.isWorking) return true;
    return appointment.startMinute < day.openMinute
      || appointment.startMinute + appointment.durationMinutes > day.closeMinute;
  }).length;
}
