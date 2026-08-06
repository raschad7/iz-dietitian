import { and, count, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { isUniqueViolation } from '@/db/errors';
import {
  appointmentRequests,
  appointments,
  clientPlanAdherence,
  clientRequests,
  clientSettings,
  clients,
  user,
  weeklyPlanMealCompletions,
  weeklyPlanMeals,
  weeklyPlans,
} from '@/db/schema';
import { hasEnded, type WallClock } from '@/features/booking/completed';
import { getClinicHours } from '@/features/booking/queries';
import { weekDates } from '@/features/weekly-plans/week';
import { type Locale } from '@/i18n/routing';

import { deriveAdherenceLevel, type AdherenceLevel } from './adherence';
import { listClinicBookings } from './queries';
import {
  type AccountDeletionRequestInput,
  type AppointmentRequestInput,
  type DataUpdateRequestInput,
  type NotificationSettingInput,
} from './schema';
import { availableSlots } from './slots';
import {
  type ClientRequestKind,
  type ContactMethod,
  type PortalResult,
  type ThemePreference,
} from './types';

/**
 * Every write the client portal makes. Imports nothing from Next.js, so these
 * can be called directly from a test — `actions.ts` is the thin layer that adds
 * the Next.js concerns, as in `src/features/booking/mutations.ts`.
 *
 * A client can do exactly three things here: ask for something, withdraw the
 * asking, and change the language the clinic writes to them in. None of them
 * touch the calendar. That is the whole point of the design — see the header of
 * `src/db/schema/appointment-requests.ts`.
 */

export type PortalWriteContext = {
  clientId: string;
  clinicId: string;
  /** The clinic's wall clock, supplied by the caller so a test can pin it. */
  now: WallClock;
};

/**
 * Files a request with the dietitian.
 *
 * The preferred time is re-checked here against rows read now, not against
 * whatever the form was rendered from — a slot can be taken between the page
 * loading and the button being pressed. Offering a time and then accepting a
 * request for it that can never be approved would be worse than saying so.
 *
 * This is not a booking, so there is no transaction and no locking: two clients
 * may ask for the same slot, and the dietitian decides. The only thing the
 * database arbitrates is the one-open-request-per-appointment index.
 */
export async function createAppointmentRequest(
  context: PortalWriteContext,
  input: AppointmentRequestInput,
): Promise<PortalResult<{ id: string }>> {
  const { clientId, clinicId, now } = context;

  // Ids arrive from the browser and are not trusted: the appointment is matched
  // by id AND by owner, so another client's id simply matches no row.
  if (input.kind !== 'new') {
    const [existing] = await db
      .select({
        id: appointments.id,
        date: appointments.date,
        startMinute: appointments.startMinute,
        durationMinutes: appointments.durationMinutes,
      })
      .from(appointments)
      .where(and(eq(appointments.id, input.appointmentId), eq(appointments.clientId, clientId)))
      .limit(1);

    if (!existing) return { ok: false, error: 'errors.notFound' };

    // Nothing can be done about an appointment that has already happened, and a
    // request to move one would sit in the inbox meaning nothing.
    if (hasEnded(existing, now)) return { ok: false, error: 'errors.pastAppointment' };
  }

  if (input.kind !== 'cancel') {
    const available = await hasOpenSlot(context, input.preferredDate, {
      excludeAppointmentId: input.kind === 'reschedule' ? input.appointmentId : null,
    });

    if (!available) return { ok: false, error: 'errors.slotUnavailable' };
  }

  /**
   * One open request per day for a brand-new appointment.
   *
   * The database index only covers requests that name an appointment, because a
   * `new` request names none. Without this check a client could fill the
   * dietitian's inbox with the same ask; with it, the second attempt is told
   * plainly that the first is still waiting.
   */
  if (input.kind === 'new') {
    const [duplicate] = await db
      .select({ id: appointmentRequests.id })
      .from(appointmentRequests)
      .where(
        and(
          eq(appointmentRequests.clientId, clientId),
          eq(appointmentRequests.status, 'pending'),
          eq(appointmentRequests.kind, 'new'),
          eq(appointmentRequests.preferredDate, input.preferredDate),
        ),
      )
      .limit(1);

    if (duplicate) return { ok: false, error: 'errors.alreadyRequested' };
  }

  try {
    const [created] = await db
      .insert(appointmentRequests)
      .values({
        clinicId,
        clientId,
        kind: input.kind,
        appointmentId: input.kind === 'new' ? null : input.appointmentId,
        preferredDate: input.kind === 'cancel' ? null : input.preferredDate,
        /**
         * Always null from this side. The column stays on the table because the
         * dietitian's inbox reads it — rows filed before clients stopped naming
         * a time still carry one — and because the check constraint only
         * requires that a non-cancellation propose *something*, which the date
         * above satisfies. See `appointmentRequestSchema`.
         */
        preferredStartMinute: null,
        note: input.note ?? null,
      })
      .returning({ id: appointmentRequests.id });

    if (!created) throw new Error('insert into appointment_requests returned no row');

    return { ok: true, data: { id: created.id } };
  } catch (error) {
    // The partial unique index: something about this appointment is already
    // waiting. An expected answer, not a fault.
    if (isUniqueViolation(error)) return { ok: false, error: 'errors.alreadyRequested' };

    console.error('[portal] creating an appointment request failed', error);
    return { ok: false, error: 'errors.unexpected' };
  }
}

/**
 * Withdraws a request the dietitian has not acted on yet.
 *
 * Scoped by owner and by status in the `WHERE`, so withdrawing someone else's
 * request — or one already approved — updates no rows rather than being caught
 * by a check after the fact.
 */
export async function withdrawRequest(clientId: string, requestId: string): Promise<PortalResult> {
  const updated = await db
    .update(appointmentRequests)
    .set({ status: 'withdrawn', updatedAt: new Date() })
    .where(
      and(
        eq(appointmentRequests.id, requestId),
        eq(appointmentRequests.clientId, clientId),
        eq(appointmentRequests.status, 'pending'),
      ),
    )
    .returning({ id: appointmentRequests.id });

  return updated.length > 0 ? { ok: true, data: undefined } : { ok: false, error: 'errors.notFound' };
}

/**
 * The client's language, in both places it is remembered.
 *
 * `clients.preferred_locale` is what the clinic writes to them in; `users.locale`
 * is what their account's own mail is sent in. They are two columns because they
 * answer to different owners — staff can change the first from the client's
 * record — but a client changing their own preference means both.
 */
export async function updateLanguagePreference(
  clientId: string,
  userId: string,
  locale: Locale,
): Promise<PortalResult> {
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(clients)
        .set({ preferredLocale: locale, updatedAt: new Date() })
        .where(eq(clients.id, clientId));

      await tx.update(user).set({ locale, updatedAt: new Date() }).where(eq(user.id, userId));
    });

    return { ok: true, data: undefined };
  } catch (error) {
    console.error('[portal] language preference update failed', error);
    return { ok: false, error: 'errors.unexpected' };
  }
}

/**
 * The column each notification switch writes to.
 *
 * A lookup rather than a name built by string concatenation: Drizzle needs a
 * real column reference, and a map means an unlisted key is a type error here
 * rather than an `undefined` reaching the `SET` clause.
 */
const NOTIFICATION_COLUMNS = {
  appointmentReminder: 'notifyAppointmentReminder',
  checkInReminder: 'notifyCheckInReminder',
  planUpdate: 'notifyPlanUpdate',
  clinicMessage: 'notifyClinicMessage',
} as const satisfies Record<NotificationSettingInput['kind'], keyof typeof clientSettings.$inferInsert>;

/**
 * Writes one of the client's own settings.
 *
 * An upsert, because the row is created lazily: a client who has never touched
 * this screen has no row, and `getClientSettings` reads them as the defaults
 * rather than writing one on their behalf. `onConflictDoUpdate` on the unique
 * `client_id` index means the first save and the hundredth are the same
 * statement, with no read-then-write race between them.
 *
 * Private to this module — the three exported wrappers below are what actions
 * call, so a caller cannot pass a patch touching a column it had no business
 * touching.
 */
async function saveClientSettings(
  clientId: string,
  patch: Partial<typeof clientSettings.$inferInsert>,
): Promise<PortalResult> {
  try {
    await db
      .insert(clientSettings)
      .values({ clientId, ...patch })
      .onConflictDoUpdate({
        target: clientSettings.clientId,
        set: { ...patch, updatedAt: new Date() },
      });

    return { ok: true, data: undefined };
  } catch (error) {
    console.error('[portal] saving a client setting failed', error);
    return { ok: false, error: 'errors.unexpected' };
  }
}

/** Turns one kind of message from the clinic on or off. */
export function updateNotificationSetting(
  clientId: string,
  input: NotificationSettingInput,
): Promise<PortalResult> {
  return saveClientSettings(clientId, { [NOTIFICATION_COLUMNS[input.kind]]: input.enabled });
}

export function updateThemePreference(clientId: string, theme: ThemePreference): Promise<PortalResult> {
  return saveClientSettings(clientId, { theme });
}

export function updateContactMethod(
  clientId: string,
  preferredContact: ContactMethod,
): Promise<PortalResult> {
  return saveClientSettings(clientId, { preferredContact });
}

/**
 * Files a request with the clinic about the client's own record.
 *
 * Nothing about the record changes here, and that is the design rather than an
 * omission: the profile a client reads is a clinical document their dietitian
 * wrote and works from, so a correction is a message to a person, not an
 * `UPDATE`. The screen that files one says exactly that.
 *
 * The partial unique index does the arbitration: a second tap while the first
 * is still waiting is caught as a unique violation and answered plainly, rather
 * than filling the clinic's inbox with the same ask.
 */
export async function createClientRequest(
  { clientId, clinicId }: { clientId: string; clinicId: string },
  input:
    | ({ kind: 'data_update' } & DataUpdateRequestInput)
    | ({ kind: 'account_deletion' } & AccountDeletionRequestInput),
): Promise<PortalResult<{ id: string }>> {
  try {
    const [created] = await db
      .insert(clientRequests)
      .values({
        clinicId,
        clientId,
        kind: input.kind,
        topic: input.kind === 'data_update' ? input.topic : null,
        message: input.message ?? null,
      })
      .returning({ id: clientRequests.id });

    if (!created) throw new Error('insert into client_requests returned no row');

    return { ok: true, data: { id: created.id } };
  } catch (error) {
    // Something of this kind is already waiting. An expected answer, not a fault.
    if (isUniqueViolation(error)) return { ok: false, error: 'errors.alreadyRequested' };

    console.error('[portal] creating a client request failed', error);
    return { ok: false, error: 'errors.unexpected' };
  }
}

/**
 * Takes back a request the clinic has not answered yet.
 *
 * Scoped by owner, kind and status in the `WHERE`, so withdrawing someone
 * else's request — or one already resolved — updates no rows rather than being
 * caught by a check after the fact. Same shape as `withdrawRequest` above.
 */
export async function withdrawClientRequest(
  clientId: string,
  kind: ClientRequestKind,
): Promise<PortalResult> {
  const updated = await db
    .update(clientRequests)
    .set({ status: 'withdrawn', updatedAt: new Date() })
    .where(
      and(
        eq(clientRequests.clientId, clientId),
        eq(clientRequests.kind, kind),
        eq(clientRequests.status, 'pending'),
      ),
    )
    .returning({ id: clientRequests.id });

  return updated.length > 0 ? { ok: true, data: undefined } : { ok: false, error: 'errors.notFound' };
}

/** The transaction handle `db.transaction`'s callback receives — typed once here so every caller of {@link recomputeDayAdherence} agrees on it. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Recomputes one plan-day's `client_plan_adherence` row from whichever of
 * that day's meals exist right now, and writes the result — or, when the day
 * no longer has any meals to derive a level from, deletes the row instead of
 * leaving it holding the last thing it was ever set to.
 *
 * Originally the tail end of {@link toggleMealCompletion} alone. It is
 * exported and reused by `weekly-plans/mutations.ts` — `replaceMeals`,
 * `deletePlan` and `createPlanFromGeneration` — because every one of those
 * deletes `weekly_plan_meals` rows (directly, or by deleting the plan that
 * owns them), which cascades away any `weekly_plan_meal_completions` tied to
 * them. Without this running again afterward, a day a client had already
 * ticked keeps showing whatever it last derived to — a stale "full" with zero
 * completions behind it — because nothing else ever revisits that row once
 * the meals it was computed from are gone. The `null` branch here is what
 * that dietitian-side path needs and `toggleMealCompletion` itself never
 * exercises: a meal being toggled always leaves at least itself on the day,
 * so `total` can never reach zero from there.
 *
 * Takes a transaction rather than opening its own, so a caller doing several
 * of these — one per affected day — commits them together with whatever else
 * it is doing to the plan.
 */
export async function recomputeDayAdherence(
  tx: Tx,
  {
    clinicId,
    clientId,
    planId,
    dayOfWeek,
    date,
  }: { clinicId: string; clientId: string; planId: string; dayOfWeek: number; date: string },
): Promise<AdherenceLevel | null> {
  const dayMeals = await tx
    .select({ id: weeklyPlanMeals.id })
    .from(weeklyPlanMeals)
    .where(and(eq(weeklyPlanMeals.planId, planId), eq(weeklyPlanMeals.dayOfWeek, dayOfWeek)));

  const dayMealIds = dayMeals.map((row) => row.id);

  const [completedRow] = dayMealIds.length
    ? await tx
        .select({ value: count() })
        .from(weeklyPlanMealCompletions)
        .where(
          and(
            eq(weeklyPlanMealCompletions.clientId, clientId),
            inArray(weeklyPlanMealCompletions.mealId, dayMealIds),
          ),
        )
    : [];

  const derived = deriveAdherenceLevel(completedRow?.value ?? 0, dayMealIds.length);

  if (derived) {
    await tx
      .insert(clientPlanAdherence)
      .values({ clinicId, clientId, date, level: derived })
      .onConflictDoUpdate({
        target: [clientPlanAdherence.clientId, clientPlanAdherence.date],
        set: { level: derived, updatedAt: new Date() },
      });
  } else {
    await tx
      .delete(clientPlanAdherence)
      .where(and(eq(clientPlanAdherence.clientId, clientId), eq(clientPlanAdherence.date, date)));
  }

  return derived;
}

/**
 * Ticks or unticks one meal, and recomputes that day's `client_plan_adherence`
 * level from the result.
 *
 * `mealId` is proved to belong to this client's own **published** plan in the
 * same query that reads which day it falls on — a draft plan or another
 * client's meal simply matches no row, the same ownership shape every other
 * portal write uses. The day is derived from the meal (`day_of_week` plus the
 * plan's `week_start_date`), never taken from the caller, so a client cannot
 * tick a meal into a day it does not belong to.
 *
 * Ticking is `onConflictDoNothing` and unticking is a plain delete, both
 * against the unique `(client_id, meal_id)` index — a double-tap from a slow
 * network is a no-op rather than a second row to reconcile.
 *
 * The whole thing runs in one transaction: the tick, the recount, and the
 * derived adherence row all commit together, so a reader can never observe a
 * meal ticked against a day whose level has not caught up with it yet.
 */
export async function toggleMealCompletion(
  { clientId, clinicId }: { clientId: string; clinicId: string },
  mealId: string,
  completed: boolean,
): Promise<PortalResult<{ date: string; level: AdherenceLevel | null }>> {
  try {
    const [meal] = await db
      .select({ dayOfWeek: weeklyPlanMeals.dayOfWeek, planId: weeklyPlanMeals.planId, weekStartDate: weeklyPlans.weekStartDate })
      .from(weeklyPlanMeals)
      .innerJoin(weeklyPlans, eq(weeklyPlans.id, weeklyPlanMeals.planId))
      .where(
        and(
          eq(weeklyPlanMeals.id, mealId),
          eq(weeklyPlans.clientId, clientId),
          eq(weeklyPlans.clinicId, clinicId),
          eq(weeklyPlans.status, 'published'),
        ),
      )
      .limit(1);

    if (!meal) return { ok: false, error: 'errors.notFound' };

    const date = weekDates(meal.weekStartDate)[meal.dayOfWeek];
    if (!date) return { ok: false, error: 'errors.unexpected' };

    const level = await db.transaction(async (tx) => {
      if (completed) {
        await tx.insert(weeklyPlanMealCompletions).values({ clinicId, clientId, mealId }).onConflictDoNothing();
      } else {
        await tx
          .delete(weeklyPlanMealCompletions)
          .where(and(eq(weeklyPlanMealCompletions.clientId, clientId), eq(weeklyPlanMealCompletions.mealId, mealId)));
      }

      return recomputeDayAdherence(tx, { clinicId, clientId, planId: meal.planId, dayOfWeek: meal.dayOfWeek, date });
    });

    return { ok: true, data: { date, level } };
  } catch (error) {
    console.error('[portal] toggling meal completion failed', error);
    return { ok: false, error: 'errors.unexpected' };
  }
}

/**
 * Whether that day still has room for this client, judged by the shared slot
 * rules.
 *
 * A day rather than a time, because a client names a day and nothing finer —
 * see the header of `appointmentRequestSchema`. This asks the one question that
 * remains answerable: is there any start time on that date this client could be
 * given? A closed day, a fully booked one, a day already past, or one they
 * already have an appointment on all answer no, and each of them would make the
 * request an inbox item the dietitian could only decline.
 *
 * It deliberately does not reserve anything. Two clients may ask for the same
 * day and both be told yes; the dietitian decides who gets which hour, and the
 * booking rules are applied for real at that point.
 */
async function hasOpenSlot(
  { clientId, clinicId, now }: PortalWriteContext,
  date: string,
  { excludeAppointmentId }: { excludeAppointmentId: string | null },
): Promise<boolean> {
  const [hours, existing] = await Promise.all([
    getClinicHours(clinicId),
    listClinicBookings(clinicId, date, date),
  ]);

  if (!hours) return false;

  return (
    availableSlots({
      date,
      hours: { ...hours, workingDays: [...hours.workingDays] },
      existing,
      clientId,
      now,
      excludeAppointmentId,
    }).length > 0
  );
}
