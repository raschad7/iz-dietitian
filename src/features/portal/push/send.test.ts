import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { clientSettings, pushDeliveries, pushSubscriptions } from '@/db/schema';

import {
  createTestClient,
  createTestClinic,
  createTestPushSubscription,
  disableWebPushForTests,
  enableWebPushForTests,
  resetDatabase,
} from '../../../../tests/helpers';
import { sendWebPush, type PushTransport } from './send';

/**
 * The send pipeline's contract. Four properties matter more than the rest:
 *
 *  1. it sends **at most once** per dedupe key, because a notification has no
 *     unsend and the reminder tick is expected to repeat;
 *  2. it **never throws**, because nothing in the app — publishing a plan,
 *     answering a request — may fail on account of a notification;
 *  3. it deletes a subscription on **404/410 and on nothing else**, so one bad
 *     afternoon at a push service does not unsubscribe the client base;
 *  4. it honours the client's own consent flags, which are the same four that
 *     gate WhatsApp.
 */

let clientId: string;

beforeEach(async () => {
  await resetDatabase();
  enableWebPushForTests();

  const clinicId = await createTestClinic();
  clientId = await createTestClient(clinicId, 'أحمد خليل');
});

afterAll(() => {
  disableWebPushForTests();
});

/** Records what would have gone out, and can be told to fail. */
function fakeTransport(failWith?: unknown) {
  const sent: { endpoint: string; payload: string }[] = [];

  const transport: PushTransport = async (target, payload) => {
    if (failWith) throw failWith;
    sent.push({ endpoint: target.endpoint, payload });
  };

  return { transport, sent };
}

/** An HTTP failure shaped like `web-push`'s own `WebPushError`. */
function pushError(statusCode: number) {
  return Object.assign(new Error(`push service said ${statusCode}`), { statusCode });
}

const request = (overrides: Record<string, unknown> = {}) => ({
  clientId,
  dedupeKey: 'plan:2026-08-31',
  message: { kind: 'plan_update' as const },
  ...overrides,
});

describe('sendWebPush', () => {
  test('delivers to every device the client registered', async () => {
    await createTestPushSubscription(clientId, { endpoint: 'https://push.example.com/phone' });
    await createTestPushSubscription(clientId, { endpoint: 'https://push.example.com/tablet' });

    const { transport, sent } = fakeTransport();
    const result = await sendWebPush(request(), { transport });

    expect(result).toEqual({ status: 'sent', delivered: 2, removed: 0, failed: 0 });
    expect(sent.map((entry) => entry.endpoint).toSorted()).toEqual([
      'https://push.example.com/phone',
      'https://push.example.com/tablet',
    ]);
  });

  test('writes one delivery row per client, not per device', async () => {
    await createTestPushSubscription(clientId);
    await createTestPushSubscription(clientId);

    const { transport } = fakeTransport();
    await sendWebPush(request(), { transport });

    const rows = await db.select().from(pushDeliveries).where(eq(pushDeliveries.clientId, clientId));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.deliveredCount).toBe(2);
  });

  test('renders each device in its own locale', async () => {
    await createTestPushSubscription(clientId, { endpoint: 'https://push.example.com/ar', locale: 'ar' });
    await createTestPushSubscription(clientId, { endpoint: 'https://push.example.com/en', locale: 'en' });

    const { transport, sent } = fakeTransport();
    await sendWebPush(request(), { transport });

    const byEndpoint = new Map(sent.map((entry) => [entry.endpoint, JSON.parse(entry.payload)]));

    expect(byEndpoint.get('https://push.example.com/ar').url).toBe('/ar/portal');
    expect(byEndpoint.get('https://push.example.com/en').url).toBe('/en/portal');
    expect(byEndpoint.get('https://push.example.com/ar').title).not.toBe(
      byEndpoint.get('https://push.example.com/en').title,
    );
  });

  test('sends once for a dedupe key, however many times it is called', async () => {
    await createTestPushSubscription(clientId);

    const { transport, sent } = fakeTransport();

    const first = await sendWebPush(request(), { transport });
    const second = await sendWebPush(request(), { transport });

    expect(first.status).toBe('sent');
    expect(second).toEqual({ status: 'skipped', reason: 'duplicate' });
    expect(sent).toHaveLength(1);
  });

  test('a different event for the same client still sends', async () => {
    await createTestPushSubscription(clientId);

    const { transport, sent } = fakeTransport();

    await sendWebPush(request(), { transport });
    await sendWebPush(request({ dedupeKey: 'plan:2026-09-07' }), { transport });

    expect(sent).toHaveLength(2);
  });

  test('skips a client with no device', async () => {
    const { transport, sent } = fakeTransport();

    expect(await sendWebPush(request(), { transport })).toEqual({
      status: 'skipped',
      reason: 'no_devices',
    });
    expect(sent).toHaveLength(0);
  });

  test('skips when the client turned that notification off', async () => {
    await createTestPushSubscription(clientId);
    await db.insert(clientSettings).values({ clientId, notifyPlanUpdate: false });

    const { transport, sent } = fakeTransport();

    expect(await sendWebPush(request(), { transport })).toEqual({
      status: 'skipped',
      reason: 'no_consent',
    });
    expect(sent).toHaveLength(0);
  });

  test('sends to a client whose settings row does not exist yet', async () => {
    // The majority case: `client_settings` is written lazily, and its absence
    // means the documented defaults — all four on — rather than no consent.
    await createTestPushSubscription(clientId);

    const { transport } = fakeTransport();

    expect((await sendWebPush(request(), { transport })).status).toBe('sent');
  });

  test('a switch left on is still consent', async () => {
    await createTestPushSubscription(clientId);
    await db.insert(clientSettings).values({ clientId, notifyClinicMessage: false });

    const { transport } = fakeTransport();

    // A different kind was switched off; this one is untouched.
    expect((await sendWebPush(request(), { transport })).status).toBe('sent');
  });

  test('skips with nothing configured, and sends nothing', async () => {
    disableWebPushForTests();
    await createTestPushSubscription(clientId);

    const { transport, sent } = fakeTransport();

    expect(await sendWebPush(request(), { transport })).toEqual({
      status: 'skipped',
      reason: 'not_configured',
    });
    expect(sent).toHaveLength(0);

    enableWebPushForTests();
  });

  test('deletes a subscription the push service says is gone (410)', async () => {
    await createTestPushSubscription(clientId);

    const { transport } = fakeTransport(pushError(410));
    const result = await sendWebPush(request(), { transport });

    expect(result).toEqual({ status: 'sent', delivered: 0, removed: 1, failed: 0 });
    expect(await db.select().from(pushSubscriptions)).toHaveLength(0);
  });

  test('deletes on 404 too', async () => {
    await createTestPushSubscription(clientId);

    const { transport } = fakeTransport(pushError(404));
    await sendWebPush(request(), { transport });

    expect(await db.select().from(pushSubscriptions)).toHaveLength(0);
  });

  test('keeps the subscription on any other failure, and records why', async () => {
    // 500 is the push service having a bad afternoon; 403 is a rotated VAPID
    // key, which would otherwise unsubscribe every client at once.
    for (const status of [500, 429, 403]) {
      await db.delete(pushSubscriptions);
      await db.delete(pushDeliveries);
      await createTestPushSubscription(clientId);

      const { transport } = fakeTransport(pushError(status));
      const result = await sendWebPush(request(), { transport });

      expect(result).toEqual({ status: 'sent', delivered: 0, removed: 0, failed: 1 });

      const [row] = await db.select().from(pushSubscriptions);
      expect(row).toBeDefined();
      expect(row?.lastError).toContain(String(status));
    }
  });

  test('releases the claim when nobody was reached, so the next tick retries', async () => {
    await createTestPushSubscription(clientId);

    const failing = fakeTransport(pushError(500));
    await sendWebPush(request(), { transport: failing.transport });

    expect(await db.select().from(pushDeliveries)).toHaveLength(0);

    // The retry, against a push service that has recovered.
    const working = fakeTransport();
    expect((await sendWebPush(request(), { transport: working.transport })).status).toBe('sent');
    expect(working.sent).toHaveLength(1);
  });

  test('partial delivery keeps the claim — one device is a client who was told', async () => {
    await createTestPushSubscription(clientId, { endpoint: 'https://push.example.com/live' });
    await createTestPushSubscription(clientId, { endpoint: 'https://push.example.com/dead' });

    const transport: PushTransport = async (target) => {
      if (target.endpoint.endsWith('/dead')) throw pushError(410);
    };

    const result = await sendWebPush(request(), { transport });

    expect(result).toEqual({ status: 'sent', delivered: 1, removed: 1, failed: 0 });
    expect(await db.select().from(pushDeliveries)).toHaveLength(1);
  });

  test('marks a delivered device with the time it was reached', async () => {
    await createTestPushSubscription(clientId);

    const { transport } = fakeTransport();
    await sendWebPush(request(), { transport });

    const [row] = await db.select().from(pushSubscriptions);

    expect(row?.lastSuccessAt).toBeInstanceOf(Date);
    expect(row?.lastError).toBeNull();
  });

  test('does not throw when the transport fails in a way nobody anticipated', async () => {
    await createTestPushSubscription(clientId);

    const { transport } = fakeTransport(new Error('socket hang up'));

    expect((await sendWebPush(request(), { transport })).status).toBe('sent');
  });
});
