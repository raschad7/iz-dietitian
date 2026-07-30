import { and, asc, between, desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { appointmentRequests, appointments, clients, mealPlans } from '@/db/schema';
import { type ExistingAppointment } from '@/features/booking/validation';

import { type PortalAppointment, type PortalProfile, type PortalRequest, type RequestKind, type RequestStatus } from './types';

/**
 * Reads for the client portal. Imports nothing from Next.js, so these can be
 * called from a test or a script — the same split as
 * `src/features/clients/queries.ts`.
 *
 * **The scope here is one client, not one clinic.** Every function takes a
 * `clientId` that came from `requirePortalClient`, which resolved it from the
 * session's user id. That is the whole authorisation model of this area: a
 * client sees their own row and nothing else, so `clientId` is a required first
 * argument everywhere and forgetting it is a type error.
 */

/** The signed-in client's own record, plus the two ids every other read needs. */
export type PortalClient = { id: string; clinicId: string; profile: PortalProfile };

/**
 * Resolves a portal session to the clinical record behind it.
 *
 * Returns null when the account has no client row — which happens for exactly
 * one reason worth handling: staff revoked portal access
 * (`clients.user_id` is `set null` on that path) while the session was alive.
 * The caller turns that into a sign-out rather than a crash.
 *
 * `medical_notes` and `notes` are deliberately not selected. They are the
 * dietitian's own working notes about the person, not a record written for them
 * to read, and nothing in the portal should be able to leak them by accident.
 */
export async function getPortalClient(userId: string): Promise<PortalClient | null> {
  const [row] = await db
    .select({
      id: clients.id,
      clinicId: clients.clinicId,
      fullName: clients.fullName,
      phone: clients.phone,
      email: clients.email,
      preferredLocale: clients.preferredLocale,
      dateOfBirth: clients.dateOfBirth,
      sex: clients.sex,
      heightCm: clients.heightCm,
      goal: clients.goal,
      activityLevel: clients.activityLevel,
      allergies: clients.allergies,
    })
    .from(clients)
    .where(eq(clients.userId, userId))
    .limit(1);

  if (!row) return null;

  const { id, clinicId, ...profile } = row;

  return { id, clinicId, profile: { id, ...profile } };
}

/**
 * How many of a client's appointments the portal will ever load at once.
 *
 * `appointments` allows one row per client per day, so this is years of weekly
 * visits. Reading them in one query and splitting them by the clock in memory
 * (see `./appointments.ts`) beats two queries that would each have to encode the
 * "has today's appointment finished yet?" boundary in SQL.
 */
const APPOINTMENT_LIMIT = 200;

/**
 * Every appointment this client has, newest first, each flagged with whether a
 * request about it is still waiting on the dietitian.
 *
 * The flag is what stops the UI offering "cancel" on something already asked
 * about — the partial unique index in `src/db/schema/appointment-requests.ts`
 * would refuse the second request anyway, but a button that always fails is a
 * worse answer than one that is not there.
 */
export async function listPortalAppointments(clientId: string): Promise<PortalAppointment[]> {
  const rows = await db
    .select({
      id: appointments.id,
      date: appointments.date,
      startMinute: appointments.startMinute,
      durationMinutes: appointments.durationMinutes,
      reason: appointments.reason,
    })
    .from(appointments)
    .where(eq(appointments.clientId, clientId))
    .orderBy(desc(appointments.date), desc(appointments.startMinute))
    .limit(APPOINTMENT_LIMIT);

  if (rows.length === 0) return [];

  const openRequests = await db
    .select({ appointmentId: appointmentRequests.appointmentId })
    .from(appointmentRequests)
    .where(
      and(
        eq(appointmentRequests.clientId, clientId),
        eq(appointmentRequests.status, 'pending'),
        inArray(
          appointmentRequests.appointmentId,
          rows.map((row) => row.id),
        ),
      ),
    );

  const pending = new Set(openRequests.map((row) => row.appointmentId));

  return rows.map((row) => ({ ...row, hasOpenRequest: pending.has(row.id) }));
}

/** One appointment, only if it belongs to this client. Null is "not yours" and "gone" alike. */
export async function getPortalAppointment(
  clientId: string,
  appointmentId: string,
): Promise<PortalAppointment | null> {
  const [row] = await db
    .select({
      id: appointments.id,
      date: appointments.date,
      startMinute: appointments.startMinute,
      durationMinutes: appointments.durationMinutes,
      reason: appointments.reason,
    })
    .from(appointments)
    .where(and(eq(appointments.id, appointmentId), eq(appointments.clientId, clientId)))
    .limit(1);

  return row ? { ...row, hasOpenRequest: false } : null;
}

/** Everything this client has asked for, newest first. */
export async function listPortalRequests(clientId: string): Promise<PortalRequest[]> {
  const rows = await db
    .select({
      id: appointmentRequests.id,
      kind: appointmentRequests.kind,
      status: appointmentRequests.status,
      preferredDate: appointmentRequests.preferredDate,
      preferredStartMinute: appointmentRequests.preferredStartMinute,
      note: appointmentRequests.note,
      createdAt: appointmentRequests.createdAt,
      appointmentDate: appointments.date,
      appointmentStartMinute: appointments.startMinute,
    })
    .from(appointmentRequests)
    .leftJoin(appointments, eq(appointments.id, appointmentRequests.appointmentId))
    .where(eq(appointmentRequests.clientId, clientId))
    .orderBy(desc(appointmentRequests.createdAt))
    .limit(50);

  return rows.map(({ appointmentDate, appointmentStartMinute, kind, status, ...request }) => ({
    ...request,
    // The columns are plain `text` guarded by check constraints, so the union is
    // reasserted on the way out rather than trusted from the driver's `string`.
    kind: kind as RequestKind,
    status: status as RequestStatus,
    appointment:
      appointmentDate !== null && appointmentStartMinute !== null
        ? { date: appointmentDate, startMinute: appointmentStartMinute }
        : null,
  }));
}

/**
 * The clinic's bookings across a date range, reduced to what the slot rules
 * consult and nothing more.
 *
 * A client must not learn who else is booked, so this deliberately does not join
 * `clients`: it returns times, not people. The times themselves are unavoidable
 * — "when are you free?" is the question being asked.
 */
export async function listClinicBookings(
  clinicId: string,
  fromDate: string,
  toDate: string,
): Promise<ExistingAppointment[]> {
  return db
    .select({
      id: appointments.id,
      practitionerId: appointments.practitionerId,
      clientId: appointments.clientId,
      date: appointments.date,
      startMinute: appointments.startMinute,
      durationMinutes: appointments.durationMinutes,
    })
    .from(appointments)
    .where(and(eq(appointments.clinicId, clinicId), between(appointments.date, fromDate, toDate)))
    .orderBy(asc(appointments.date), asc(appointments.startMinute));
}

/**
 * The plan the client is on now, as an id for `getPlan` to load.
 *
 * "Current" is the most recently edited plan. There is no `active` flag on
 * `meal_plans` and inventing one here would be a schema decision made from the
 * portal; the dietitian's own list already orders by `updated_at`, so this is
 * the same plan that sits at the top of their screen.
 */
export async function getCurrentPlanId(clientId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: mealPlans.id })
    .from(mealPlans)
    .where(eq(mealPlans.clientId, clientId))
    .orderBy(desc(mealPlans.updatedAt))
    .limit(1);

  return row?.id ?? null;
}
