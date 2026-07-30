import { afterAll, beforeEach, describe, expect, test } from 'bun:test';

import { db } from '@/db';
import { whatsappMessages } from '@/db/schema';

import {
  createTestClinic,
  createTestWhatsappSettings,
  disableWhatsappForTests,
  enableWhatsappForTests,
  resetDatabase,
} from '../../../tests/helpers';
import { POST } from '../../app/api/whatsapp/webhook/route';
import { signWebhookBody } from './signature';

/**
 * The webhook endpoint as an HTTP surface.
 *
 * `inbound.test.ts` covers what the handler concludes; this covers the gate in
 * front of it. That gate is the entire security of the route — it is reachable by
 * anyone who can guess the URL — so the unsigned, wrongly-signed and tampered
 * cases are the point of this file.
 */

const SECRET = 'test-webhook-secret';

let sessionId: string;

beforeEach(async () => {
  await resetDatabase();
  enableWhatsappForTests();

  const clinicId = await createTestClinic();
  const settings = await createTestWhatsappSettings(clinicId);
  sessionId = settings.sessionId ?? '';
});

afterAll(() => {
  disableWhatsappForTests();
});

function post(body: string, signature: string | null): Promise<Response> {
  return POST(
    new Request('http://localhost:3000/api/whatsapp/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(signature === null ? {} : { 'x-openwa-signature': signature }),
      },
      body,
    }),
  );
}

function inboundBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    event: 'message.received',
    sessionId,
    idempotencyKey: 'msg-key-1',
    data: { id: 'wamid-1', chatId: '970599123456@c.us', body: 'مرحبا', fromMe: false, isGroup: false },
    ...overrides,
  });
}

describe('POST /api/whatsapp/webhook', () => {
  test('accepts a correctly signed delivery and records the message', async () => {
    const body = inboundBody();

    const response = await post(body, signWebhookBody(body, SECRET));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, handled: true, reason: 'recorded' });
    expect(await db.select().from(whatsappMessages)).toHaveLength(1);
  });

  test('rejects a delivery with no signature', async () => {
    const response = await post(inboundBody(), null);

    expect(response.status).toBe(401);
    expect(await db.select().from(whatsappMessages)).toHaveLength(0);
  });

  test('rejects a signature made with the wrong secret', async () => {
    const body = inboundBody();

    const response = await post(body, signWebhookBody(body, 'not-the-secret'));

    expect(response.status).toBe(401);
    expect(await db.select().from(whatsappMessages)).toHaveLength(0);
  });

  test('rejects a body altered after it was signed', async () => {
    const original = inboundBody();
    const signature = signWebhookBody(original, SECRET);

    const tampered = inboundBody({
      data: { id: 'wamid-1', chatId: '970599999999@c.us', body: 'injected', fromMe: false, isGroup: false },
    });

    const response = await post(tampered, signature);

    expect(response.status).toBe(401);
    expect(await db.select().from(whatsappMessages)).toHaveLength(0);
  });

  test('answers 400 for a signed body that is not JSON', async () => {
    const body = 'not json at all';

    const response = await post(body, signWebhookBody(body, SECRET));

    // Signed, so not hostile — but retrying it would fail identically.
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ reason: 'malformed_json' });
  });

  test('answers 400 for a signed envelope missing its session', async () => {
    const body = JSON.stringify({ event: 'message.received', data: {} });

    const response = await post(body, signWebhookBody(body, SECRET));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ reason: 'malformed_payload' });
  });

  test('answers 200 for an event it deliberately ignores', async () => {
    // A non-2xx would make the gateway retry five times and then file a delivery
    // failure for an event this app will never act on.
    const body = JSON.stringify({ event: 'group.update', sessionId, data: {} });

    const response = await post(body, signWebhookBody(body, SECRET));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ handled: false, reason: 'unknown_event' });
  });

  test('answers 404 when the feature is switched off', async () => {
    disableWhatsappForTests();

    const body = inboundBody();
    const response = await post(body, signWebhookBody(body, SECRET));

    // 404 rather than 503: a disabled install does not advertise the route.
    expect(response.status).toBe(404);

    enableWhatsappForTests();
  });
});
