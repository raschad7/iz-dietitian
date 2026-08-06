'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';

import {
  notifyAppointmentBooked,
  notifyAppointmentCancelled,
  notifyAppointmentRescheduled,
  notifyAppointmentSeriesBooked,
} from '@/features/whatsapp/notify';
import { requireStaffClinic } from '@/lib/session';
import { type Locale } from '@/i18n/routing';

import {
  createAppointment,
  createClientAndBook,
  deleteAppointment,
  repeatWeekly,
  updateAppointment,
  type BookingContext,
} from './mutations';
import {
  createAppointmentSchema,
  createClientAndBookSchema,
  deleteAppointmentSchema,
  localeSchema,
  repeatWeeklySchema,
  updateAppointmentSchema,
} from './schema';
import {
  type ActionResult,
  type CreatedAppointment,
  type DeletedAppointment,
  type WeeklyRepeatSummary,
} from './types';

/**
 * The booking feature's mutations.
 *
 * A server action is a public endpoint: the page guard protects the render, not
 * the write. So every action here re-verifies the session and scopes the write
 * to the caller's own clinic, exactly as `src/features/clients/actions.ts` does.
 *
 * These are thin on purpose. Validation lives in `./schema.ts`, the rules in
 * `./validation.ts`, and the read-validate-write transaction in `./mutations.ts`.
 * What is added here — and only here — are the Next.js concerns: the session
 * lookup and `revalidatePath`.
 *
 * Every action returns a discriminated result carrying a message key. Expected
 * business-rule failures are never thrown: "that slot is taken" is an answer,
 * and throwing would turn it into a 500 the user cannot read.
 *
 * This module is `"use server"`, so it may only export async functions — shared
 * types live in `./types.ts`.
 */

/**
 * Verifies the session and returns everything a write needs to know about who is
 * asking: the clinic to scope to, and the account holder's name, which names the
 * practitioner row the first time one is needed.
 */
async function bookingContext(locale: Locale): Promise<BookingContext> {
  const { session, clinicId } = await requireStaffClinic(locale);
  return { clinicId, ownerName: session.user.name };
}

/**
 * Revalidates every calendar view, not just the one the write came from — a
 * booking made in the day view changes what the week and month show too.
 */
function revalidateCalendar(locale: Locale): void {
  revalidatePath(`/${locale}/app/calendar`, 'layout');
}

/**
 * Tells the client their appointment is booked, over WhatsApp, **after** the
 * response has been sent.
 *
 * `after()` rather than an inline `await`: the message travels through an external
 * gateway, and saving an appointment must not wait on a network call to a service
 * that may be slow or down. It is also not fire-and-forget — Next keeps the work
 * alive past the response, which a bare floating promise does not guarantee.
 *
 * Whether anything is actually sent is the WhatsApp feature's decision (the clinic
 * may have confirmations switched off, no number linked, or the client may have no
 * phone). Nothing here fails because of it; a booking is not less booked for
 * lacking a WhatsApp message.
 */
function notifyBooked(clinicId: string, appointmentId: string): void {
  after(async () => {
    try {
      await notifyAppointmentBooked(clinicId, appointmentId);
    } catch (error) {
      console.error('[booking] WhatsApp confirmation failed', error);
    }
  });
}

/**
 * Tells the client about a whole course of appointments at once.
 *
 * The repeat's counterpart to {@link notifyBooked}, and deliberately not a loop
 * over it: a month of weekly visits is one schedule, and it arrives as one
 * message. Same `after()` reasoning, same indifference to failure.
 */
function notifySeriesBooked(clinicId: string, appointmentIds: string[]): void {
  after(async () => {
    try {
      await notifyAppointmentSeriesBooked(clinicId, appointmentIds);
    } catch (error) {
      console.error('[booking] WhatsApp series confirmation failed', error);
    }
  });
}

/**
 * Tells the client their appointment moved. Same `after()` reasoning as
 * {@link notifyBooked}, and the same indifference to failure: a booking is not
 * less moved for a message that did not go out.
 */
function notifyRescheduled(
  clinicId: string,
  appointmentId: string,
  previous: { date: string; startMinute: number },
): void {
  after(async () => {
    try {
      await notifyAppointmentRescheduled(clinicId, appointmentId, previous);
    } catch (error) {
      console.error('[booking] WhatsApp reschedule notice failed', error);
    }
  });
}

/** Tells the client their appointment is cancelled, after the row is gone. */
function notifyCancelled(clinicId: string, cancelled: DeletedAppointment): void {
  after(async () => {
    try {
      await notifyAppointmentCancelled(clinicId, {
        appointmentId: cancelled.id,
        clientId: cancelled.clientId,
        date: cancelled.date,
        startMinute: cancelled.startMinute,
      });
    } catch (error) {
      console.error('[booking] WhatsApp cancellation notice failed', error);
    }
  });
}

export async function createAppointmentAction(
  rawLocale: string,
  input: unknown,
): Promise<ActionResult<CreatedAppointment>> {
  const locale = localeSchema.parse(rawLocale);
  const context = await bookingContext(locale);

  const parsed = createAppointmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'errors.invalid' };

  const result = await createAppointment(context, parsed.data);

  if (result.ok) {
    revalidateCalendar(locale);
    notifyBooked(context.clinicId, result.data.id);
  }

  return result;
}

export async function updateAppointmentAction(rawLocale: string, input: unknown): Promise<ActionResult> {
  const locale = localeSchema.parse(rawLocale);
  const context = await bookingContext(locale);

  const parsed = updateAppointmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'errors.invalid' };

  const result = await updateAppointment(context, parsed.data);

  // `previous` is for the notification below and nothing else. The action's own
  // contract stays `ActionResult`, so it does not travel to the browser.
  if (!result.ok) return result;

  revalidateCalendar(locale);

  // A move and an edit are different news. Only the slot moving is worth telling
  // the client about, and it deserves its own message naming both times rather
  // than a second copy of "your appointment is confirmed". Anything else — the
  // reason, the duration, who it is with — is the clinic's own bookkeeping, and
  // the confirmation's dedupe key already makes re-saving an unchanged slot send
  // nothing.
  const { previous } = result.data;
  const moved = previous.date !== parsed.data.date || previous.startMinute !== parsed.data.startMinute;

  // No past-slot check here any more. It used to be this one `if`, which meant
  // every other path that messages a patient — booking, cancelling, approving a
  // request — could still write about an hour that had gone. The rule now lives
  // beside the send in `src/features/whatsapp/notify.ts`, where it covers all of
  // them and the next caller too; both branches below are refused there if this
  // slot has already started.
  if (moved) notifyRescheduled(context.clinicId, parsed.data.id, previous);
  else notifyBooked(context.clinicId, parsed.data.id);

  return { ok: true, data: undefined };
}

export async function deleteAppointmentAction(rawLocale: string, input: unknown): Promise<ActionResult> {
  const locale = localeSchema.parse(rawLocale);
  const context = await bookingContext(locale);

  const parsed = deleteAppointmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'errors.invalid' };

  const result = await deleteAppointment(context.clinicId, parsed.data.id);

  // Same as the update: the deleted row's details serve the notification, and
  // the browser goes on seeing a plain ok/error.
  if (!result.ok) return result;

  revalidateCalendar(locale);
  notifyCancelled(context.clinicId, result.data);

  return { ok: true, data: undefined };
}

/**
 * The offer made straight after a booking is saved: the same slot, every week,
 * for the rest of the month.
 *
 * A separate action rather than a flag on the create, because it answers a
 * separate question. The first booking is already written and already confirmed
 * to the patient by the time this is called, so a week the calendar refuses
 * cannot take the appointment down with it — see `repeatWeekly`, which skips
 * those weeks and counts them.
 *
 * Each repeat is a real appointment, so each gets its own confirmation message,
 * on the same terms as any other booking.
 */
export async function repeatWeeklyAction(
  rawLocale: string,
  input: unknown,
): Promise<ActionResult<WeeklyRepeatSummary>> {
  const locale = localeSchema.parse(rawLocale);
  const context = await bookingContext(locale);

  const parsed = repeatWeeklySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'errors.invalid' };

  const result = await repeatWeekly(context, parsed.data);

  if (result.ok && result.data.created > 0) {
    revalidateCalendar(locale);
    // One message listing the whole course, not one per appointment — see
    // `notifyAppointmentSeriesBooked`.
    notifySeriesBooked(context.clinicId, result.data.ids);
  }

  return result;
}

/**
 * The picker's "New client" path: creates the client and books the pending slot
 * together, so an abandoned or rejected booking leaves no orphaned record.
 */
export async function createClientAndBookAction(
  rawLocale: string,
  input: unknown,
): Promise<ActionResult<CreatedAppointment>> {
  const locale = localeSchema.parse(rawLocale);
  const context = await bookingContext(locale);

  const parsed = createClientAndBookSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'errors.invalid' };

  const result = await createClientAndBook(context, parsed.data);

  if (result.ok) {
    revalidateCalendar(locale);
    // The register gained a client, so its list is stale too.
    revalidatePath(`/${locale}/app/clients`);
    notifyBooked(context.clinicId, result.data.id);
  }

  return result;
}
