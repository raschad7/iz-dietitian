import { and, asc, between, eq } from 'drizzle-orm';

import { db } from '@/db';
import { appointments, clients, clinicWorkingHours } from '@/db/schema';
import { toClinicSchedule } from '@/features/clinic-profile/schedule';

import { type CalendarAppointment, type CalendarClient, type CalendarData } from './types';
import { type ClinicHours } from './validation';

/**
 * Reads for the calendar. Imports nothing from Next.js, so `bun test` can call
 * these directly — the same split as `src/features/clients/queries.ts`.
 *
 * `clinicId` is a required first argument on every function rather than an
 * optional filter, so forgetting the tenant boundary is a type error instead of
 * a silent cross-clinic leak.
 */

/** Opening hours, or null when the clinic id does not exist. */
export async function getClinicHours(clinicId: string): Promise<ClinicHours | null> {
  const rows = await db
    .select()
    .from(clinicWorkingHours)
    .where(eq(clinicWorkingHours.clinicId, clinicId))
    .orderBy(asc(clinicWorkingHours.weekday));

  if (rows.length !== 7) return null;
  const schedule = toClinicSchedule(rows);
  return {
    days: schedule.days,
    workingDays: schedule.days.filter((day) => day.isWorking).map((day) => day.weekday),
    ...schedule.envelope,
  };
}

/**
 * Every appointment in a date range, joined with the names and colours the grid
 * draws.
 *
 * Inclusive at both ends: callers pass the first and last day actually on
 * screen, which for the month view is the padded six-week grid, not the
 * calendar month.
 */
export async function listAppointments(
  clinicId: string,
  fromDate: string,
  toDate: string,
): Promise<CalendarAppointment[]> {
  return db
    .select({
      id: appointments.id,
      practitionerId: appointments.practitionerId,
      clientId: appointments.clientId,
      date: appointments.date,
      startMinute: appointments.startMinute,
      durationMinutes: appointments.durationMinutes,
      reason: appointments.reason,
      clientName: clients.fullName,
      clientColor: clients.color,
    })
    .from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .where(and(eq(appointments.clinicId, clinicId), between(appointments.date, fromDate, toDate)))
    // Stable order so two appointments in the same column stack predictably.
    .orderBy(asc(appointments.date), asc(appointments.startMinute), asc(appointments.id));
}

/**
 * The clients the picker offers.
 *
 * Archived clients are excluded: they are the ones staff stopped seeing, and
 * offering them in a booking list is noise. Booking an archived client is still
 * possible by restoring them first, which is the honest workflow.
 */
export async function listBookableClients(clinicId: string): Promise<CalendarClient[]> {
  return db
    .select({ id: clients.id, name: clients.fullName, color: clients.color })
    .from(clients)
    .where(and(eq(clients.clinicId, clinicId), eq(clients.status, 'active')))
    .orderBy(asc(clients.fullName));
}

/**
 * Everything one calendar render needs, in parallel.
 *
 * Three independent reads, so they are issued together rather than awaited in
 * sequence — the page cannot paint until the slowest of them anyway.
 */
export async function getCalendarData(clinicId: string, fromDate: string, toDate: string): Promise<CalendarData> {
  const [appointmentRows, clientRows, hours] = await Promise.all([
    listAppointments(clinicId, fromDate, toDate),
    listBookableClients(clinicId),
    getClinicHours(clinicId),
  ]);

  if (!hours) {
    // `requireStaffClinic` has already proved the caller has a clinic id, so a
    // missing row means the clinic was deleted mid-request. Failing loudly beats
    // rendering a calendar against invented opening hours.
    throw new Error(`clinic ${clinicId} has no row; cannot read opening hours`);
  }

  return {
    appointments: appointmentRows,
    clients: clientRows,
    hours: {
      ...hours,
      workingDays: [...hours.workingDays],
      days: hours.days ? [...hours.days] : undefined,
    },
  };
}
