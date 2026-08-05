import { hasStarted, wallClockIn } from '@/features/booking/completed';
import { formatLongDate, formatMinute } from '@/features/booking/format';
import { type Locale } from '@/i18n/routing';
import { DISPLAY_TIME_ZONE } from '@/lib/format';

import { getAppointmentTarget, getClientTarget, getSettings } from './queries';
import {
  cancellationDedupeKey,
  confirmationDedupeKey,
  credentialsDedupeKey,
  manualDedupeKey,
  rescheduleDedupeKey,
  sendWhatsappMessage,
  sendWhatsappTemplate,
} from './send';
import { clampMessageBody, PATIENT_MESSAGE_LOCALE } from './templates';
import { type SendResult } from './types';

/**
 * What the rest of the app calls when something happened that a client should
 * hear about.
 *
 * This is the feature's public surface for other features: `booking` calls
 * {@link notifyAppointmentBooked}, {@link notifyAppointmentRescheduled} and
 * {@link notifyAppointmentCancelled}, and knows nothing about sessions, chat ids
 * or gateways. Everything here:
 *
 *  - **is gated on the clinic's own preference** (`confirmations_enabled`), so
 *    turning an automation off in Settings actually turns it off, rather than
 *    turning off only the copy that mentions it;
 *  - **never throws and never blocks anything important.** A clinic whose WhatsApp
 *    is unpaired still books appointments; the result is returned for logging and
 *    ignored by every current caller.
 *
 * Callers should schedule these with `after()` from `next/server` rather than
 * awaiting them inline: the reminder text is not worth adding a network round-trip
 * to the latency of saving an appointment.
 */

/**
 * Nothing is ever sent about a slot that has already started.
 *
 * **Why this lives here and not at the call sites.** It used to be one `if` in
 * `updateAppointmentAction`, which meant every *other* path could message a
 * patient about the past — and three did. Recording a visit after it happened
 * (staff may book any date, deliberately) texted "your appointment is
 * confirmed" for this morning; deleting a finished visit as records cleanup
 * texted "your appointment is cancelled"; and approving an appointment request
 * onto a past slot did the same, because that path was written later and never
 * knew about the check. A guard beside the send covers all of them, and covers
 * the next caller nobody has written yet.
 *
 * **The clinic's clock, not the server's.** An appointment is a clinic-local
 * wall-clock fact, so "has this gone?" is a question about `Asia/Hebron` — the
 * same reasoning as `isReminderDue` and the calendar's own completed state.
 *
 * **The start, not the end.** `hasStarted` is the coarser sibling of `hasEnded`
 * and the right one here: a patient already sitting in the slot has nothing left
 * to act on, so an appointment that is under way counts as past for messaging
 * even though it is not yet a completed record.
 *
 * The boundary is inclusive — an appointment starting at exactly this minute is
 * treated as gone, since a confirmation arriving as the patient walks in is not
 * news. Reminders use the same clock through their own `isReminderDue`, which is
 * inclusive the other way; the difference is one minute on a message whose whole
 * point is to arrive a day early.
 */
function isPast(slot: { date: string; startMinute: number }): boolean {
  return hasStarted(slot, wallClockIn(DISPLAY_TIME_ZONE));
}

/**
 * Confirms a newly booked (or rescheduled) appointment.
 *
 * Rescheduling sends a second message on purpose — the dedupe key carries the
 * date and start minute, so a moved appointment is a new fact the patient needs,
 * while re-saving the same slot changes nothing and sends nothing.
 */
export async function notifyAppointmentBooked(clinicId: string, appointmentId: string): Promise<SendResult> {
  const settings = await getSettings(clinicId);

  if (!settings?.confirmationsEnabled) return { status: 'skipped', reason: 'not_configured' };

  const target = await getAppointmentTarget(clinicId, appointmentId);

  // No appointment, or a client with no phone number. Both are ordinary.
  if (!target) return { status: 'skipped', reason: 'no_phone' };

  // Staff may record a visit on the day it happened, so a "confirmation" for an
  // hour that has gone is a real outcome of an ordinary action, not a bug.
  if (isPast(target)) return { status: 'skipped', reason: 'in_the_past' };

  return sendWhatsappTemplate(
    {
      kind: 'appointmentConfirmation',
      locale: PATIENT_MESSAGE_LOCALE,
      variables: {
        clientName: target.clientName,
        clinicName: target.clinicName,
        date: formatLongDate(PATIENT_MESSAGE_LOCALE, target.date),
        time: formatMinute(PATIENT_MESSAGE_LOCALE, target.date, target.startMinute),
      },
    },
    {
      clinicId,
      clientId: target.clientId,
      appointmentId: target.appointmentId,
      kind: 'appointment_confirmation',
      phone: target.phone,
      dedupeKey: confirmationDedupeKey(target.appointmentId, target.date, target.startMinute),
    },
    { settings },
  );
}

/**
 * Tells a client their appointment moved.
 *
 * Distinct from {@link notifyAppointmentBooked}, which a move used to reuse: "your
 * appointment is confirmed" arriving a second time reads as a duplicate, not as
 * news, and leaves the patient to work out for themselves which of the two
 * messages is current. This one names both slots and says plainly that it changed.
 *
 * `previous` comes from the row as it was read inside the update transaction —
 * the only place it still exists — so the caller passes it in rather than this
 * trying to reconstruct it.
 *
 * Gated on `confirmations_enabled`, like the confirmation: a clinic that has
 * turned appointment messages off has turned this off too.
 */
export async function notifyAppointmentRescheduled(
  clinicId: string,
  appointmentId: string,
  previous: { date: string; startMinute: number },
): Promise<SendResult> {
  const settings = await getSettings(clinicId);

  if (!settings?.confirmationsEnabled) return { status: 'skipped', reason: 'not_configured' };

  const target = await getAppointmentTarget(clinicId, appointmentId);

  if (!target) return { status: 'skipped', reason: 'no_phone' };

  /**
   * Judged on where the appointment has moved *to*, never on where it came
   * from. Moving a missed appointment into next week is exactly the news a
   * patient needs; it is only a move onto an hour that has already gone that
   * has nothing left to tell them.
   */
  if (isPast(target)) return { status: 'skipped', reason: 'in_the_past' };

  return sendWhatsappTemplate(
    {
      kind: 'appointmentRescheduled',
      locale: PATIENT_MESSAGE_LOCALE,
      variables: {
        clientName: target.clientName,
        clinicName: target.clinicName,
        date: formatLongDate(PATIENT_MESSAGE_LOCALE, target.date),
        time: formatMinute(PATIENT_MESSAGE_LOCALE, target.date, target.startMinute),
        previousDate: formatLongDate(PATIENT_MESSAGE_LOCALE, previous.date),
        previousTime: formatMinute(PATIENT_MESSAGE_LOCALE, previous.date, previous.startMinute),
      },
    },
    {
      clinicId,
      clientId: target.clientId,
      appointmentId: target.appointmentId,
      kind: 'appointment_rescheduled',
      phone: target.phone,
      dedupeKey: rescheduleDedupeKey(target.appointmentId, target.date, target.startMinute),
    },
    { settings },
  );
}

/**
 * Tells a client their appointment was cancelled.
 *
 * Takes the appointment's details rather than its id, because by the time this
 * runs the row has been deleted and there is nothing left to read. The client
 * still exists, so the name, phone and clinic name are looked up from there.
 *
 * For the same reason no `appointmentId` is recorded on the message:
 * `whatsapp_messages.appointment_id` is a foreign key, and it would point at a
 * row that is gone. The id lives in the dedupe key instead, which is plain text.
 *
 * **A deletion for a slot already past sends nothing.** This reverses an earlier
 * decision recorded here, which was that every deletion should notify because
 * suppressing one silently would be worse than an occasional odd message. The
 * odd message turned out to be the common one: deleting a finished visit is
 * usually records cleanup, and "your appointment on Tuesday at 09:00 is
 * cancelled" arriving on Thursday tells the patient something untrue about an
 * appointment they already attended. Cancelling anything still to come notifies
 * exactly as before, which is the case this message exists for.
 */
export async function notifyAppointmentCancelled(
  clinicId: string,
  cancelled: { appointmentId: string; clientId: string; date: string; startMinute: number },
): Promise<SendResult> {
  const settings = await getSettings(clinicId);

  if (!settings?.confirmationsEnabled) return { status: 'skipped', reason: 'not_configured' };

  // Read off the deleted row the caller passed in — there is no appointment left
  // to look up, which is the same reason the details arrive as an argument.
  if (isPast(cancelled)) return { status: 'skipped', reason: 'in_the_past' };

  const target = await getClientTarget(clinicId, cancelled.clientId);

  if (!target?.phone) return { status: 'skipped', reason: 'no_phone' };

  return sendWhatsappTemplate(
    {
      kind: 'appointmentCancelled',
      locale: PATIENT_MESSAGE_LOCALE,
      variables: {
        clientName: target.clientName,
        clinicName: target.clinicName,
        date: formatLongDate(PATIENT_MESSAGE_LOCALE, cancelled.date),
        time: formatMinute(PATIENT_MESSAGE_LOCALE, cancelled.date, cancelled.startMinute),
      },
    },
    {
      clinicId,
      clientId: target.clientId,
      kind: 'appointment_cancelled',
      phone: target.phone,
      dedupeKey: cancellationDedupeKey(cancelled.appointmentId),
    },
    { settings },
  );
}

/**
 * Sends a client their portal username and temporary password.
 *
 * **Explicitly triggered, never automatic.** A temporary password in a WhatsApp
 * thread is a real trade-off: it is readable by anyone holding the phone, and it
 * cannot be recalled. It is offered because the alternative for most of this
 * clinic's clients is worse — `clients.email` is nullable and frequently empty
 * (see the README's client-portal section), so the credentials otherwise exist
 * only on a screen the client is not standing in front of. The password must be
 * changed at first sign-in, which bounds how long the message is worth anything.
 *
 * `issuedAt` goes into the dedupe key so a re-issued password sends again, while a
 * double-clicked button does not.
 */
export async function notifyPortalCredentials(
  clinicId: string,
  clientId: string,
  credentials: { username: string; temporaryPassword: string; issuedAt: number },
): Promise<SendResult> {
  const target = await getClientTarget(clinicId, clientId);

  if (!target) return { status: 'skipped', reason: 'no_phone' };

  return sendWhatsappTemplate(
    {
      kind: 'portalCredentials',
      locale: PATIENT_MESSAGE_LOCALE,
      variables: {
        clientName: target.clientName,
        clinicName: target.clinicName,
        // Unused by this template, but the variable type is shared. Supplying
        // them keeps the renderer's "missing value" check meaningful.
        date: '-',
        time: '-',
        username: credentials.username,
        password: credentials.temporaryPassword,
        // The portal link keeps the client's own locale: they will be *reading a
        // screen* there, which is exactly what `preferred_locale` is for, and an
        // English-reading client should not land on an Arabic sign-in page.
        portalUrl: portalSignInUrl(target.preferredLocale),
      },
    },
    {
      clinicId,
      clientId,
      kind: 'portal_credentials',
      phone: target.phone,
      dedupeKey: credentialsDedupeKey(clientId, credentials.username, credentials.issuedAt),
    },
  );
}

/**
 * The client sign-in URL, in the client's own language.
 *
 * `NEXT_PUBLIC_APP_URL` is the browser-facing origin — deliberately not
 * `WHATSAPP_PUBLIC_URL`, which is how the *gateway* reaches this app and is
 * commonly `host.docker.internal`. A patient tapping that link would get nothing.
 */
function portalSignInUrl(locale: Locale): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000').replace(
    /\/+$/,
    '',
  );

  return `${base}/${locale}/client-login`;
}

/**
 * A message a dietitian typed. Sent as-is, with a random dedupe key — sending the
 * same words twice is a legitimate thing to want, so nothing here prevents it.
 */
export async function sendManualMessage(clinicId: string, clientId: string, body: string): Promise<SendResult> {
  const target = await getClientTarget(clinicId, clientId);

  if (!target) return { status: 'skipped', reason: 'no_phone' };

  return sendWhatsappMessage({
    clinicId,
    clientId,
    kind: 'manual',
    phone: target.phone,
    body: clampMessageBody(body),
    dedupeKey: manualDedupeKey(),
  });
}
