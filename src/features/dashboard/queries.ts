import { and, between, count, eq, gte, not, sql } from 'drizzle-orm';

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
 * left with the cards that drew them — as did `listRecentClients`, when the
 * dashboard stopped carrying a thinner copy of `/app/clients`.
 *
 * Nothing here reads appointments row by row. The appointments panel takes the
 * whole week from `listAppointments` in the booking feature, which already
 * returns exactly the shape the calendar draws — a second query returning the
 * same rows in a different shape is how two screens start disagreeing about the
 * same appointment.
 *
 * The four counters at the foot of this file are the charts' second attempt at
 * summary numbers, and they are deliberately not the ones the summary tiles
 * carried: those counted things the page already showed, while these count
 * things it cannot — how intake has moved over six months, how the diary has
 * filled over eight weeks, and how many active clients have nothing booked at
 * all. Shaped by `./trends.ts`, drawn by `stat-cards.tsx`.
 */

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
