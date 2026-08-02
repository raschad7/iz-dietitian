import { and, asc, between, count, desc, eq, gte, isNotNull, notExists } from 'drizzle-orm';

import { db } from '@/db';
import { appointmentRequests, appointments, clients, session, weeklyPlans } from '@/db/schema';
import { type RequestKind } from '@/features/portal/types';
import { currentSunday } from '@/features/weekly-plans/week';

/**
 * Reads for the staff dashboard. Like `src/features/clients/queries.ts`, this
 * imports nothing from Next.js so the functions can be called directly from a
 * test or a script.
 *
 * `clinicId` is a required first argument on everything, so forgetting the
 * tenant scope is a type error rather than a silent cross-clinic leak.
 */

export type PendingRequestPreview = {
  id: string;
  clientId: string;
  clientName: string;
  kind: RequestKind;
  preferredDate: string | null;
  preferredStartMinute: number | null;
  note: string | null;
  createdAt: Date;
};

/** The newest `limit` pending requests, oldest-first work aside — this is a preview, not the inbox. */
export async function listPendingRequestsPreview(clinicId: string, limit: number): Promise<PendingRequestPreview[]> {
  const rows = await db
    .select({
      id: appointmentRequests.id,
      clientId: appointmentRequests.clientId,
      clientName: clients.fullName,
      kind: appointmentRequests.kind,
      preferredDate: appointmentRequests.preferredDate,
      preferredStartMinute: appointmentRequests.preferredStartMinute,
      note: appointmentRequests.note,
      createdAt: appointmentRequests.createdAt,
    })
    .from(appointmentRequests)
    .innerJoin(clients, eq(clients.id, appointmentRequests.clientId))
    .where(and(eq(appointmentRequests.clinicId, clinicId), eq(appointmentRequests.status, 'pending')))
    .orderBy(desc(appointmentRequests.createdAt))
    .limit(limit);

  // The column is plain `text` guarded by a check constraint, so the union is
  // reasserted on the way out rather than trusted from the driver's `string`
  // — same precedent as `src/features/portal/queries.ts`.
  return rows.map((row) => ({ ...row, kind: row.kind as RequestKind }));
}

export async function countPendingRequests(clinicId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(appointmentRequests)
    .where(and(eq(appointmentRequests.clinicId, clinicId), eq(appointmentRequests.status, 'pending')));

  return row?.value ?? 0;
}

export async function countActiveClients(clinicId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(clients)
    .where(and(eq(clients.clinicId, clinicId), eq(clients.status, 'active')));

  return row?.value ?? 0;
}

export async function countAppointmentsInRange(clinicId: string, fromDate: string, toDate: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(appointments)
    .where(and(eq(appointments.clinicId, clinicId), between(appointments.date, fromDate, toDate)));

  return row?.value ?? 0;
}

export async function countNewClientsSince(clinicId: string, sinceIso: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(clients)
    .where(and(eq(clients.clinicId, clinicId), gte(clients.createdAt, new Date(sinceIso))));

  return row?.value ?? 0;
}

/**
 * Matches clients with NO published plan covering the week we are in now.
 *
 * Both callers want the absence, so the predicate is written as the absence
 * rather than negated at each call site.
 *
 * The `status`/`week_start_date` pair, not merely "has any plan": a draft is not
 * something a client can eat from, and last month's published week is not either.
 * `weekly_plans_published_week_idx` covers exactly this shape.
 *
 * Shared by the count and the list below so the tile and the rows beneath it can
 * never disagree about who is missing a plan.
 */
function lacksPlanForCurrentWeek(weekStartDate: string) {
  return notExists(
    db
      .select({ id: weeklyPlans.id })
      .from(weeklyPlans)
      .where(
        and(
          eq(weeklyPlans.clientId, clients.id),
          eq(weeklyPlans.status, 'published'),
          eq(weeklyPlans.weekStartDate, weekStartDate),
        ),
      ),
  );
}

/**
 * Active clients with no published plan for the current week.
 *
 * The dashboard spec asked for "plans ending within 7 days", which meal plans V1
 * could not answer — it was a repeating template with no end date, so the tile
 * settled for "has never had a plan at all". A weekly plan is generated *for* a
 * named week, so the question is finally the real one: is there something on this
 * client's board right now?
 *
 * This counts more people than the old proxy did, and it recurs every week
 * instead of clearing once at onboarding. That is the point — a client whose plan
 * ran out last Saturday is exactly who needs surfacing on a Sunday morning.
 */
export async function countActiveClientsWithoutWeeklyPlan(clinicId: string): Promise<number> {
  const weekStartDate = currentSunday();

  const [row] = await db
    .select({ value: count() })
    .from(clients)
    .where(
      and(eq(clients.clinicId, clinicId), eq(clients.status, 'active'), lacksPlanForCurrentWeek(weekStartDate)),
    );

  return row?.value ?? 0;
}

export type AttentionReason = 'noUpcomingAppointment' | 'noWeeklyPlan' | 'neverSignedIn';

export type AttentionItem = {
  clientId: string;
  clientName: string;
  reason: AttentionReason;
};

/** Active clients with no appointment on or after `today`. */
export async function listClientsWithNoUpcomingAppointment(
  clinicId: string,
  today: string,
  limit: number,
): Promise<AttentionItem[]> {
  const rows = await db
    .select({ clientId: clients.id, clientName: clients.fullName })
    .from(clients)
    .where(
      and(
        eq(clients.clinicId, clinicId),
        eq(clients.status, 'active'),
        notExists(
          db
            .select({ id: appointments.id })
            .from(appointments)
            .where(and(eq(appointments.clientId, clients.id), gte(appointments.date, today))),
        ),
      ),
    )
    .orderBy(asc(clients.fullName))
    .limit(limit);

  return rows.map((row) => ({ ...row, reason: 'noUpcomingAppointment' as const }));
}

/** Active clients with no published plan this week — see {@link countActiveClientsWithoutWeeklyPlan}. */
export async function listClientsWithoutWeeklyPlan(clinicId: string, limit: number): Promise<AttentionItem[]> {
  const weekStartDate = currentSunday();

  const rows = await db
    .select({ clientId: clients.id, clientName: clients.fullName })
    .from(clients)
    .where(
      and(eq(clients.clinicId, clinicId), eq(clients.status, 'active'), lacksPlanForCurrentWeek(weekStartDate)),
    )
    .orderBy(asc(clients.fullName))
    .limit(limit);

  return rows.map((row) => ({ ...row, reason: 'noWeeklyPlan' as const }));
}

/**
 * Active clients with a portal account who have never signed in.
 *
 * "Never signed in" is read off `sessions`, not a `lastLoginAt` column — one
 * does not exist, and a session row is only ever written by a successful
 * sign-in, so its absence is the honest signal.
 */
export async function listClientsNeverSignedIn(clinicId: string, limit: number): Promise<AttentionItem[]> {
  const rows = await db
    .select({ clientId: clients.id, clientName: clients.fullName })
    .from(clients)
    .where(
      and(
        eq(clients.clinicId, clinicId),
        eq(clients.status, 'active'),
        isNotNull(clients.userId),
        notExists(db.select({ id: session.id }).from(session).where(eq(session.userId, clients.userId))),
      ),
    )
    .orderBy(asc(clients.fullName))
    .limit(limit);

  return rows.map((row) => ({ ...row, reason: 'neverSignedIn' as const }));
}
