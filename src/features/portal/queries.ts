import { and, asc, between, count, desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import {
  appointmentRequests,
  appointments,
  clientCheckIns,
  clientPlanAdherence,
  clientRequests,
  clientSettings,
  clients,
  clinics,
  defaultClientSettings,
  practitioners,
  weeklyPlanMealCompletions,
} from '@/db/schema';
import { type ExistingAppointment } from '@/features/booking/validation';

import { type AdherenceRow } from './adherence';
import { type CheckInRow } from './check-ins';

import {
  type ClientRequestKind,
  type ClientRequestSummary,
  type ClientRequestTopic,
  type ContactMethod,
  type PortalAppointment,
  type PortalClinic,
  type PortalPractitioner,
  type PortalProfile,
  type PortalRequest,
  type PortalSettings,
  type RequestKind,
  type RequestStatus,
  type ThemePreference,
} from './types';

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

/**
 * The signed-in client's own record, plus the ids every other read needs.
 *
 * `assignedDietitianId` is a `users.id`, and it is carried here rather than
 * resolved eagerly because only the profile screen wants the name behind it —
 * the header, which loads this on every portal page, does not.
 */
export type PortalClient = {
  id: string;
  clinicId: string;
  assignedDietitianId: string | null;
  profile: PortalProfile;
};

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
 *
 * `conditions`, `medications` and `care_note` ARE selected, and the difference
 * is the point: those three are the part of the same record a dietitian writes
 * *for* the client, and the profile screen renders them verbatim. See the
 * column comments in `src/db/schema/clients.ts`.
 */
export async function getPortalClient(userId: string): Promise<PortalClient | null> {
  const [row] = await db
    .select({
      id: clients.id,
      clinicId: clients.clinicId,
      assignedDietitianId: clients.assignedDietitianId,
      fullName: clients.fullName,
      phone: clients.phone,
      email: clients.email,
      preferredLocale: clients.preferredLocale,
      photoUrl: clients.photoUrl,
      dateOfBirth: clients.dateOfBirth,
      sex: clients.sex,
      heightCm: clients.heightCm,
      goal: clients.goal,
      activityLevel: clients.activityLevel,
      allergies: clients.allergies,
      conditions: clients.conditions,
      medications: clients.medications,
      updatedAt: clients.updatedAt,
    })
    .from(clients)
    .where(eq(clients.userId, userId))
    .limit(1);

  if (!row) return null;

  const { id, clinicId, assignedDietitianId, ...profile } = row;

  return { id, clinicId, assignedDietitianId, profile: { id, ...profile } };
}

/**
 * The clinic the client belongs to, as the profile screen shows it.
 *
 * A read of its own rather than a join onto `getPortalClient`: the client row
 * is loaded on every portal page by the shell, and the clinic's address is
 * wanted on exactly one of them.
 */
export async function getPortalClinic(clinicId: string): Promise<PortalClinic | null> {
  const [row] = await db
    .select({
      name: clinics.name,
      phone: clinics.phone,
      address: clinics.address,
      workingDays: clinics.workingDays,
      openMinute: clinics.openMinute,
      closeMinute: clinics.closeMinute,
    })
    .from(clinics)
    .where(eq(clinics.id, clinicId))
    .limit(1);

  return row ?? null;
}

/**
 * The dietitian assigned to this client.
 *
 * `clients.assigned_dietitian_id` is a `users.id`, and the name and specialty
 * live on `practitioners` — the two are linked by `practitioners.user_id`. The
 * clinic id is in the `WHERE` as well, so a stale assignment pointing at
 * someone who has since moved clinics resolves to nobody rather than naming a
 * stranger.
 *
 * Returns null when no dietitian is assigned, which is the normal state for a
 * one-person clinic that never filled the field in. The screen says so rather
 * than guessing at the clinic's only practitioner: being told the wrong
 * person is looking after you is worse than being told nobody is recorded.
 */
export async function getAssignedPractitioner(
  clinicId: string,
  assignedDietitianId: string | null,
): Promise<PortalPractitioner | null> {
  if (!assignedDietitianId) return null;

  const [row] = await db
    .select({ name: practitioners.name, specialty: practitioners.specialty })
    .from(practitioners)
    .where(
      and(eq(practitioners.clinicId, clinicId), eq(practitioners.userId, assignedDietitianId)),
    )
    .limit(1);

  return row ?? null;
}

/*
 * `getSharedWeight` used to be here.
 *
 * The dietitian's "show her weight in the portal" switch is gone, and with it
 * the only thing that ever set `share_weight_with_client` to true — so the read
 * it gated could no longer return anything but null. The weight is simply not
 * part of the portal record now, which is the same thing every client was
 * already seeing: the flag defaults to false.
 *
 * §11 still holds and is now trivially satisfied — the number never leaves the
 * database for a client-facing screen at all.
 */

/**
 * The client's own account settings, with the defaults filled in.
 *
 * A client who has never opened this screen has no row, and that is not an
 * error — `defaultClientSettings` is what they are already living under, so
 * returning it means the screen renders the truth without a write happening on
 * a read.
 *
 * The two text columns are re-narrowed on the way out for the same reason
 * `listPortalRequests` re-narrows `kind`: they are `text` guarded by a check
 * constraint, so the driver hands back a `string`.
 */
export async function getClientSettings(clientId: string): Promise<PortalSettings> {
  const [row] = await db
    .select({
      notifyAppointmentReminder: clientSettings.notifyAppointmentReminder,
      notifyCheckInReminder: clientSettings.notifyCheckInReminder,
      notifyPlanUpdate: clientSettings.notifyPlanUpdate,
      notifyClinicMessage: clientSettings.notifyClinicMessage,
      theme: clientSettings.theme,
      preferredContact: clientSettings.preferredContact,
    })
    .from(clientSettings)
    .where(eq(clientSettings.clientId, clientId))
    .limit(1);

  const stored = row ?? defaultClientSettings;

  return {
    notifications: {
      appointmentReminder: stored.notifyAppointmentReminder,
      checkInReminder: stored.notifyCheckInReminder,
      planUpdate: stored.notifyPlanUpdate,
      clinicMessage: stored.notifyClinicMessage,
    },
    theme: stored.theme as ThemePreference,
    preferredContact: stored.preferredContact as ContactMethod,
  };
}

/**
 * The request of this kind the clinic has not answered yet, if there is one.
 *
 * Both screens ask this so they can show what is already waiting instead of a
 * form that would be refused by the partial unique index — the same reasoning
 * as `listPortalAppointments`'s `hasOpenRequest` flag.
 */
export async function getOpenClientRequest(
  clientId: string,
  kind: ClientRequestKind,
): Promise<ClientRequestSummary | null> {
  const [row] = await db
    .select({
      id: clientRequests.id,
      kind: clientRequests.kind,
      topic: clientRequests.topic,
      createdAt: clientRequests.createdAt,
    })
    .from(clientRequests)
    .where(
      and(
        eq(clientRequests.clientId, clientId),
        eq(clientRequests.kind, kind),
        eq(clientRequests.status, 'pending'),
      ),
    )
    .limit(1);

  if (!row) return null;

  return {
    ...row,
    kind: row.kind as ClientRequestKind,
    topic: row.topic as ClientRequestTopic | null,
  };
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
      updatedAt: appointmentRequests.updatedAt,
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
 * How many of this client's requests the dietitian has not answered yet.
 *
 * A count rather than `listPortalRequests(...).filter(...)`: the header needs
 * the number and nothing else, and the shell renders on every portal page —
 * including the ones that never load the list.
 */
export async function countPendingRequests(clientId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(appointmentRequests)
    .where(and(eq(appointmentRequests.clientId, clientId), eq(appointmentRequests.status, 'pending')));

  return row?.value ?? 0;
}

/**
 * The client's own check-ins across a date range, inclusive.
 *
 * Scoped by `clientId` and not by clinic: a check-in is the client's own record
 * of their day, and the portal's whole authorisation model is that they read
 * their row and nobody else's.
 *
 * Returns whatever exists — a day with no answer has no row, and the caller
 * (`summariseWeek`) draws that absence rather than being handed a zero the
 * client never gave.
 */
export async function listCheckIns(
  clientId: string,
  fromDate: string,
  toDate: string,
): Promise<CheckInRow[]> {
  return db
    .select({
      date: clientCheckIns.date,
      score: clientCheckIns.score,
      energy: clientCheckIns.energy,
      sleep: clientCheckIns.sleep,
      appetite: clientCheckIns.appetite,
      mood: clientCheckIns.mood,
      water: clientCheckIns.water,
    })
    .from(clientCheckIns)
    .where(and(eq(clientCheckIns.clientId, clientId), between(clientCheckIns.date, fromDate, toDate)))
    .orderBy(asc(clientCheckIns.date));
}

/** How closely the client reported following their plan, one row per day they answered. */
export async function listPlanAdherence(
  clientId: string,
  fromDate: string,
  toDate: string,
): Promise<AdherenceRow[]> {
  const rows = await db
    .select({
      date: clientPlanAdherence.date,
      level: clientPlanAdherence.level,
      // The measure itself — every percentage the portal draws is computed
      // from this pair, never recovered from `level`.
      completedMeals: clientPlanAdherence.completedMeals,
      totalMeals: clientPlanAdherence.totalMeals,
    })
    .from(clientPlanAdherence)
    .where(and(eq(clientPlanAdherence.clientId, clientId), between(clientPlanAdherence.date, fromDate, toDate)))
    .orderBy(asc(clientPlanAdherence.date));

  // `level` is plain `text` guarded by a check constraint, so the union is
  // reasserted on the way out rather than trusted from the driver's `string`.
  return rows.map((row) => ({ ...row, level: row.level as AdherenceRow['level'] }));
}

/**
 * Which of the given meals this client has ticked complete.
 *
 * Scoped to the meal ids the caller already knows belong to this client's own
 * plan — the same "prove ownership in the query that produced the ids"
 * pattern `loadPlanPage` already uses for `adherenceByDate`, rather than this
 * read re-deriving ownership itself.
 */
export async function listMealCompletions(clientId: string, mealIds: readonly string[]): Promise<Set<string>> {
  if (mealIds.length === 0) return new Set();

  const rows = await db
    .select({ mealId: weeklyPlanMealCompletions.mealId })
    .from(weeklyPlanMealCompletions)
    .where(
      and(eq(weeklyPlanMealCompletions.clientId, clientId), inArray(weeklyPlanMealCompletions.mealId, [...mealIds])),
    );

  return new Set(rows.map((row) => row.mealId));
}

/*
 * `getCurrentPlanId` used to live here: the most recently edited V1 `meal_plans`
 * row, which is what the portal showed before weekly plans existed.
 *
 * It is gone because "most recently edited" is the wrong rule for a client-facing
 * screen — it would show a plan mid-edit. Weekly plans carry an explicit
 * `published` status, so the portal now reads
 * `weekly-plans/queries.ts:getPublishedBoard`, and there is no guessing left to do.
 */
