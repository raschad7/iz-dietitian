import { formatLongDate, formatMinute } from '@/features/booking/format';
import { type Locale } from '@/i18n/routing';

import { getAppointmentTarget, getClientTarget, getSettings } from './queries';
import { confirmationDedupeKey, credentialsDedupeKey, manualDedupeKey, sendWhatsappMessage, sendWhatsappTemplate } from './send';
import { clampMessageBody } from './templates';
import { type SendResult } from './types';

/**
 * What the rest of the app calls when something happened that a client should
 * hear about.
 *
 * This is the feature's public surface for other features: `booking` calls
 * {@link notifyAppointmentBooked} and knows nothing about sessions, chat ids or
 * gateways. Everything here:
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

  return sendWhatsappTemplate(
    {
      kind: 'appointmentConfirmation',
      locale: target.preferredLocale,
      variables: {
        clientName: target.clientName,
        clinicName: target.clinicName,
        date: formatLongDate(target.preferredLocale, target.date),
        time: formatMinute(target.preferredLocale, target.date, target.startMinute),
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
      locale: target.preferredLocale,
      variables: {
        clientName: target.clientName,
        clinicName: target.clinicName,
        // Unused by this template, but the variable type is shared. Supplying
        // them keeps the renderer's "missing value" check meaningful.
        date: '-',
        time: '-',
        username: credentials.username,
        password: credentials.temporaryPassword,
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
