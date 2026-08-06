import {
  type WhatsappDirection,
  type WhatsappMessageKind,
  type WhatsappMessageStatus,
  type WhatsappStatus,
} from '@/db/schema';
import { type Locale } from '@/i18n/routing';

/** An appointment plus the client details a message about it needs. */
export type ReminderCandidate = {
  appointmentId: string;
  clientId: string;
  /** `YYYY-MM-DD`, clinic-local — appointments are wall-clock facts. */
  date: string;
  startMinute: number;
  clientName: string;
  phone: string;
  /** The client's own locale decides the message language, not the staff UI's. */
  preferredLocale: Locale;
};

/**
 * A course of appointments booked in one go, addressed to one client.
 *
 * The client and clinic details are on the series rather than on each slot,
 * because every appointment in it belongs to the same person at the same clinic
 * — that is what makes one message the right shape for it.
 */
export type AppointmentSeriesTarget = {
  clientId: string;
  clientName: string;
  phone: string;
  clinicName: string;
  /** In date order, which is the order the patient will read them in. */
  appointments: {
    appointmentId: string;
    date: string;
    startMinute: number;
    durationMinutes: number;
  }[];
};

/** Anyone a message can be addressed to. */
export type WhatsappTarget = {
  clientId: string;
  clientName: string;
  phone: string | null;
  preferredLocale: Locale;
  clinicName: string;
};

export type MessageLogEntry = {
  id: string;
  direction: WhatsappDirection;
  kind: WhatsappMessageKind;
  status: WhatsappMessageStatus;
  body: string;
  phone: string;
  error: string | null;
  createdAt: Date;
  clientId: string | null;
  clientName: string | null;
};

/**
 * Why a send did not happen.
 *
 * Every one of these is an ordinary outcome, not an exception: WhatsApp is a
 * best-effort channel bolted onto a clinic that worked without it, so nothing
 * upstream — booking an appointment, issuing portal credentials — may fail
 * because a message could not go out.
 */
export type SendSkipReason =
  /** `WHATSAPP_ENABLED` is not set, or the clinic never connected. */
  | 'not_configured'
  /** The gateway session exists but is not paired with a phone right now. */
  | 'not_connected'
  /** The client has no phone number, or it cannot be read as one. */
  | 'no_phone'
  /** The number is valid, but WhatsApp reports that it has no account. */
  | 'not_on_whatsapp'
  /** The body was empty once trimmed. Callers validate first, so this is a bug. */
  | 'empty_body'
  /** Already sent — the dedupe key was taken. This is the automation working. */
  | 'duplicate'
  /**
   * The appointment it is about has already started. Nothing is sent about a
   * slot in the past — see the guard at the top of `./notify.ts`.
   */
  | 'in_the_past';

export type SendResult =
  | { status: 'sent'; messageId: string; gatewayMessageId: string }
  | { status: 'skipped'; reason: SendSkipReason }
  /** The gateway refused or was unreachable. The row is stored as `failed`. */
  | { status: 'failed'; messageId: string | null; error: string };

/** What one reminder run did. Returned by the cron route and the CLI script. */
export type ReminderRunSummary = {
  clinics: number;
  sent: number;
  skipped: number;
  failed: number;
  /** Appointment ids that were reminded, for the log line. */
  appointmentIds: string[];
};

/** The settings page's whole view of the connection. */
export type ConnectionView = {
  /** `WHATSAPP_ENABLED` and the gateway credentials are set on this deployment. */
  enabled: boolean;
  /** This clinic has a gateway session. Pairing may still be in progress. */
  linked: boolean;
  status: WhatsappStatus;
  phone: string | null;
  lastError: string | null;
  syncedAt: Date | null;
  connectedAt: Date | null;
  remindersEnabled: boolean;
  confirmationsEnabled: boolean;
  /**
   * The stored lead time. Displayed nowhere as a choice — the settings page states
   * the rule instead — but carried here so a row holding a hand-set value is
   * visible to whatever wants to show it.
   */
  reminderLeadMinutes: number;
  /** A data URL, present only while the gateway is waiting to be paired. */
  qrCode: string | null;
  /** False when the gateway itself did not answer. */
  gatewayReachable: boolean;
};
