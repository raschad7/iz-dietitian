import { and, asc, count, desc, eq, gte, isNotNull, notExists } from 'drizzle-orm';

import { db } from '@/db';
import { appointmentRequests, appointments, clients, mealPlans, session } from '@/db/schema';
import { type RequestKind } from '@/features/portal/types';

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

/**
 * Active clients with zero meal plans.
 *
 * The dashboard spec asked for "meal plans ending within 7 days", but
 * `meal_plans` has no end date — it is a repeating weekly template, not a
 * dated programme (see the comment on that table). Rather than invent a
 * lifecycle the schema doesn't have, this lists the honestly-derivable proxy:
 * a client with zero plans has clearly fallen further through the cracks than
 * one whose plan might lapse soon.
 */
export async function listClientsWithoutMealPlan(clinicId: string, limit: number): Promise<AttentionItem[]> {
  const rows = await db
    .select({ clientId: clients.id, clientName: clients.fullName })
    .from(clients)
    .where(
      and(
        eq(clients.clinicId, clinicId),
        eq(clients.status, 'active'),
        notExists(db.select({ id: mealPlans.id }).from(mealPlans).where(eq(mealPlans.clientId, clients.id))),
      ),
    )
    .orderBy(asc(clients.fullName))
    .limit(limit);

  return rows.map((row) => ({ ...row, reason: 'noMealPlan' as const }));
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
