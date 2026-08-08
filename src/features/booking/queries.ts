import { and, asc, between, desc, eq, gte, lt } from 'drizzle-orm';

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
 *
 * `clientId` narrows to one person's appointments — the Visit History tab on
 * their profile reads the same grid the clinic-wide calendar does, just
 * filtered to what one client can see there.
 */
export async function listAppointments(
  clinicId: string,
  fromDate: string,
  toDate: string,
  clientId?: string,
): Promise<CalendarAppointment[]> {
  const conditions = [eq(appointments.clinicId, clinicId), between(appointments.date, fromDate, toDate)];
  if (clientId) conditions.push(eq(appointments.clientId, clientId));

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
    .where(and(...conditions))
    // Stable order so two appointments in the same column stack predictably.
    .orderBy(asc(appointments.date), asc(appointments.startMinute), asc(appointments.id));
}

/** One appointment, as a client's record header and Info tab read it. */
export type ClientVisit = {
  id: string;
  date: string;
  startMinute: number;
  reason: string | null;
};

export type ClientVisitSummary = {
  /** The soonest appointment from `today` onward, inclusive. */
  next: ClientVisit | null;
  /** The most recent one strictly before `today`. */
  last: ClientVisit | null;
};

/**
 * The two appointments a client's record actually shows: the next one and the
 * one before now.
 *
 * Two narrow reads rather than loading a client's history and picking the ends
 * off it in JavaScript — a client seen fortnightly for two years is a hundred
 * rows to answer a question about two of them, and the index on
 * `(clinic_id, date)` already orders both.
 *
 * `today` is passed in rather than derived here so that a page rendering both
 * this and a calendar measures them against the same day. Same reason
 * `loadDashboard` takes its "now" once at the top.
 *
 * An appointment *on* today counts as `next`, not `last`: it has a start minute
 * this query deliberately does not compare against the clock, because a visit
 * earlier today is still the thing a dietitian is most likely to be asking
 * about when they open the record.
 */
export async function getClientVisitSummary(
  clinicId: string,
  clientId: string,
  today: string,
): Promise<ClientVisitSummary> {
  const columns = {
    id: appointments.id,
    date: appointments.date,
    startMinute: appointments.startMinute,
    reason: appointments.reason,
  };

  const scope = and(eq(appointments.clinicId, clinicId), eq(appointments.clientId, clientId));

  const [next, last] = await Promise.all([
    db
      .select(columns)
      .from(appointments)
      .where(and(scope, gte(appointments.date, today)))
      .orderBy(asc(appointments.date), asc(appointments.startMinute))
      .limit(1),
    db
      .select(columns)
      .from(appointments)
      .where(and(scope, lt(appointments.date, today)))
      .orderBy(desc(appointments.date), desc(appointments.startMinute))
      .limit(1),
  ]);

  return { next: next[0] ?? null, last: last[0] ?? null };
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

/**
 * The same read as {@link getCalendarData}, scoped to one client — the Visit
 * History tab on their profile.
 *
 * `clients` here is at most that one row, and only if they are still active:
 * an archived client cannot be booked from the clinic-wide calendar either
 * (see `listBookableClients`), and their own profile is not a back door
 * around that — restoring them first is still the honest workflow.
 */
export async function getClientCalendarData(
  clinicId: string,
  clientId: string,
  fromDate: string,
  toDate: string,
): Promise<CalendarData> {
  const [appointmentRows, clientRows, hours] = await Promise.all([
    listAppointments(clinicId, fromDate, toDate, clientId),
    db
      .select({ id: clients.id, name: clients.fullName, color: clients.color })
      .from(clients)
      .where(and(eq(clients.clinicId, clinicId), eq(clients.id, clientId), eq(clients.status, 'active'))),
    getClinicHours(clinicId),
  ]);

  if (!hours) {
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
