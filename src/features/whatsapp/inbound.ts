import { type WhatsappStatus } from '@/db/schema';

import { applyDeliveryStatus, applySessionStatus, recordInboundMessage, type DeliveryReceipt } from './mutations';
import { isGroupChatId, phoneFromChatId } from './phone';
import { findClientByPhone, findSettingsBySessionId } from './queries';
import { inboundMessageSchema, messageAckSchema, sessionStatusSchema, type WebhookEnvelope } from './schema';

/**
 * What this app does with an event from the gateway.
 *
 * Called only by `/api/whatsapp/webhook`, and only after the HMAC signature has
 * been verified — this module trusts that the body came from the gateway and
 * concerns itself solely with what it *means*.
 *
 * Three principles, all of them about not making things worse:
 *
 *  1. **An event for an unknown session is dropped, not an error.** The gateway
 *     may be shared with other applications, and most of its traffic is then none
 *     of this app's business. `session_id` → clinic is the whole tenant
 *     resolution; no match means no clinic, and nothing is written.
 *  2. **Redelivery is a no-op.** The gateway retries a delivery it could not
 *     confirm, so every write here is idempotent: inbound messages key on the
 *     gateway's own idempotency key, and delivery receipts only ever advance a
 *     status forwards.
 *  3. **An unrecognised event is success.** Answering non-2xx would make the
 *     gateway retry an event this app will never understand, five times, and then
 *     file it as a delivery failure. `handled: false` is reported to the route,
 *     which still answers 200.
 */

export type WebhookOutcome = {
  handled: boolean;
  /** Short machine-readable note, returned in the response body for debugging. */
  reason:
    | 'recorded'
    | 'status_updated'
    | 'ack_applied'
    | 'ignored_own_message'
    | 'ignored_group'
    | 'ignored_unusable_sender'
    | 'ignored_duplicate'
    | 'ignored_stale_ack'
    | 'unknown_session'
    | 'unknown_event'
    | 'malformed_payload';
};

/** The gateway's ack vocabulary → this app's stored statuses. */
const ACK_STATUS: Record<string, DeliveryReceipt | null> = {
  // `pending` means the client has not handed it to WhatsApp yet, which is what
  // `sent` already implies locally. Nothing to record.
  pending: null,
  sent: 'sent',
  delivered: 'delivered',
  read: 'read',
  failed: 'failed',
};

export async function handleWebhookEvent(envelope: WebhookEnvelope): Promise<WebhookOutcome> {
  const settings = await findSettingsBySessionId(envelope.sessionId);

  // Not our session. Note this is checked before anything is parsed: an event for
  // another application's session should cost one indexed lookup and no more.
  if (!settings) return { handled: false, reason: 'unknown_session' };

  switch (envelope.event) {
    case 'message.received':
      return handleInboundMessage(settings.clinicId, envelope);

    case 'message.ack':
    case 'message.failed':
      return handleAck(settings.clinicId, envelope);

    case 'session.status':
    case 'session.authenticated':
    case 'session.disconnected':
      return handleSessionEvent(envelope);

    // The gateway's "test this webhook" button. Reaching here proves the URL, the
    // secret and the session mapping are all correct, which is exactly what the
    // person pressing it wanted to know.
    case 'test':
      return { handled: true, reason: 'status_updated' };

    default:
      return { handled: false, reason: 'unknown_event' };
  }
}

async function handleInboundMessage(clinicId: string, envelope: WebhookEnvelope): Promise<WebhookOutcome> {
  const parsed = inboundMessageSchema.safeParse(envelope.data);
  if (!parsed.success) return { handled: false, reason: 'malformed_payload' };

  const message = parsed.data;

  // The clinic's own outgoing messages come back as events too (the gateway
  // echoes them so a dashboard can show them). They are already in the table,
  // written by the send path with the delivery state attached.
  if (message.fromMe) return { handled: true, reason: 'ignored_own_message' };

  if (message.isGroup || isGroupChatId(message.chatId)) return { handled: true, reason: 'ignored_group' };

  // A sender that is not a plain phone number — a privacy id, a broadcast, a
  // channel. Attributing one of those to a client by its leading digits would
  // file a stranger's message in a patient's record.
  const phone = phoneFromChatId(message.chatId);
  if (!phone) return { handled: true, reason: 'ignored_unusable_sender' };

  const clientId = await findClientByPhone(clinicId, phone);

  const recorded = await recordInboundMessage({
    clinicId,
    clientId,
    chatId: message.chatId,
    phone,
    body: message.body,
    // The gateway's key is stable across its retries; the message id is the
    // fallback for an older gateway that sends no key. Both are unique per
    // message, which is all the dedupe index needs.
    dedupeKey: `inbound:${envelope.idempotencyKey ?? message.id}`,
    gatewayMessageId: message.id,
  });

  return recorded
    ? { handled: true, reason: 'recorded' }
    : { handled: true, reason: 'ignored_duplicate' };
}

async function handleAck(clinicId: string, envelope: WebhookEnvelope): Promise<WebhookOutcome> {
  const parsed = messageAckSchema.safeParse(envelope.data);
  if (!parsed.success) return { handled: false, reason: 'malformed_payload' };

  const gatewayMessageId = parsed.data.messageId ?? parsed.data.id;
  if (!gatewayMessageId) return { handled: false, reason: 'malformed_payload' };

  const status = ACK_STATUS[parsed.data.status] ?? null;
  if (!status) return { handled: true, reason: 'ignored_stale_ack' };

  const advanced = await applyDeliveryStatus(
    clinicId,
    gatewayMessageId,
    status,
    status === 'failed' ? 'WhatsApp reported the message as failed.' : null,
  );

  // Zero rows is ordinary: a late `delivered` after a `read`, a duplicate
  // delivery, or an ack for a message sent from the phone itself.
  return advanced > 0 ? { handled: true, reason: 'ack_applied' } : { handled: true, reason: 'ignored_stale_ack' };
}

async function handleSessionEvent(envelope: WebhookEnvelope): Promise<WebhookOutcome> {
  const parsed = sessionStatusSchema.safeParse(envelope.data ?? {});

  const status = resolveSessionStatus(envelope.event, parsed.success ? parsed.data.status : undefined);
  if (!status) return { handled: false, reason: 'malformed_payload' };

  await applySessionStatus(envelope.sessionId, status, parsed.success ? parsed.data.phone : undefined);

  return { handled: true, reason: 'status_updated' };
}

/**
 * The status to store for a session event.
 *
 * `session.status` carries one explicitly. The two named events do not always, so
 * the event name itself is the fallback — and `session.authenticated` maps to
 * `authenticating`, not `ready`: the QR has been scanned, but the client is still
 * syncing and cannot send yet. `ready` arrives on its own a moment later, and
 * claiming it early would let a reminder run try to send through a session that
 * is not up.
 */
function resolveSessionStatus(event: string, reported: WhatsappStatus | undefined): WhatsappStatus | null {
  if (reported) return reported;

  if (event === 'session.authenticated') return 'authenticating';
  if (event === 'session.disconnected') return 'disconnected';

  return null;
}
