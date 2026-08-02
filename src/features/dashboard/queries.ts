import { and, asc, between, count, eq, gt, gte, sql } from 'drizzle-orm';

import { db } from '@/db';
import { appointments, clients } from '@/db/schema';

/**
 * Reads for the staff dashboard. Like `src/features/clients/queries.ts`, this
 * imports nothing from Next.js so the functions can be called directly from a
 * test or a script.
 *
 * `clinicId` is a required first argument on everything, so forgetting the
 * tenant scope is a type error rather than a silent cross-clinic leak.
 *
 * The notification feed's reads used to live here; they moved to
 * `src/features/notifications/queries.ts` when the bell became part of the
 * shell rather than a card on this page.
 */

export async function countAppointmentsInRange(clinicId: string, fromDate: string, toDate: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(appointments)
    .where(and(eq(appointments.clinicId, clinicId), between(appointments.date, fromDate, toDate)));

  return row?.value ?? 0;
}

/**
 * Everything booked after `afterDate` — the "upcoming" tile.
 *
 * Strictly after, not on or after: today has its own tile and its own agenda,
 * and counting it twice would make the two disagree.
 */
export async function countAppointmentsAfter(clinicId: string, afterDate: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(appointments)
    .where(and(eq(appointments.clinicId, clinicId), gt(appointments.date, afterDate)));

  return row?.value ?? 0;
}

export type NextAppointment = { date: string; startMinute: number; clientName: string };

/** The first booking after `afterDate` — what the upcoming tile names. */
export async function findNextAppointmentAfter(clinicId: string, afterDate: string): Promise<NextAppointment | null> {
  const [row] = await db
    .select({
      date: appointments.date,
      startMinute: appointments.startMinute,
      clientName: clients.fullName,
    })
    .from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .where(and(eq(appointments.clinicId, clinicId), gt(appointments.date, afterDate)))
    .orderBy(asc(appointments.date), asc(appointments.startMinute))
    .limit(1);

  return row ?? null;
}

export async function countNewClientsSince(clinicId: string, sinceIso: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(clients)
    .where(and(eq(clients.clinicId, clinicId), gte(clients.createdAt, new Date(sinceIso))));

  return row?.value ?? 0;
}

export type MonthlyVisits = {
  /** `YYYY-MM-01` — the month's first day, so it sorts and formats like any other date. */
  month: string;
  visits: number;
};

/**
 * Appointments per calendar month across a date range.
 *
 * Grouped in SQL with `date_trunc` rather than by pulling every row and
 * bucketing in JS: this is the one read on the page whose row count grows with
 * the clinic's whole history rather than with one day.
 *
 * Months with no appointments are simply absent — the caller owns the calendar
 * and fills the gaps, because a histogram must show an empty month, and a query
 * cannot invent rows that aren't there.
 */
export async function listMonthlyVisits(clinicId: string, fromDate: string, toDate: string): Promise<MonthlyVisits[]> {
  const month = sql<string>`to_char(date_trunc('month', ${appointments.date}), 'YYYY-MM-DD')`;

  const rows = await db
    .select({ month, visits: count() })
    .from(appointments)
    .where(and(eq(appointments.clinicId, clinicId), between(appointments.date, fromDate, toDate)))
    .groupBy(month)
    .orderBy(asc(month));

  return rows;
}

export type ClientDemographic = { dateOfBirth: string | null; sex: string | null };

/**
 * Birth date and sex for everyone on the clinic's register.
 *
 * Returned as rows rather than aggregated in SQL because the age has to be
 * computed by `calculateAge`, which deliberately does *not* build a `Date` from
 * the stored value — `new Date('1990-06-15')` is UTC midnight and can render as
 * the previous day in Asia/Hebron. Bucketing with `age()` in Postgres would be
 * a second, subtly different implementation of the same rule.
 *
 * Two narrow columns for one clinic's register; the whole point of the table's
 * `clinic_id` index.
 */
export function listClientDemographics(clinicId: string): Promise<ClientDemographic[]> {
  return db
    .select({ dateOfBirth: clients.dateOfBirth, sex: clients.sex })
    .from(clients)
    .where(eq(clients.clinicId, clinicId));
}
