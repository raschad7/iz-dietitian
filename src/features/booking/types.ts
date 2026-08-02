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
   * Colour-codes the block. The client's own colour, so a block and that
   * person's avatar in the picker are recognisably the same person.
   */
  clientColor: string;
};

export type CalendarClient = {
  id: string;
  name: string;
  color: string;
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

export type CreatedAppointment = { id: string };

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
