import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { clients, whatsappMessages } from '@/db/schema';

import {
  createTestClient,
  createTestClinic,
  createTestWhatsappSettings,
  readWhatsappSettings,
  resetDatabase,
} from '../../../tests/helpers';
import { handleWebhookEvent } from './inbound';
import { claimOutboundMessage, markMessageSent } from './mutations';
import { listRecentMessages } from './queries';
import { webhookEnvelopeSchema, type WebhookEnvelope } from './schema';

/**
 * What the webhook handler does with a *signed* delivery. The signature itself is
 * `signature.test.ts`'s job; everything here assumes the body is genuine and asks
 * whether the handler draws the right conclusions from it.
 *
 * The two properties under test throughout: an event for a session this app does
 * not own writes nothing, and a redelivered event writes nothing twice.
 */

let clinicId: string;
let clientId: string;
let sessionId: string;

beforeEach(async () => {
  await resetDatabase();

  clinicId = await createTestClinic();
  clientId = await createTestClient(clinicId, 'أحمد خليل');

  await db.update(clients).set({ phone: '0599123456' }).where(eq(clients.id, clientId));

  const settings = await createTestWhatsappSettings(clinicId);
  sessionId = settings.sessionId ?? '';
});

function envelope(event: string, data: unknown, overrides: Partial<WebhookEnvelope> = {}): WebhookEnvelope {
  return webhookEnvelopeSchema.parse({ event, sessionId, data, ...overrides });
}

describe('unknown sessions', () => {
  test('an event for another application\'s session writes nothing', async () => {
    // The gateway may be shared. Most of its traffic is then none of our business,
    // and answering "not handled" is the correct outcome, not an error.
    const outcome = await handleWebhookEvent(
      envelope('message.received', { id: 'x', chatId: '970599123456@c.us', body: 'hi' }, { sessionId: 'someone-else' }),
    );

    expect(outcome).toEqual({ handled: false, reason: 'unknown_session' });
    expect(await db.select().from(whatsappMessages)).toHaveLength(0);
  });
});

describe('message.received', () => {
  const inbound = (overrides: Record<string, unknown> = {}) => ({
    id: 'wamid-inbound-1',
    chatId: '970599123456@c.us',
    body: 'شكراً، سأحضر',
    type: 'chat',
    fromMe: false,
    isGroup: false,
    ...overrides,
  });

  test('files a reply against the client who owns the number', async () => {
    const outcome = await handleWebhookEvent(envelope('message.received', inbound(), { idempotencyKey: 'key-1' }));

    expect(outcome).toEqual({ handled: true, reason: 'recorded' });

    const [row] = await listRecentMessages(clinicId);
    expect(row?.direction).toBe('inbound');
    expect(row?.status).toBe('received');
    expect(row?.body).toBe('شكراً، سأحضر');
    expect(row?.clientId).toBe(clientId);
  });

  test('matches a client stored with a local number against an international sender', async () => {
    // The roster says 0599123456; WhatsApp says 970599123456. Same person.
    await handleWebhookEvent(envelope('message.received', inbound(), { idempotencyKey: 'key-2' }));

    expect((await listRecentMessages(clinicId))[0]?.clientId).toBe(clientId);
  });

  test('still records a message from a number no client owns', async () => {
    const outcome = await handleWebhookEvent(
      envelope('message.received', inbound({ chatId: '970591111111@c.us' }), { idempotencyKey: 'key-3' }),
    );

    expect(outcome.reason).toBe('recorded');

    const [row] = await listRecentMessages(clinicId);
    // Unattributed rather than dropped: somebody messaged the clinic, and staff
    // should be able to see that even if the number is not on file.
    expect(row?.clientId).toBeNull();
    expect(row?.phone).toBe('970591111111');
  });

  test('a redelivered event does not double the thread', async () => {
    await handleWebhookEvent(envelope('message.received', inbound(), { idempotencyKey: 'key-4' }));
    const second = await handleWebhookEvent(envelope('message.received', inbound(), { idempotencyKey: 'key-4' }));

    expect(second).toEqual({ handled: true, reason: 'ignored_duplicate' });
    expect(await db.select().from(whatsappMessages)).toHaveLength(1);
  });

  test('falls back to the message id when the gateway sent no idempotency key', async () => {
    await handleWebhookEvent(envelope('message.received', inbound()));
    await handleWebhookEvent(envelope('message.received', inbound()));

    expect(await db.select().from(whatsappMessages)).toHaveLength(1);
  });

  test('ignores the clinic\'s own outgoing messages echoed back', async () => {
    const outcome = await handleWebhookEvent(envelope('message.received', inbound({ fromMe: true })));

    expect(outcome).toEqual({ handled: true, reason: 'ignored_own_message' });
    expect(await db.select().from(whatsappMessages)).toHaveLength(0);
  });

  test('ignores groups', async () => {
    const outcome = await handleWebhookEvent(
      envelope('message.received', inbound({ chatId: '123-456@g.us', isGroup: true })),
    );

    expect(outcome).toEqual({ handled: true, reason: 'ignored_group' });
    expect(await db.select().from(whatsappMessages)).toHaveLength(0);
  });

  test('ignores a sender that is not a phone number', async () => {
    const outcome = await handleWebhookEvent(envelope('message.received', inbound({ chatId: '182736451928@lid' })));

    expect(outcome).toEqual({ handled: true, reason: 'ignored_unusable_sender' });
  });

  test('reports a payload it cannot read instead of guessing', async () => {
    const outcome = await handleWebhookEvent(envelope('message.received', { nothing: 'useful' }));

    expect(outcome).toEqual({ handled: false, reason: 'malformed_payload' });
  });
});

describe('message.ack', () => {
  let messageId: string;
  const gatewayMessageId = 'wamid-outbound-1';

  beforeEach(async () => {
    const claimed = await claimOutboundMessage({
      clinicId,
      clientId,
      kind: 'appointment_reminder',
      chatId: '970599123456@c.us',
      phone: '970599123456',
      body: 'تذكير',
      dedupeKey: 'reminder:test',
    });

    if (!claimed) throw new Error('claim returned no row');

    messageId = claimed.id;
    await markMessageSent(messageId, gatewayMessageId);
  });

  const statusOf = async (): Promise<string> => {
    const [row] = await db
      .select({ status: whatsappMessages.status, error: whatsappMessages.error })
      .from(whatsappMessages)
      .where(eq(whatsappMessages.id, messageId));

    return row?.status ?? 'missing';
  };

  test('advances a sent message to delivered, then to read', async () => {
    expect(await handleWebhookEvent(envelope('message.ack', { messageId: gatewayMessageId, status: 'delivered' })))
      .toEqual({ handled: true, reason: 'ack_applied' });
    expect(await statusOf()).toBe('delivered');

    await handleWebhookEvent(envelope('message.ack', { messageId: gatewayMessageId, status: 'read' }));
    expect(await statusOf()).toBe('read');
  });

  test('never moves a status backwards, however late the receipt arrives', async () => {
    await handleWebhookEvent(envelope('message.ack', { messageId: gatewayMessageId, status: 'read' }));

    const late = await handleWebhookEvent(
      envelope('message.ack', { messageId: gatewayMessageId, status: 'delivered' }),
    );

    expect(late).toEqual({ handled: true, reason: 'ignored_stale_ack' });
    expect(await statusOf()).toBe('read');
  });

  test('records a delivery failure reported by WhatsApp', async () => {
    await handleWebhookEvent(envelope('message.failed', { messageId: gatewayMessageId, status: 'failed' }));

    expect(await statusOf()).toBe('failed');
  });

  test('ignores a pending ack, which says nothing new', async () => {
    const outcome = await handleWebhookEvent(
      envelope('message.ack', { messageId: gatewayMessageId, status: 'pending' }),
    );

    expect(outcome).toEqual({ handled: true, reason: 'ignored_stale_ack' });
    expect(await statusOf()).toBe('sent');
  });

  test('an ack naming an unknown message advances nothing', async () => {
    const outcome = await handleWebhookEvent(envelope('message.ack', { messageId: 'never-sent', status: 'read' }));

    expect(outcome).toEqual({ handled: true, reason: 'ignored_stale_ack' });
    expect(await statusOf()).toBe('sent');
  });

  test('one clinic\'s ack cannot advance another clinic\'s message', async () => {
    // WhatsApp ids are unique per account, not globally.
    const otherClinicId = await createTestClinic('Other Clinic');
    const otherSettings = await createTestWhatsappSettings(otherClinicId);

    await handleWebhookEvent(
      webhookEnvelopeSchema.parse({
        event: 'message.ack',
        sessionId: otherSettings.sessionId,
        data: { messageId: gatewayMessageId, status: 'read' },
      }),
    );

    expect(await statusOf()).toBe('sent');
  });
});

describe('session events', () => {
  test('a status event updates the stored connection', async () => {
    const outcome = await handleWebhookEvent(
      envelope('session.status', { status: 'ready', phone: '970599999999' }),
    );

    expect(outcome).toEqual({ handled: true, reason: 'status_updated' });

    const settings = await readWhatsappSettings(clinicId);
    expect(settings?.status).toBe('ready');
    expect(settings?.phone).toBe('970599999999');
    expect(settings?.connectedAt).not.toBeNull();
  });

  test('a disconnect keeps the number it was linked to', async () => {
    await handleWebhookEvent(envelope('session.status', { status: 'ready', phone: '970599999999' }));
    await handleWebhookEvent(envelope('session.disconnected', {}));

    const settings = await readWhatsappSettings(clinicId);
    expect(settings?.status).toBe('disconnected');
    // Blanking it would lose which phone the clinic was using.
    expect(settings?.phone).toBe('970599999999');
  });

  test('authentication is not treated as ready', async () => {
    // The QR was scanned but the client is still syncing; claiming `ready` here
    // would let a reminder run try to send through a session that cannot.
    await handleWebhookEvent(envelope('session.authenticated', {}));

    expect((await readWhatsappSettings(clinicId))?.status).toBe('authenticating');
  });
});

describe('other events', () => {
  test('the gateway\'s test delivery succeeds', async () => {
    expect(await handleWebhookEvent(envelope('test', { message: 'hello' }))).toEqual({
      handled: true,
      reason: 'status_updated',
    });
  });

  test('an event this app does not handle is reported, not retried', async () => {
    // Answering non-2xx would make the gateway retry five times and then file a
    // delivery failure for something we will never act on.
    expect(await handleWebhookEvent(envelope('group.join', { chatId: '1-2@g.us' }))).toEqual({
      handled: false,
      reason: 'unknown_event',
    });
  });
});
