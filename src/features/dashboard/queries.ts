import { and, desc, eq, sql } from 'drizzle-orm';

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
 * tiles, the monthly-visit histogram and the register's age/sex breakdown all
 * left with the cards that drew them — the numbers they served are one click
 * away in the calendar and the register, and the row they held now carries the
 * requests a client is actually waiting on.
 */

export type DashboardClient = {
  id: string;
  fullName: string;
  /** Shown beside the name, so the row can be dialled without opening the record. */
  phone: string | null;
  /** `YYYY-MM-DD`. The card renders an age from it; see `calculateAge`. */
  dateOfBirth: string | null;
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
      phone: clients.phone,
      dateOfBirth: clients.dateOfBirth,
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

