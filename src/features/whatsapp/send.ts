import { randomUUID } from 'node:crypto';

import { type WhatsappMessageKind, type WhatsappSettings } from '@/db/schema';
import { type Locale } from '@/i18n/routing';

import { getWhatsappConfig } from './config';
import { createHttpGateway, GatewayError, type WhatsappGateway } from './gateway';
import { claimOutboundMessage, markMessageFailed, markMessageSent, saveSessionLink } from './mutations';
import { toChatIdFromPhone } from './phone';
import { getSettings } from './queries';
import { clampMessageBody, renderWhatsappMessage, type WhatsappTemplateKind, type WhatsappTemplateVariables } from './templates';
import { type SendResult } from './types';

/**
 * The single funnel every outgoing WhatsApp message passes through.
 *
 * One function, so the four rules that make this safe are written once:
 *
 *  1. **It never throws.** WhatsApp is an unofficial, best-effort channel bolted
 *     onto a clinic that worked fine without it. Booking an appointment must not
 *     fail because a reminder could not be sent, so every failure comes back as a
 *     `SendResult` and the caller decides whether it cares.
 *  2. **The row is written before the network call.** `claimOutboundMessage`
 *     inserts against a unique `(clinic_id, dedupe_key)`, so a repeated
 *     automation loses the insert and returns without sending. WhatsApp has no
 *     unsend; this is the only place that guarantee can live.
 *  3. **It checks the connection first.** Sending into a session that is not
 *     paired produces a gateway error per message; one status read prevents a
 *     whole reminder run of them.
 *  4. **The gateway is injectable.** `bun test` passes a fake and asserts on what
 *     would have been sent, exactly as `src/lib/mail/` does with its transports.
 */

export type SendRequest = {
  clinicId: string;
  clientId?: string | null;
  appointmentId?: string | null;
  kind: WhatsappMessageKind;
  /** As stored on the client — anything a human might have typed. */
  phone: string | null | undefined;
  body: string;
  /**
   * The idempotency anchor. Deterministic for an automation
   * (`reminder:<appointmentId>:<date>`), random for a manual send, where
   * repeating the same text is a legitimate thing to want.
   */
  dedupeKey: string;
};

export type SendDeps = {
  gateway?: WhatsappGateway;
  /** Saves a settings read when the caller already has the row (reminder runs). */
  settings?: WhatsappSettings | null;
};

export async function sendWhatsappMessage(request: SendRequest, deps: SendDeps = {}): Promise<SendResult> {
  const config = getWhatsappConfig();
  if (!config) return { status: 'skipped', reason: 'not_configured' };

  const settings = deps.settings ?? (await getSettings(request.clinicId));
  if (!settings?.sessionId) return { status: 'skipped', reason: 'not_configured' };
  if (settings.status !== 'ready') return { status: 'skipped', reason: 'not_connected' };

  const target = toChatIdFromPhone(request.phone, config.defaultCountryCode);
  if (!target) return { status: 'skipped', reason: 'no_phone' };

  const body = clampMessageBody(request.body);
  if (!body) return { status: 'skipped', reason: 'empty_body' };

  const gateway = deps.gateway ?? createHttpGateway(config);

  // OpenWA can accept an E.164-looking number that WhatsApp does not own, then
  // spend the whole send timeout trying to resolve its LID. Check first so an
  // invalid client record is an immediate, explainable skip and never consumes
  // the dedupe key for an automation.
  try {
    const registered = await gateway.checkNumber(settings.sessionId, target.phone);
    if (!registered) return { status: 'skipped', reason: 'not_on_whatsapp' };
  } catch (error) {
    const description = describeSendFailure(error);

    await saveSessionLink(request.clinicId, {
      lastError: description,
      ...(error instanceof GatewayError && error.status === 404 ? { status: 'disconnected' as const } : {}),
    }).catch(() => undefined);

    console.error('[whatsapp] recipient check failed', {
      clinicId: request.clinicId,
      kind: request.kind,
      error: description,
    });

    return { status: 'failed', messageId: null, error: description };
  }

  const claimed = await claimOutboundMessage({
    clinicId: request.clinicId,
    clientId: request.clientId ?? null,
    appointmentId: request.appointmentId ?? null,
    kind: request.kind,
    chatId: target.chatId,
    phone: target.phone,
    body,
    dedupeKey: request.dedupeKey,
  });

  // Someone — another cron tick, another instance — already claimed this exact
  // message. That is the dedupe index doing its job, not a failure.
  if (!claimed) return { status: 'skipped', reason: 'duplicate' };

  try {
    const sent = await gateway.sendText(settings.sessionId, target.chatId, body);

    await markMessageSent(claimed.id, sent.messageId);

    return { status: 'sent', messageId: claimed.id, gatewayMessageId: sent.messageId };
  } catch (error) {
    const description = describeSendFailure(error);

    await markMessageFailed(claimed.id, description);

    // Surface the breakage on the settings page instead of only in the log, and
    // stop pretending the session is live when the gateway says it is not: a 404
    // means the session was deleted there, and every later send in this run would
    // fail the same way.
    await saveSessionLink(request.clinicId, {
      lastError: description,
      ...(error instanceof GatewayError && error.status === 404 ? { status: 'disconnected' as const } : {}),
    }).catch(() => undefined);

    console.error('[whatsapp] send failed', { clinicId: request.clinicId, kind: request.kind, error: description });

    return { status: 'failed', messageId: claimed.id, error: description };
  }
}

/** Renders a template in the recipient's locale and sends it. */
export async function sendWhatsappTemplate(
  template: { kind: WhatsappTemplateKind; locale: Locale; variables: WhatsappTemplateVariables },
  request: Omit<SendRequest, 'body' | 'kind'> & { kind: WhatsappMessageKind },
  deps: SendDeps = {},
): Promise<SendResult> {
  let body: string;

  try {
    body = renderWhatsappMessage(template.kind, template.locale, template.variables);
  } catch (error) {
    // A template with a missing variable is a programming error, but it must not
    // take down the booking that triggered it.
    const description = error instanceof Error ? error.message : String(error);
    console.error('[whatsapp] template render failed', description);

    return { status: 'failed', messageId: null, error: description };
  }

  return sendWhatsappMessage({ ...request, body }, deps);
}

/**
 * A human-readable failure, short enough for the `error` column and safe to show
 * staff.
 *
 * `GatewayError.detail` is the gateway's own words ("Session is not connected"),
 * which is far more actionable than the HTTP status alone.
 */
function describeSendFailure(error: unknown): string {
  if (error instanceof GatewayError) {
    return error.detail ? `${error.message} ${error.detail}` : error.message;
  }

  return error instanceof Error ? error.message : String(error);
}

/**
 * The dedupe key for a message that is *meant* to be repeatable — a dietitian
 * typing the same "please bring your blood test" to the same client twice.
 */
export function manualDedupeKey(): string {
  return `manual:${randomUUID()}`;
}

/** The reminder for one appointment on one date. Stable across cron ticks. */
export function reminderDedupeKey(appointmentId: string, date: string): string {
  return `reminder:${appointmentId}:${date}`;
}

/**
 * The confirmation for a newly booked appointment.
 *
 * Includes the date and start minute, so **rescheduling sends a fresh
 * confirmation** while re-saving the same slot does not.
 */
export function confirmationDedupeKey(appointmentId: string, date: string, startMinute: number): string {
  return `confirmation:${appointmentId}:${date}:${startMinute}`;
}

/**
 * The "your appointment moved" message, keyed on where it moved *to*.
 *
 * So a booking dragged 09:00 → 10:00 → 11:00 tells the patient twice, which is
 * right — each move is a different fact — while a retry of the same move, or the
 * same save arriving twice, sends once.
 */
export function rescheduleDedupeKey(appointmentId: string, date: string, startMinute: number): string {
  return `rescheduled:${appointmentId}:${date}:${startMinute}`;
}

/**
 * The cancellation, keyed on the appointment alone.
 *
 * Nothing else is needed: the row is gone by the time this is sent, so there is
 * no second cancellation of the same appointment to distinguish. Note the
 * message itself stores no `appointmentId` — that column is a foreign key, and
 * the appointment it would point at no longer exists.
 */
export function cancellationDedupeKey(appointmentId: string): string {
  return `cancelled:${appointmentId}`;
}

/** Portal credentials, keyed so a re-issued password sends a new message. */
export function credentialsDedupeKey(clientId: string, username: string, issuedAt: number): string {
  return `credentials:${clientId}:${username}:${issuedAt}`;
}
