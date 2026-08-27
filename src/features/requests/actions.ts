'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';

import { type BookingContext } from '@/features/booking/mutations';
import { localeSchema } from '@/features/booking/schema';
import { notifyRecordRequestAnswered, notifyRequestAnswered } from '@/features/portal/push/notify';
import {
  notifyAppointmentBooked,
  notifyAppointmentCancelled,
  notifyAppointmentRescheduled,
} from '@/features/whatsapp/notify';
import { type Locale } from '@/i18n/routing';
import { requireStaffClinic } from '@/lib/session';

import {
  answerClientRequest,
  approveAppointmentRequest,
  declineAppointmentRequest,
  type ApprovedRequest,
} from './mutations';
import {
  answerClientRequestSchema,
  approveAppointmentRequestSchema,
  declineAppointmentRequestSchema,
} from './schema';
import { type RequestsResult } from './types';

/**
 * The requests inbox's mutations.
 *
 * A server action is a public endpoint: the page guard protects the render, not
 * the write. So every action here re-verifies the session and scopes the write
 * to the caller's own clinic, exactly as `src/features/booking/actions.ts` does.
 *
 * These are thin on purpose. Validation lives in `./schema.ts`, and the
 * read-book-mark sequence in `./mutations.ts`. What is added here — and only
 * here — are the Next.js concerns: the session lookup, `revalidatePath`, and
 * the WhatsApp message.
 *
 * This module is `"use server"`, so it may only export async functions — shared
 * types live in `./types.ts`.
 */

/**
 * Verifies the session and returns what a booking needs to know about who is
 * asking. The same context the calendar's own writes use, because an approval
 * is one of those writes.
 */
async function requestsContext(locale: Locale): Promise<BookingContext> {
  const { session, clinicId } = await requireStaffClinic(locale);
  return { clinicId, ownerName: session.user.name };
}

/**
 * Everything an answered request changes.
 *
 * The inbox and the dashboard both list pending items, and an approval writes
 * the calendar as well — so all three are stale the moment one is answered. The
 * calendar is revalidated as a layout, since a booking made here changes what
 * the day, week and month views show.
 */
function revalidateRequests(locale: Locale, touchedCalendar: boolean): void {
  revalidatePath(`/${locale}/app/requests`);
  revalidatePath(`/${locale}/app`);
  revalidatePath(`/${locale}/app/notifications`);
  if (touchedCalendar) revalidatePath(`/${locale}/app/calendar`, 'layout');
}

/**
 * Tells the client what was decided, over WhatsApp, **after** the response has
 * been sent.
 *
 * `after()` rather than an inline `await`, and the same reasoning as
 * `src/features/booking/actions.ts`: the message travels through an external
 * gateway, and answering a request must not wait on a service that may be slow
 * or down. Nothing here fails because of it — an appointment is not less booked
 * for a message that did not go out.
 *
 * Which message is decided by what the approval actually did, not by the kind
 * that was asked for: a reschedule the dietitian approved onto the same slot is
 * a confirmation, not a "your appointment has moved".
 */
function notifyClient(clinicId: string, approved: ApprovedRequest): void {
  after(async () => {
    try {
      if (approved.kind === 'cancel') {
        await notifyAppointmentCancelled(clinicId, {
          appointmentId: approved.appointment.id,
          clientId: approved.appointment.clientId,
          date: approved.appointment.date,
          startMinute: approved.appointment.startMinute,
        });
        return;
      }

      if (approved.kind === 'reschedule' && approved.moved) {
        await notifyAppointmentRescheduled(clinicId, approved.appointmentId, approved.previous);
        return;
      }

      await notifyAppointmentBooked(clinicId, approved.appointmentId);
    } catch (error) {
      console.error('[requests] WhatsApp notice failed', error);
    }
  });
}

/**
 * Tells the client on their own device that the request was answered, **after**
 * the response has been sent.
 *
 * The push twin of {@link notifyClient} above, and deliberately a second call
 * rather than a branch inside it: the two channels answer to different things.
 * WhatsApp is sent from the clinic's paired number and only for an *approval*,
 * because what it carries is the appointment's new details. This is sent by the
 * app to a device the client registered, and it goes out for a decline too —
 * "your request was answered" is news either way, and it is exactly the
 * `clinicMessage` item the in-app feed derives from the same row.
 *
 * `after()` for {@link notifyClient}'s reason: answering a request must not
 * wait on a push service. Nothing here can fail the response.
 */
function notifyClientDevices(
  send: () => Promise<unknown>,
): void {
  after(async () => {
    try {
      await send();
    } catch (error) {
      console.error('[requests] push notice failed', error);
    }
  });
}

/**
 * Approves a request, booking it at the time the dietitian confirmed.
 *
 * A booking rejection comes back carrying `namespace: 'booking'` so the dialog
 * renders the calendar's own sentence — see {@link RequestsResult}.
 */
export async function approveAppointmentRequestAction(
  rawLocale: string,
  input: unknown,
): Promise<RequestsResult> {
  const locale = localeSchema.parse(rawLocale);
  const context = await requestsContext(locale);

  const parsed = approveAppointmentRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'errors.invalid' };

  const result = await approveAppointmentRequest(context, parsed.data);

  if (!result.ok) return result;

  revalidateRequests(locale, true);
  notifyClient(context.clinicId, result.data);
  notifyClientDevices(() =>
    notifyRequestAnswered(result.data.clientId, parsed.data.requestId, 'approved'),
  );

  // The approval's details serve the notifications above and nothing else, so
  // the browser goes on seeing a plain ok.
  return { ok: true, data: undefined };
}

/** Turns a request down. Nothing is written to the calendar, and nothing is sent. */
export async function declineAppointmentRequestAction(
  rawLocale: string,
  input: unknown,
): Promise<RequestsResult> {
  const locale = localeSchema.parse(rawLocale);
  const { clinicId } = await requestsContext(locale);

  const parsed = declineAppointmentRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'errors.invalid' };

  const result = await declineAppointmentRequest(clinicId, parsed.data);

  if (!result.ok) return result;

  revalidateRequests(locale, false);
  notifyClientDevices(() =>
    notifyRequestAnswered(result.data.clientId, parsed.data.requestId, 'declined'),
  );

  // The client id served the notification and nothing else — see the approval.
  return { ok: true, data: undefined };
}

/**
 * Answers a request about the client's own record.
 *
 * Their profile screen reads the open request to decide whether to offer a form
 * or a status, so the portal is revalidated too — otherwise a client whose
 * correction was answered would go on being told it is still waiting.
 */
export async function answerClientRequestAction(
  rawLocale: string,
  input: unknown,
): Promise<RequestsResult> {
  const locale = localeSchema.parse(rawLocale);
  const { clinicId } = await requestsContext(locale);

  const parsed = answerClientRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'errors.invalid' };

  const result = await answerClientRequest(clinicId, parsed.data);

  if (!result.ok) return result;

  revalidateRequests(locale, false);
  revalidatePath(`/${locale}/portal`, 'layout');

  // Lands on the client's profile screen rather than the notifications feed,
  // which lists appointment requests only — see `notifyRecordRequestAnswered`.
  notifyClientDevices(() =>
    notifyRecordRequestAnswered(result.data.clientId, parsed.data.requestId, parsed.data.status),
  );

  return { ok: true, data: undefined };
}
