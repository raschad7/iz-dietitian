import { and, count, desc, eq, sql } from 'drizzle-orm';

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
 * shell rather than a card on this page. The four counters behind the summary
 * tiles and the monthly-visit histogram left with those cards — the numbers
 * they served are all one click away in the calendar and the register.
 */

export type DashboardClient = {
  id: string;
  fullName: string;
  /** The client's own stored hex, for `Avatar` — record data, not a token. */
  color: string;
  status: string;
  createdAt: Date;
  /**
   * The client's next booking on or after today, if they have one. Null covers
   * both "nothing booked" and "only past appointments" — the card says which.
   */
  nextVisit: { date: string; startMinute: number } | null;
};

/**
 * The register, newest first, for the dashboard's client card.
 *
 * The next visit is a correlated subquery rather than a join: a client with
 * three future appointments would otherwise return three rows and the LIMIT
 * would silently cut the list short. This way one client is always one row.
 *
 * Archived clients are excluded. The card is a way into someone's record to do
 * something about them today, and an archived client is neither.
 */
export async function listRecentClients(
  clinicId: string,
  today: string,
  limit: number,
): Promise<DashboardClient[]> {
  const nextVisitDate = sql<string | null>`(
    select ${appointments.date}
    from ${appointments}
    where ${appointments.clientId} = ${clients.id}
      and ${appointments.date} >= ${today}
    order by ${appointments.date} asc, ${appointments.startMinute} asc
    limit 1
  )`;

  const nextVisitStart = sql<number | null>`(
    select ${appointments.startMinute}
    from ${appointments}
    where ${appointments.clientId} = ${clients.id}
      and ${appointments.date} >= ${today}
    order by ${appointments.date} asc, ${appointments.startMinute} asc
    limit 1
  )`;

  const rows = await db
    .select({
      id: clients.id,
      fullName: clients.fullName,
      color: clients.color,
      status: clients.status,
      createdAt: clients.createdAt,
      nextVisitDate,
      nextVisitStart,
    })
    .from(clients)
    .where(and(eq(clients.clinicId, clinicId), eq(clients.status, 'active')))
    .orderBy(desc(clients.createdAt))
    .limit(limit);

  return rows.map(({ nextVisitDate: date, nextVisitStart: startMinute, ...client }) => ({
    ...client,
    nextVisit: date !== null && startMinute !== null ? { date, startMinute } : null,
  }));
}

/** How many active clients the register holds — the card's subtitle. */
export async function countActiveClients(clinicId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(clients)
    .where(and(eq(clients.clinicId, clinicId), eq(clients.status, 'active')));

  return row?.value ?? 0;
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
