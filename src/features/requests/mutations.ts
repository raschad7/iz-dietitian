import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { appointmentRequests, clientRequests } from '@/db/schema';
import {
  createAppointment,
  deleteAppointment,
  updateAppointment,
  type BookingContext,
} from '@/features/booking/mutations';
import { type ActionResult, type DeletedAppointment } from '@/features/booking/types';

import { getAppointmentRequest } from './queries';
import {
  type AnswerClientRequestInput,
  type ApproveAppointmentRequestInput,
  type DeclineAppointmentRequestInput,
} from './schema';
import { type RequestsResult, type StaffAppointmentRequest } from './types';

/**
 * Every write the staff requests inbox makes.
 *
 * Imports nothing from Next.js, so `bun test` can call these directly —
 * `actions.ts` is the thin layer that adds the Next concerns, exactly as in
 * `src/features/booking/mutations.ts` and `src/features/portal/mutations.ts`.
 *
 * ## Approving is a booking
 *
 * Nothing here reimplements a calendar rule. An approval calls the ordinary
 * booking mutation for its kind, which re-reads opening hours and the day's
 * appointments inside its own transaction and runs the same `validateBooking`
 * the day view runs. The schema header for `appointment_requests` prescribes
 * exactly this:
 *
 * > Approving one is a booking written through the ordinary path in
 * > `src/features/booking/`, where every rule is applied against the calendar as
 * > it stands at that moment — not as it stood when the client asked.
 *
 * So a request for a slot that was taken while it sat in the inbox is refused
 * with the calendar's own reason, and the `EXCLUDE USING gist` constraint is the
 * backstop for the race no read can see.
 *
 * ## Why the booking is written before the status
 *
 * The two cannot share a transaction: the booking mutations open their own, and
 * that is the point — they are the path the calendar itself uses, not a copy.
 *
 * That leaves a window where the appointment exists and the request is still
 * `pending`, and that is the direction this is meant to fail in. The dietitian
 * sees the item again and can dismiss it, while the client has the booking they
 * asked for. The reverse — a request marked answered with nothing on the
 * calendar behind it — would be a client told they are booked when they are
 * not.
 *
 * Booking first is also what makes a double-tap safe: the second write is
 * refused by `appointments_client_id_date_idx` or the overlap constraint, so
 * two approvals of one request cannot produce two appointments.
 */

/**
 * What an approval did, in the terms the notification needs.
 *
 * Discriminated by kind rather than flattened, because the three outcomes are
 * genuinely different news for the client: booked, moved, cancelled.
 */
export type ApprovedRequest =
  | { kind: 'new'; clientId: string; appointmentId: string }
  | {
      kind: 'reschedule';
      clientId: string;
      appointmentId: string;
      previous: { date: string; startMinute: number };
      /** False when the dietitian approved a reschedule onto the same slot. */
      moved: boolean;
    }
  | { kind: 'cancel'; clientId: string; appointment: DeletedAppointment };

/**
 * Books what the client asked for — at whatever time the dietitian settled on —
 * and marks the request answered.
 *
 * The request is read scoped to the caller's clinic, so an id from another
 * tenant matches no row. The kind is taken from that row and never from the
 * payload: a browser able to name the kind could present a cancellation and
 * have a booking written.
 */
export async function approveAppointmentRequest(
  context: BookingContext,
  input: ApproveAppointmentRequestInput,
): Promise<RequestsResult<ApprovedRequest>> {
  const request = await getAppointmentRequest(context.clinicId, input.requestId);

  if (!request) return { ok: false, error: 'errors.notFound' };

  // Withdrawn, or already answered by someone else since the page rendered.
  if (request.status !== 'pending') return { ok: false, error: 'errors.alreadyAnswered' };

  const booked = await writeApproval(context, request, input);

  if (!booked.ok) return booked;

  /**
   * Approving a cancellation updates nothing here, and that is correct rather
   * than a missed case: `appointment_requests.appointment_id` is `on delete
   * cascade`, so deleting the appointment took this row with it. The schema
   * says why — "a request to move an appointment that no longer exists is not a
   * record worth keeping". {@link markAnswered} reports the miss and the
   * approval still succeeds, because the calendar is what the client asked
   * about and the calendar is correct.
   */
  await markAnswered(context.clinicId, request.id, 'approved');

  return booked;
}

/**
 * The calendar half of an approval — one booking mutation per kind.
 *
 * Split out so {@link approveAppointmentRequest} reads as the three steps it is
 * (check, book, mark) rather than as a switch with a status update hanging off
 * the end of every branch.
 */
async function writeApproval(
  context: BookingContext,
  request: StaffAppointmentRequest,
  input: ApproveAppointmentRequestInput,
): Promise<RequestsResult<ApprovedRequest>> {
  if (request.kind === 'cancel') {
    // A cancellation names an appointment and proposes no time; the check
    // constraints guarantee the first half, so a missing row here means it was
    // deleted while the request sat in the inbox.
    if (!request.appointment) return { ok: false, error: 'errors.notFound' };

    const result = await deleteAppointment(context.clinicId, request.appointment.id);

    if (!result.ok) return bookingFailure(result);

    return { ok: true, data: { kind: 'cancel', clientId: request.clientId, appointment: result.data } };
  }

  /**
   * The other two kinds write a slot, so all three parts of one must be
   * present. The dialog always sends them, pre-filled from the request; this is
   * the guard for a payload that did not come from the dialog.
   */
  const { date, startMinute, durationMinutes } = input;

  if (date === undefined || startMinute === undefined || durationMinutes === undefined) {
    return { ok: false, error: 'errors.invalid' };
  }

  const booking = {
    clientId: request.clientId,
    date,
    startMinute,
    durationMinutes,
    reason: input.reason,
  };

  if (request.kind === 'new') {
    const result = await createAppointment(context, booking);

    if (!result.ok) return bookingFailure(result);

    return { ok: true, data: { kind: 'new', clientId: request.clientId, appointmentId: result.data.id } };
  }

  // Reschedule. As above, the constraint guarantees the appointment id is set;
  // its absence means the row went while the request waited.
  if (!request.appointment) return { ok: false, error: 'errors.notFound' };

  const appointmentId = request.appointment.id;
  const result = await updateAppointment(context, { ...booking, id: appointmentId });

  if (!result.ok) return bookingFailure(result);

  const { previous } = result.data;

  return {
    ok: true,
    data: {
      kind: 'reschedule',
      clientId: request.clientId,
      appointmentId,
      previous,
      moved: previous.date !== date || previous.startMinute !== startMinute,
    },
  };
}

/**
 * Passes a booking rejection through with its own namespace attached.
 *
 * The key is not translated or remapped here: "that slot is taken" is already
 * written in both languages under `booking`, and a second copy under `requests`
 * would be free to drift from the first.
 */
function bookingFailure(result: Extract<ActionResult<never>, { ok: false }>): RequestsResult<never> {
  return { ok: false, error: result.error, namespace: 'booking' };
}

/**
 * Turns a request down without touching the calendar.
 *
 * Scoped by clinic and by status in the `WHERE`, so declining another clinic's
 * request — or one already answered — updates no rows rather than being caught
 * after the fact. Same shape as `withdrawRequest` in the portal's mutations.
 */
export async function declineAppointmentRequest(
  clinicId: string,
  input: DeclineAppointmentRequestInput,
): Promise<RequestsResult> {
  const answered = await markAnswered(clinicId, input.requestId, 'declined');

  return answered ? { ok: true, data: undefined } : { ok: false, error: 'errors.alreadyAnswered' };
}

/** Flips one pending request to its answered status. Returns whether it was still pending. */
async function markAnswered(
  clinicId: string,
  requestId: string,
  status: 'approved' | 'declined',
): Promise<boolean> {
  try {
    const updated = await db
      .update(appointmentRequests)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(appointmentRequests.id, requestId),
          eq(appointmentRequests.clinicId, clinicId),
          eq(appointmentRequests.status, 'pending'),
        ),
      )
      .returning({ id: appointmentRequests.id });

    return updated.length > 0;
  } catch (error) {
    // Only reached if the database itself is unhappy. An approval has already
    // written the calendar by this point, so this is logged rather than thrown:
    // the booking is real, and the item simply stays in the inbox.
    console.error('[requests] marking a request answered failed', error);
    return false;
  }
}

/**
 * Answers a request about the client's own record.
 *
 * Nothing about the record is written here, and that is the design rather than
 * an omission — see the header of `src/db/schema/client-requests.ts`. Resolving
 * means a person at the clinic has done whatever was asked; the row is the
 * message, and this closes it.
 *
 * An `account_deletion` is closed the same way and deletes nothing. Ending
 * someone's care is a deliberate act taken from their record, with the archive
 * and delete controls that already exist there.
 */
export async function answerClientRequest(
  clinicId: string,
  input: AnswerClientRequestInput,
): Promise<RequestsResult> {
  try {
    const updated = await db
      .update(clientRequests)
      .set({ status: input.status, updatedAt: new Date() })
      .where(
        and(
          eq(clientRequests.id, input.requestId),
          eq(clientRequests.clinicId, clinicId),
          eq(clientRequests.status, 'pending'),
        ),
      )
      .returning({ id: clientRequests.id });

    return updated.length > 0
      ? { ok: true, data: undefined }
      : { ok: false, error: 'errors.alreadyAnswered' };
  } catch (error) {
    console.error('[requests] answering a client request failed', error);
    return { ok: false, error: 'errors.unexpected' };
  }
}
