import { and, asc, between, desc, eq, gte, lt, sql } from 'drizzle-orm';

import { db } from '@/db';
import { appointments, clients, clinicWorkingHours, practitioners } from '@/db/schema';
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

/**
 * The client's position in their own clinic, counted from 0.
 *
 * This is what makes a patient's calendar colour *theirs* and nobody else's.
 * The colour used to be hashed from the client id, and a hash cannot promise
 * what a colour code has to: two ids can land a fraction of a degree apart on
 * the wheel, which is not a near-miss but the same colour. An index cannot —
 * distinct clients have distinct positions, so they have distinct hues, and
 * `patientHue` spaces those positions as far apart as a sequence can be spaced.
 *
 * **Ordered by `created_at, id`, so the numbering only ever appends.** A client
 * registered today is given the next free position and nobody else moves. Any
 * ordering that a client could change — by name, most obviously — would
 * renumber half the clinic the first time somebody married, and repaint a
 * calendar staff had learned to read at a glance. `id` breaks the tie when two
 * records share a timestamp, so the order is total rather than merely mostly
 * decided.
 *
 * It counts *every* client of the clinic, archived ones included. They are
 * excluded from the booking picker but their past appointments are still drawn,
 * and skipping them here would shift every position after each one.
 *
 * A correlated subquery rather than a window function: the rank has to be the
 * same number whatever the surrounding query selects, filters or orders by, and
 * `row_number()` is computed over that query's own result set.
 */
const clientSeq = sql<number>`(
  select count(*)
  from ${clients} as seq_peer
  where seq_peer.clinic_id = ${clients.clinicId}
    and (seq_peer.created_at, seq_peer.id) < (${clients.createdAt}, ${clients.id})
)`.mapWith(Number);

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
      clientSeq,
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

/** A row of the Visit History tab's record. */
export type ClientVisitEntry = ClientVisit & {
  durationMinutes: number;
  practitionerName: string;
};

/**
 * Every appointment this client has, newest first.
 *
 * The whole history rather than a page of it. `getClientVisitSummary` above
 * exists precisely because the *record header* needs two rows and must not read
 * a hundred to find them — but this is the tab whose subject is the hundred, and
 * it has to count them, split them at today and show both halves. Even a client
 * seen weekly for five years is 260 narrow rows on an index that already orders
 * them; the read that would be worth paginating is one that no longer fits a
 * page, and a visit history that long has a scrollbar before it has a problem.
 */
export async function listClientVisits(
  clinicId: string,
  clientId: string,
): Promise<ClientVisitEntry[]> {
  return db
    .select({
      id: appointments.id,
      date: appointments.date,
      startMinute: appointments.startMinute,
      durationMinutes: appointments.durationMinutes,
      reason: appointments.reason,
      practitionerName: practitioners.name,
    })
    .from(appointments)
    .innerJoin(practitioners, eq(practitioners.id, appointments.practitionerId))
    .where(and(eq(appointments.clinicId, clinicId), eq(appointments.clientId, clientId)))
    .orderBy(desc(appointments.date), desc(appointments.startMinute));
}

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
    // `seq` travels with the client so a just-booked appointment can be drawn
    // optimistically in that person's own colour, before the row exists to be
    // read back.
    .select({ id: clients.id, name: clients.fullName, color: clients.color, seq: clientSeq })
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
      .select({ id: clients.id, name: clients.fullName, color: clients.color, seq: clientSeq })
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
