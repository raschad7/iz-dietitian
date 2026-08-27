import { type IsoDate } from '@/features/booking/date';

import { sendWebPush, type SendWebPushDeps } from './send';
import { type PushSendResult } from './types';

/**
 * What the rest of the app calls when something happened that a client should
 * be told about on their phone.
 *
 * This is the feature's public surface, and it is `whatsapp/notify.ts`'s twin:
 * `weekly-plans` calls {@link notifyPlanPublished}, `requests` calls
 * {@link notifyRequestAnswered}, and neither knows what a VAPID key or a
 * subscription endpoint is. Everything here:
 *
 *  - **is gated on the client's own consent** — `sendWebPush` checks the same
 *    four `client_settings` flags the notifications screen writes, so turning a
 *    switch off turns it off on this channel too;
 *  - **never throws and never blocks anything important.** A client with no
 *    device registered, a deployment with no keypair, and a push service having
 *    a bad afternoon all come back as a {@link PushSendResult} that the caller
 *    is free to ignore.
 *
 * **These are additions, not replacements.** The WhatsApp notices, the in-app
 * feed and these are three independent channels reporting the same events, and
 * each one's failure is invisible to the other two. Call sites schedule them
 * with `after()` from `next/server`, the same way the WhatsApp ones are
 * scheduled, so a notification never adds a round trip to the latency of the
 * write that caused it.
 *
 * ## The dedupe keys
 *
 * Every function below mints a deterministic one. They are the anchor for the
 * unique `(client_id, dedupe_key)` on `push_deliveries` — the thing that makes
 * a cron tick safe to run every five minutes — and they double as the device's
 * collapse tag, so a notification that is legitimately sent twice replaces
 * itself on the lock screen rather than stacking. A random key here would
 * defeat both.
 */

/** The reminder for one appointment on one date. Stable across ticks. */
export function reminderPushKey(appointmentId: string, date: IsoDate): string {
  return `reminder:${appointmentId}:${date}`;
}

/** One nudge per day, whatever the tick's spacing. */
export function checkInPushKey(date: IsoDate): string {
  return `checkin:${date}`;
}

/**
 * Keyed on the week rather than the plan, so **republishing the same week
 * notifies once** while next week's plan is fresh news.
 *
 * That is a deliberate difference from the WhatsApp confirmation keys, which
 * include the slot so that a change is a new message. A plan is edited and
 * republished repeatedly in a working morning — unpublish, swap a dish,
 * publish — and a client whose phone buzzed for each of those would learn to
 * ignore it.
 */
export function planPushKey(weekStartDate: IsoDate): string {
  return `plan:${weekStartDate}`;
}

/**
 * The "your appointment moved" notification, keyed on where it moved **to**.
 *
 * Deliberately the same key `rescheduleDedupeKey` uses in the WhatsApp feature,
 * and for the same reason: a booking dragged 09:00 → 10:00 → 11:00 tells the
 * client twice, which is right — each move is a different fact — while a retry
 * of the same move, or the same save arriving twice, tells them once.
 */
export function reschedulePushKey(appointmentId: string, date: IsoDate, startMinute: number): string {
  return `rescheduled:${appointmentId}:${date}:${startMinute}`;
}

/**
 * The cancellation, keyed on the appointment alone.
 *
 * Nothing else is needed: the row is gone by the time this is sent, so there is
 * no second cancellation of the same appointment to distinguish.
 */
export function cancelPushKey(appointmentId: string): string {
  return `cancelled:${appointmentId}`;
}

/** The answer to one request. The status is in the key: a decision is told once. */
export function requestPushKey(requestId: string, status: string): string {
  return `request:${requestId}:${status}`;
}

/**
 * The booking confirmation, keyed on the appointment alone — never on the
 * date. A move rekeys `reminderPushKey`'s own reminder onto the new date, but
 * this message is about the *booking itself*, so re-saving the same
 * appointment without moving it (see `updateAppointmentAction`'s `moved`
 * check) must not send a second "your appointment is booked".
 */
export function bookedPushKey(appointmentId: string): string {
  return `booked:${appointmentId}`;
}

/** An appointment is close enough to be worth a reminder. */
export function notifyAppointmentReminder(
  clientId: string,
  appointment: { id: string; date: IsoDate; startMinute: number },
  deps?: SendWebPushDeps,
): Promise<PushSendResult> {
  return sendWebPush(
    {
      clientId,
      dedupeKey: reminderPushKey(appointment.id, appointment.date),
      message: {
        kind: 'appointment_reminder',
        date: appointment.date,
        startMinute: appointment.startMinute,
      },
    },
    deps,
  );
}

/**
 * A new appointment was just booked for the client — sent immediately, from
 * the same action that wrote the row, rather than waiting for the day-before
 * reminder.
 *
 * **This is additional to `notifyAppointmentReminder`, never a replacement for
 * it.** The two run off different dedupe keys (`booked:*` here,
 * `reminder:*:*` there), so this send can never claim the reminder's row —
 * the client still gets the close-to-the-visit nudge on top of this
 * confirmation, exactly as if this function did not exist. Silent when the
 * booking is part of a repeat series; see `notifyBooked`'s own doc comment in
 * `booking/actions.ts` for why the create stays quiet there and the series
 * carries its own message instead.
 */
export function notifyAppointmentBooked(
  clientId: string,
  appointment: { id: string; date: IsoDate; startMinute: number },
  deps?: SendWebPushDeps,
): Promise<PushSendResult> {
  return sendWebPush(
    {
      clientId,
      dedupeKey: bookedPushKey(appointment.id),
      message: {
        kind: 'appointment_booked',
        date: appointment.date,
        startMinute: appointment.startMinute,
      },
    },
    deps,
  );
}

/** Today is nearly over and nothing has been logged. */
export function notifyCheckInReminder(
  clientId: string,
  date: IsoDate,
  deps?: SendWebPushDeps,
): Promise<PushSendResult> {
  return sendWebPush(
    { clientId, dedupeKey: checkInPushKey(date), message: { kind: 'check_in_reminder' } },
    deps,
  );
}

/** A plan covering this week has been published. */
export function notifyPlanPublished(
  clientId: string,
  weekStartDate: IsoDate,
  deps?: SendWebPushDeps,
): Promise<PushSendResult> {
  return sendWebPush(
    { clientId, dedupeKey: planPushKey(weekStartDate), message: { kind: 'plan_update' } },
    deps,
  );
}

/**
 * The dietitian answered an appointment request.
 *
 * Opens the notifications feed, which is where the answer is listed — the same
 * `clinicMessage` item `buildNotifications` derives from the very row this
 * answered. The two channels are reporting one event, and they agree about
 * where it is read.
 */
export function notifyRequestAnswered(
  clientId: string,
  requestId: string,
  status: 'approved' | 'declined',
  deps?: SendWebPushDeps,
): Promise<PushSendResult> {
  return sendWebPush(
    {
      clientId,
      dedupeKey: requestPushKey(requestId, status),
      message: { kind: 'clinic_message', outcome: status },
    },
    deps,
  );
}

/**
 * The dietitian answered a request about the client's own record — a
 * correction, or an account closure.
 *
 * Lands on the profile screen rather than the notifications feed, because that
 * is the screen which reads these rows and says what became of them; the feed
 * lists appointment requests only. Same consent flag and same kind: from the
 * client's side both are "the clinic replied to me".
 */
export function notifyRecordRequestAnswered(
  clientId: string,
  requestId: string,
  status: 'resolved' | 'declined',
  deps?: SendWebPushDeps,
): Promise<PushSendResult> {
  return sendWebPush(
    {
      clientId,
      dedupeKey: requestPushKey(requestId, status),
      message: { kind: 'clinic_message', outcome: status === 'declined' ? 'declined' : 'answered' },
      tail: 'profile',
    },
    deps,
  );
}

/**
 * The clinic moved this client's appointment.
 *
 * `date`/`startMinute` are where it is **now** — the client already knows where
 * it was, and a notification has room for one time, not two. The WhatsApp
 * message names both, which is the right trade there: it is a paragraph in a
 * thread the client can scroll back through, and this is a line on a lock
 * screen.
 *
 * Filed under the `clinic_message` switch rather than the reminder one — see
 * `MESSAGE_CONSENT` in `templates.ts` for why a schedule change is not a nudge.
 */
export function notifyAppointmentRescheduled(
  clientId: string,
  appointment: { id: string; date: IsoDate; startMinute: number },
  deps?: SendWebPushDeps,
): Promise<PushSendResult> {
  return sendWebPush(
    {
      clientId,
      dedupeKey: reschedulePushKey(appointment.id, appointment.date, appointment.startMinute),
      message: {
        kind: 'appointment_changed',
        change: 'moved',
        date: appointment.date,
        startMinute: appointment.startMinute,
      },
    },
    deps,
  );
}

/**
 * The clinic cancelled this client's appointment.
 *
 * Named with the slot it *was* in, because that is the one the client has in
 * their head and the only thing that identifies which visit is gone.
 *
 * ⚠ **The appointment row no longer exists when this is called**, which is why
 * every field arrives as an argument rather than being read back. The caller —
 * `deleteAppointmentAction` — holds the deleted row's details for exactly this
 * purpose, the same way it does for the WhatsApp notice beside it.
 */
export function notifyAppointmentCancelled(
  clientId: string,
  appointment: { id: string; date: IsoDate; startMinute: number },
  deps?: SendWebPushDeps,
): Promise<PushSendResult> {
  return sendWebPush(
    {
      clientId,
      dedupeKey: cancelPushKey(appointment.id),
      message: {
        kind: 'appointment_changed',
        change: 'cancelled',
        date: appointment.date,
        startMinute: appointment.startMinute,
      },
    },
    deps,
  );
}
