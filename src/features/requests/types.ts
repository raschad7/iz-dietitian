import { type ActionErrorKey } from '@/features/booking/types';
import { type ClinicHours } from '@/features/booking/validation';
import {
  type ClientRequestKind,
  type ClientRequestStatus,
  type ClientRequestTopic,
  type RequestKind,
  type RequestStatus,
} from '@/features/portal/types';

/**
 * Plain data shapes for the staff-side requests inbox.
 *
 * Imports only from `@/features/portal/types`, which is itself free of anything
 * that would reach the database — the inbox's cards are client components, and
 * under `verbatimModuleSyntax` a `import { type X } from './queries'` still
 * emits a real import, which would drag the Postgres driver into the browser
 * bundle. Same reasoning as `src/features/booking/types.ts`.
 *
 * The two request tables keep their own shapes rather than being flattened into
 * one union. They are answered differently — one writes the calendar, the other
 * is a message a person reads — and a single type with half its fields null
 * would hide exactly that difference from the components rendering them.
 */

export type { ClientRequestKind, ClientRequestStatus, ClientRequestTopic, RequestKind, RequestStatus };

/**
 * One appointment request, as the inbox shows it.
 *
 * `appointment` is the row the request is *about* — present for a reschedule or
 * a cancellation, null for a new booking. It carries the current time, so a card
 * can say "10:00 → 14:30" without a second read.
 */
export type StaffAppointmentRequest = {
  id: string;
  clientId: string;
  clientName: string;
  kind: RequestKind;
  status: RequestStatus;
  /** What the client asked for. Null for a cancellation, which proposes no time. */
  preferredDate: string | null;
  preferredStartMinute: number | null;
  /** The client's own words. */
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** The appointment being moved or cancelled, as it stands now. */
  appointment: {
    id: string;
    date: string;
    startMinute: number;
    durationMinutes: number;
  } | null;
};

/** One request about the client's own record. */
export type StaffClientRequest = {
  id: string;
  clientId: string;
  clientName: string;
  kind: ClientRequestKind;
  topic: ClientRequestTopic | null;
  message: string | null;
  status: ClientRequestStatus;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Every failure the inbox can report, as a message key under the `requests`
 * namespace — except the booking rules, which arrive from the booking feature
 * already keyed under `booking` and are rendered from there.
 *
 * Keys rather than sentences, so a rejection reads correctly in both languages.
 * Same contract as `src/features/booking/types.ts` and `src/features/portal/types.ts`.
 */
export type RequestsErrorKey =
  | 'errors.invalid'
  | 'errors.notFound'
  | 'errors.alreadyAnswered'
  | 'errors.unexpected';

/**
 * What an approval reports back.
 *
 * A booking rejection is passed through under its own namespace rather than
 * being flattened into {@link RequestsErrorKey}: "that slot is taken" is the
 * calendar's sentence, already written in both languages, and restating it here
 * would be a second copy free to drift from the first.
 */
export type RequestsResult<TData = undefined> =
  | { ok: true; data: TData }
  | { ok: false; error: RequestsErrorKey; namespace?: undefined }
  | { ok: false; error: ActionErrorKey; namespace: 'booking' };

/**
 * What is waiting, and what the approve dialog needs to offer a time.
 *
 * `hours` is null when the clinic has not finished its schedule — the same
 * "fewer than seven weekdays on file" case `getClinicHours` reports everywhere.
 * The dialog falls back to offering the whole day rather than nothing, and the
 * server refuses a closed hour with its own message; a picker with no options
 * would be a worse answer than one whose choice can be turned down.
 */
export type PendingRequests = {
  /** Oldest first — an inbox is worked from the top. */
  appointments: StaffAppointmentRequest[];
  clientRequests: StaffClientRequest[];
  /** Clinic-local `YYYY-MM-DD`, for defaulting the approve dialog's date. */
  today: string;
  hours: ClinicHours | null;
};

/** Everything one render of the inbox page needs. */
export type RequestsData = PendingRequests & {
  /** Answered items, newest first, so the page can show what was done. */
  answered: StaffAppointmentRequest[];
};
