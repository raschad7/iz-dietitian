import { type SelectableDay } from './slots';

/**
 * Plain data shapes shared with client components.
 *
 * This module imports from `./slots` and nothing else, because `./slots` is
 * pure. With `verbatimModuleSyntax` on, `import { type X } from './queries'` in
 * a client component still emits a real `import {} from './queries'`, which
 * would drag `@/db` and the Postgres driver into the browser bundle — a build
 * error, and the reason `RequestPageData` lives here rather than beside the
 * reads that produce it. Same reasoning as `src/features/booking/types.ts`.
 */

export const REQUEST_KINDS = ['new', 'reschedule', 'cancel'] as const;

export type RequestKind = (typeof REQUEST_KINDS)[number];

export const REQUEST_STATUSES = ['pending', 'approved', 'declined', 'withdrawn'] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** One of the client's own appointments, as the portal lists it. */
export type PortalAppointment = {
  id: string;
  /** `YYYY-MM-DD`, clinic-local. */
  date: string;
  startMinute: number;
  durationMinutes: number;
  reason: string | null;
  /** True once a request about this appointment is waiting on the dietitian. */
  hasOpenRequest: boolean;
};

/** Something the client has asked for, in whatever state it is in. */
export type PortalRequest = {
  id: string;
  kind: RequestKind;
  status: RequestStatus;
  /** Null for a cancellation, which proposes no time. */
  preferredDate: string | null;
  preferredStartMinute: number | null;
  note: string | null;
  createdAt: Date;
  /** The appointment it concerns, for a reschedule or a cancellation. */
  appointment: { date: string; startMinute: number } | null;
};

/** The client's own record, minus everything that is the dietitian's private working notes. */
export type PortalProfile = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  preferredLocale: string;
  dateOfBirth: string | null;
  sex: string | null;
  heightCm: number | null;
  goal: string | null;
  activityLevel: string | null;
  allergies: string | null;
};

/**
 * Every failure a portal action can report, as a message key under the `portal`
 * namespace. A key rather than a sentence, so the rejection reads correctly in
 * both languages — the same contract as `src/features/booking/types.ts`.
 */
export type PortalErrorKey =
  | 'errors.invalid'
  | 'errors.notFound'
  | 'errors.slotUnavailable'
  | 'errors.alreadyRequested'
  | 'errors.pastAppointment'
  | 'errors.unexpected';

export type PortalResult<TData = undefined> =
  | { ok: true; data: TData }
  | { ok: false; error: PortalErrorKey };

/**
 * The state a request form reports back. `messageKey` is under `portal`.
 *
 * There is no success member: a filed request redirects to the appointments
 * page, where it is listed as pending. That listing is the confirmation, and it
 * is a truer one than a message — it shows the client the thing that now exists.
 */
export type RequestFormState = { status: 'idle' } | { status: 'error'; messageKey: PortalErrorKey };

export const initialRequestState: RequestFormState = { status: 'idle' };

/** Everything the request form renders from — produced by `loadRequestPage`. */
export type RequestPageData = {
  kind: RequestKind;
  /** The appointment being moved or cancelled. Null for a brand-new request. */
  appointment: PortalAppointment | null;
  /** The date strip: today plus the rest of the request window. */
  days: SelectableDay[];
  /** The day currently chosen. */
  selectedDate: string;
  /** Start minutes still open on `selectedDate`. */
  slots: number[];
};
