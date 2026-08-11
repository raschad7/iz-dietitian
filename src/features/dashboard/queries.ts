import { and, between, count, desc, eq, gte, not, sql } from 'drizzle-orm';

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
 * left with the cards that drew them.
 *
 * The four counters at the foot of this file are the charts' second attempt at
 * summary numbers, and they are deliberately not the ones the summary tiles
 * carried: those counted things the page already showed, while these count
 * things it cannot — how intake has moved over six months, how the diary has
 * filled over eight weeks, and how many active clients have nothing booked at
 * all. Shaped by `./trends.ts`, drawn by `stat-cards.tsx`.
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

/**
 * How many clients joined in each month from `since` onward, as `YYYY-MM-01`.
 *
 * Only months that have someone in them come back — a month nobody joined
 * returns no row at all. That is the shape `monthlySeries` in `./trends.ts`
 * expects, and filling the gaps there rather than with a `generate_series`
 * join keeps the calendar arithmetic in one testable place.
 *
 * Archived clients are counted. This is a record of intake — someone who came
 * to the clinic in March and left in June still came in March, and dropping
 * them would rewrite the past every time a record is archived.
 *
 * `created_at` is a timestamp and the bucket is cut in the server's own zone,
 * matching how `loadDashboard` derives "today" from the same clock.
 */
export async function countClientsByMonth(
  clinicId: string,
  since: Date,
): Promise<{ month: string; clients: number }[]> {
  const month = sql<string>`to_char(date_trunc('month', ${clients.createdAt}), 'YYYY-MM-DD')`;

  return db
    .select({ month, clients: count() })
    .from(clients)
    .where(and(eq(clients.clinicId, clinicId), gte(clients.createdAt, since)))
    .groupBy(month);
}

/**
 * Appointments per day between two dates, inclusive. Days with none are absent.
 *
 * Per day rather than per week on purpose: Postgres truncates to an ISO week,
 * which starts on Monday, and this app's weeks start on Sunday. `weeklySeries`
 * buckets these rows with the same `startOfWeek` the calendar uses, so the
 * chart's bars and the week view they link to always cut on the same day.
 */
export async function countAppointmentsByDay(
  clinicId: string,
  from: string,
  to: string,
): Promise<{ date: string; appointments: number }[]> {
  return db
    .select({ date: appointments.date, appointments: count() })
    .from(appointments)
    .where(and(eq(appointments.clinicId, clinicId), between(appointments.date, from, to)))
    .groupBy(appointments.date);
}

/** How many active clients the register holds right now. */
export async function countActiveClients(clinicId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(clients)
    .where(and(eq(clients.clinicId, clinicId), eq(clients.status, 'active')));

  return row?.total ?? 0;
}

/**
 * Active clients with nothing booked on or after `today`.
 *
 * The one number on either card that is a task rather than a fact: each of
 * these is somebody who is still on the books and has no next visit, which is
 * how a client quietly stops being a client. `not exists` rather than a left
 * join, so a client with three future appointments is still one client.
 */
export async function countClientsWithoutNextVisit(
  clinicId: string,
  today: string,
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(clients)
    .where(
      and(
        eq(clients.clinicId, clinicId),
        eq(clients.status, 'active'),
        not(
          sql`exists (
            select 1
            from ${appointments}
            where ${appointments.clientId} = ${clients.id}
              and ${appointments.date} >= ${today}
          )`,
        ),
      ),
    );

  return row?.total ?? 0;
}
