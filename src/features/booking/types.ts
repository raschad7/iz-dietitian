import { type BookingErrorKey, type ClinicHours } from './validation';

/**
 * Plain data shapes shared with client components.
 *
 * This module imports only from `./validation`, which is itself pure. That
 * matters: `verbatimModuleSyntax` is on, so `import { type X } from './queries'`
 * in a client component still emits a real `import {} from './queries'` — which
 * would drag `@/db` and the Postgres driver into the browser bundle. Types that
 * cross the server/client boundary live here instead. Same reasoning as
 * `src/features/clients/types.ts`.
 */

/** An appointment as the grid draws it: already joined, ready to render. */
export type CalendarAppointment = {
  id: string;
  /**
   * Still carried, because the overlap rule is keyed on it and the client-side
   * validator needs it — but never shown and never chosen. The clinic has one
   * practitioner and it is the account holder.
   */
  practitionerId: string;
  clientId: string;
  /** `YYYY-MM-DD`, clinic-local. */
  date: string;
  startMinute: number;
  durationMinutes: number;
  reason: string | null;
  clientName: string;
  /**
   * The client's position in their clinic, counted from 0 — what their colour
   * is derived from, here and on every other surface that draws them. See
   * `clientSeq` in `@/features/clients/seq` for why it is a position and not a
   * hash of the id, and `../patient-color` for what is built from it.
   *
   * It is the *only* colour input a client carries. `clients.color`, the stored
   * hex, was selected alongside it for a while and rendered nowhere — a second
   * answer to "what colour is this patient?" riding along in the payload.
   */
  clientSeq: number;
};

export type CalendarClient = {
  id: string;
  name: string;
  /** See `CalendarAppointment.clientSeq`. */
  seq: number;
};

/**
 * Every failure a booking action can report, as a message key under the
 * `booking` namespace.
 *
 * `BookingErrorKey` covers the five rules; these are the rest — the ones that
 * mean something went wrong rather than something was disallowed.
 */
export type ActionErrorKey =
  | BookingErrorKey
  | 'errors.unauthorized'
  | 'errors.invalid'
  | 'errors.notFound'
  | 'errors.completedLocked'
  | 'errors.unexpected';

/**
 * The result of every booking action.
 *
 * Discriminated, and carrying a key rather than an English sentence, so the
 * client renders the rejection in whichever language it is running in.
 * Business-rule failures are values, not exceptions: "that slot is taken" is an
 * expected answer, and throwing would turn it into a 500.
 */
export type ActionResult<TData = undefined> =
  | { ok: true; data: TData }
  | { ok: false; error: ActionErrorKey };

/**
 * A booking that was just written.
 *
 * `clientId` rides along because the caller does not always know it: the "new
 * client" path invents the person and the booking in one step, and the repeat
 * offer that follows has to book that same person again three more times.
 */
export type CreatedAppointment = { id: string; clientId: string };

/**
 * What a weekly repeat did.
 *
 * A repeat is best-effort by design — see `repeatWeekly` — so this reports both
 * halves: the appointments that were written and the weeks that were refused
 * because the clinic is shut, the hour is taken, or that client is already
 * booked that day. `ids` is what the notifications are sent for.
 */
export type WeeklyRepeatSummary = { ids: string[]; created: number; skipped: number };

/**
 * What an update reports back: where the appointment used to be.
 *
 * Only the WhatsApp notification uses it, and only to answer two questions the
 * request itself cannot — did the slot actually move, and what should the
 * patient be told it moved *from*.
 */
export type UpdatedAppointment = { previous: { date: string; startMinute: number } };

/**
 * What a delete reports back: enough to tell the client it is cancelled.
 *
 * Read out of the deleted row itself, because once the transaction commits there
 * is nothing left to join against.
 */
export type DeletedAppointment = { id: string; clientId: string; date: string; startMinute: number };

/** Everything one calendar page render needs. */
export type CalendarData = {
  appointments: CalendarAppointment[];
  clients: CalendarClient[];
  hours: ClinicHours;
};
