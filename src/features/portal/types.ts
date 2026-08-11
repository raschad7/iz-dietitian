import { type DayHours } from './clinic-hours';
import { type SelectableDay } from './slots';

/**
 * Plain data shapes shared with client components.
 *
 * This module imports from `./slots` and `./clinic-hours` and nothing else,
 * because both are pure. With
 * `verbatimModuleSyntax` on, `import { type X } from './queries'` in
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
  /** When the dietitian last acted on it — the notifications feed's "answered" timestamp. */
  updatedAt: Date;
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
  /** A servable path such as `/avatars/hiba.jpg`, or null — the usual case. */
  photoUrl: string | null;
  dateOfBirth: string | null;
  sex: string | null;
  heightCm: number | null;
  goal: string | null;
  activityLevel: string | null;
  allergies: string | null;
  conditions: string | null;
  medications: string | null;
  /** When the dietitian last touched the record — the profile screen's "last updated". */
  updatedAt: Date;
};

/**
 * The clinic, as the one place a client can reach it from.
 *
 * `phone` and `address` are nullable because a staff sign-up asks for neither,
 * so the contact section renders what exists and says plainly when it does not
 * — it never fabricates a number to keep a button alive.
 */
export type PortalClinic = {
  name: string;
  phone: string | null;
  address: string | null;
  /** Weekday numbers, 0 = Sunday … 6 = Saturday. */
  workingDays: readonly number[];
  /**
   * The week's **envelope** — the earliest open and the latest close across
   * every working day, not a range any single day necessarily keeps. Read
   * `schedule` when the question is "what time on this day?".
   */
  openMinute: number;
  closeMinute: number;
  /**
   * The real per-weekday hours, or `null` for a clinic whose
   * `clinic_working_hours` rows are missing or incomplete — older clinics
   * predate that table, and the envelope above is all they have.
   */
  schedule: readonly DayHours[] | null;
};

/** The dietitian this client is assigned to. Null when nobody has been assigned yet. */
export type PortalPractitioner = {
  name: string;
  specialty: string | null;
  /**
   * Their stored hex, for the initials `Avatar` on the profile screen —
   * genuinely per-record data rather than a token, which is the exemption
   * §Arbitrary colour grants a practitioner's colour. It is the one colour on
   * this screen that is about a person rather than about the brand.
   *
   * A hex and not a `.patient-tone` hue, because this is staff rather than a
   * patient — and because the ramp is defined for `.dark` only, which the
   * portal's two `[data-theme]` blocks never reach.
   */
  color: string;
};

/* ── Account settings: the part of the record the client owns ────────────── */

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const CONTACT_METHODS = ['whatsapp', 'phone', 'email'] as const;

export type ContactMethod = (typeof CONTACT_METHODS)[number];

/**
 * The four things the clinic may send. Named rather than a free-form record so
 * the settings screen can render the list and the action can validate a key
 * against the same source.
 */
export const NOTIFICATION_KINDS = [
  'appointmentReminder',
  'checkInReminder',
  'planUpdate',
  'clinicMessage',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type PortalSettings = {
  notifications: Record<NotificationKind, boolean>;
  theme: ThemePreference;
  preferredContact: ContactMethod;
};

/* ── Asking the clinic to change something ───────────────────────────────── */

export const CLIENT_REQUEST_KINDS = ['data_update', 'account_deletion'] as const;

export type ClientRequestKind = (typeof CLIENT_REQUEST_KINDS)[number];

export const CLIENT_REQUEST_TOPICS = ['basic', 'health', 'contact', 'other'] as const;

export type ClientRequestTopic = (typeof CLIENT_REQUEST_TOPICS)[number];

export const CLIENT_REQUEST_STATUSES = ['pending', 'resolved', 'declined', 'withdrawn'] as const;

export type ClientRequestStatus = (typeof CLIENT_REQUEST_STATUSES)[number];

/** One thing the client has asked the clinic to do about their record. */
export type ClientRequestSummary = {
  id: string;
  kind: ClientRequestKind;
  topic: ClientRequestTopic | null;
  createdAt: Date;
};

/**
 * Everything the profile screen renders from — produced by `loadProfilePage`.
 *
 * The three groups are separated here rather than flattened, because who owns
 * what is the screen's whole argument: `profile` and `health` are the
 * dietitian's record, `clinic` and `practitioner` are the clinic's, and the
 * only client-owned thing on that screen is the photo.
 */
export type ProfilePageData = {
  profile: PortalProfile;
  /** Null when the clinic row has gone — the section is omitted rather than blanked. */
  clinic: PortalClinic | null;
  practitioner: PortalPractitioner | null;
  /** A correction already waiting on the clinic, so the screen offers status instead of a second form. */
  openUpdateRequest: ClientRequestSummary | null;
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
  /** Asked for a date beyond the month the portal lets a client book within. */
  | 'errors.outsideWindow'
  | 'errors.alreadyRequested'
  | 'errors.pastAppointment'
  /** Tried to tick a meal on a day that is not today — see `toggleMealCompletion`. */
  | 'errors.dayLocked'
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

/**
 * The state the "ask the clinic to correct something" form reports back.
 *
 * No success member, for the same reason `RequestFormState` has none: a filed
 * request re-renders the section as the pending request itself, which is a
 * truer confirmation than a sentence — it shows the client the thing that now
 * exists, and offers them the way to take it back.
 */
export type ClientRequestFormState =
  | { status: 'idle' }
  | { status: 'error'; messageKey: PortalErrorKey };

export const initialClientRequestState: ClientRequestFormState = { status: 'idle' };

/**
 * Everything the request form renders from — produced by `loadRequestPage`.
 *
 * There is no list of start times here, and that is the shape of the rule: a
 * client asks for a day and the dietitian sets the hour. `SelectableDay` still
 * carries `openCount`, because whether a day has *any* room is what decides
 * which days can be chosen at all.
 */
export type RequestPageData = {
  kind: RequestKind;
  /** The appointment being moved or cancelled. Null for a brand-new request. */
  appointment: PortalAppointment | null;
  /** The date strip: today plus the rest of the request window. */
  days: SelectableDay[];
  /** The day currently chosen. */
  selectedDate: string;
  /**
   * The start minutes still open on {@link selectedDate}, in clock order.
   *
   * Only that day's. The whole month's times would be a payload that also told
   * every client when everybody else is booked, which is why choosing a day is
   * a navigation and this arrives with the answer.
   *
   * Empty is ordinary — a closed day, a full one, or one the client already has
   * an appointment on — and the form says so rather than offering nothing with
   * no explanation.
   */
  slots: number[];
  /**
   * The time the form opens on: the first open one, or null when the day has
   * none. Chosen on the server for the same reason `selectedDate` is — the
   * form should be submittable without a tap, and which times exist is the
   * clinic's answer, not the browser's.
   */
  selectedStartMinute: number | null;
};
