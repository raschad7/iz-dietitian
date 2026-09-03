import { and, count, desc, eq, gte, isNotNull, lt, notExists, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  appointmentRequests,
  appointments,
  clientMeasurements,
  clients,
  session,
  weeklyPlans,
} from '@/db/schema';
import { addDays } from '@/features/booking/date';
import { clientSeq } from '@/features/clients/seq';
import { type RequestKind } from '@/features/portal/types';
import { currentSunday } from '@/features/weekly-plans/week';
import { type IsoDate } from '@/lib/iso-date';

import { type AttentionReason } from './types';

/**
 * Reads behind the app bar's notification bell.
 *
 * These used to live in `src/features/dashboard/queries.ts`, back when the feed
 * was one card on one page. It is now part of the shell and shows on every
 * staff screen, so it owns its own feature folder.
 *
 * Like `src/features/clients/queries.ts`, this imports nothing from Next.js, so
 * the functions can be called directly from a test or a script. `clinicId` is a
 * required first argument on everything, so forgetting the tenant scope is a
 * type error rather than a silent cross-clinic leak.
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

/**
 * ⚠ **The three attention reads are ordered newest client first.**
 *
 * These rows are not events and carry no timestamp of their own — "no upcoming
 * appointment" is a standing fact about a record, true until someone books.
 * They were ordered by name, which is alphabetical rather than temporal and put
 * the same clients at the top of the feed every morning. `clients.created_at` is
 * the only time this data has, so newest-registered leads, matching the
 * requests inbox beside it.
 *
 * The limit is applied per category, so the order also decides *which* clients
 * make the cut when a clinic has more than `perCategory` of them — under the old
 * ordering that was "whoever is early in the alphabet".
 */
export type AttentionItem = {
  clientId: string;
  clientName: string;
  clientSeq: number;
  reason: AttentionReason;
};

/** Active clients with no appointment on or after `today`. */
export async function listClientsWithNoUpcomingAppointment(
  clinicId: string,
  today: string,
  limit: number,
): Promise<AttentionItem[]> {
  const rows = await db
    .select({ clientId: clients.id, clientName: clients.fullName, clientSeq })
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
    .orderBy(desc(clients.createdAt))
    .limit(limit);

  return rows.map((row) => ({ ...row, reason: 'noUpcomingAppointment' as const }));
}

/**
 * Active clients with no published plan covering the week we are in now.
 *
 * The `status`/`week_start_date` pair, not merely "has any plan": a draft is not
 * something a client can eat from, and last month's published week is not
 * either. `weekly_plans_published_week_idx` covers exactly this shape.
 *
 * Written as the absence rather than negated at the call site, since that is
 * the question the bell is asking.
 */
export async function listClientsWithoutWeeklyPlan(clinicId: string, limit: number): Promise<AttentionItem[]> {
  const weekStartDate = currentSunday();

  const rows = await db
    .select({ clientId: clients.id, clientName: clients.fullName, clientSeq })
    .from(clients)
    .where(
      and(
        eq(clients.clinicId, clinicId),
        eq(clients.status, 'active'),
        notExists(
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
        ),
      ),
    )
    .orderBy(desc(clients.createdAt))
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
    .select({ clientId: clients.id, clientName: clients.fullName, clientSeq })
    .from(clients)
    .where(
      and(
        eq(clients.clinicId, clinicId),
        eq(clients.status, 'active'),
        isNotNull(clients.userId),
        notExists(db.select({ id: session.id }).from(session).where(eq(session.userId, clients.userId))),
      ),
    )
    .orderBy(desc(clients.createdAt))
    .limit(limit);

  return rows.map((row) => ({ ...row, reason: 'neverSignedIn' as const }));
}

/**
 * How long a client may go unmeasured before the dashboard mentions it.
 *
 * Twelve weeks, and it is a default rather than a rule. Review intervals are a
 * clinic's own decision and vary by client; this is only the point past which
 * "when did we last weigh them?" becomes worth surfacing unprompted. A clinic
 * that reviews monthly will find it too slow and one that reviews twice a year
 * too eager — the honest fix for either is a clinic setting, which is a
 * migration and a settings panel, and not something to invent before anybody
 * has asked for it.
 */
export const MEASUREMENT_REVIEW_DAYS = 84;

/**
 * Active clients whose last measurement is older than the review interval, and
 * clients who have never been measured at all.
 *
 * Both are the same question — "nobody has weighed this person lately" — so they
 * are one category rather than two: a separate "never measured" row would put
 * every client added this morning on the dashboard, which is noise, and the
 * `created_at` guard below is what keeps a new record out of it until they have
 * had time to come in.
 */
export async function listClientsWithStaleMeasurement(
  clinicId: string,
  today: IsoDate,
  limit: number,
): Promise<AttentionItem[]> {
  const cutoff = addDays(today, -MEASUREMENT_REVIEW_DAYS);

  const rows = await db
    .select({ clientId: clients.id, clientName: clients.fullName, clientSeq })
    .from(clients)
    .where(
      and(
        eq(clients.clinicId, clinicId),
        eq(clients.status, 'active'),
        // A client added yesterday is not overdue for anything.
        lt(clients.createdAt, sql`now() - make_interval(days => ${MEASUREMENT_REVIEW_DAYS})`),
        notExists(
          db
            .select({ id: clientMeasurements.id })
            .from(clientMeasurements)
            .where(
              and(
                eq(clientMeasurements.clientId, clients.id),
                gte(clientMeasurements.measuredOn, cutoff),
              ),
            ),
        ),
      ),
    )
    .orderBy(desc(clients.createdAt))
    .limit(limit);

  return rows.map((row) => ({ ...row, reason: 'measurementOverdue' as const }));
}
