import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { isUniqueViolation } from '@/db/errors';
import { appointmentRequests, appointments, clients, user } from '@/db/schema';
import { hasEnded, type WallClock } from '@/features/booking/completed';
import { getClinicHours } from '@/features/booking/queries';
import { type Locale } from '@/i18n/routing';

import { listClinicBookings } from './queries';
import { type AppointmentRequestInput } from './schema';
import { availableSlots } from './slots';
import { type PortalResult } from './types';

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
    const available = await isSlotAvailable(context, input.preferredDate, input.preferredStartMinute, {
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
        preferredStartMinute: input.kind === 'cancel' ? null : input.preferredStartMinute,
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

/** Whether one specific start time is still on offer, judged by the shared slot rules. */
async function isSlotAvailable(
  { clientId, clinicId, now }: PortalWriteContext,
  date: string,
  startMinute: number,
  { excludeAppointmentId }: { excludeAppointmentId: string | null },
): Promise<boolean> {
  const [hours, existing] = await Promise.all([
    getClinicHours(clinicId),
    listClinicBookings(clinicId, date, date),
  ]);

  if (!hours) return false;

  return availableSlots({
    date,
    hours: { ...hours, workingDays: [...hours.workingDays] },
    existing,
    clientId,
    now,
    excludeAppointmentId,
  }).includes(startMinute);
}
