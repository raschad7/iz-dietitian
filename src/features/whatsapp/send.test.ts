import { afterAll, beforeEach, describe, expect, test } from 'bun:test';

import { db } from '@/db';
import { whatsappMessages } from '@/db/schema';

import {
  createFakeGateway,
  createTestClient,
  createTestClinic,
  createTestWhatsappSettings,
  disableWhatsappForTests,
  enableWhatsappForTests,
  readWhatsappSettings,
  resetDatabase,
} from '../../../tests/helpers';
import { GatewayError } from './gateway';
import { getSettings, listRecentMessages } from './queries';
import { manualDedupeKey, reminderDedupeKey, sendWhatsappMessage } from './send';

/**
 * The send pipeline's contract. Two properties matter more than the rest:
 *
 *  1. it sends **at most once** per dedupe key, because WhatsApp has no unsend;
 *  2. it **never throws**, because nothing in the clinic — booking, issuing
 *     credentials — may fail on account of a message.
 */

let clinicId: string;
let clientId: string;

beforeEach(async () => {
  await resetDatabase();
  enableWhatsappForTests();

  clinicId = await createTestClinic();
  clientId = await createTestClient(clinicId, 'أحمد خليل');
});

afterAll(() => {
  disableWhatsappForTests();
});

const request = (overrides: Record<string, unknown> = {}) => ({
  clinicId,
  clientId,
  kind: 'manual' as const,
  phone: '0599123456',
  body: 'تذكير بموعدك',
  dedupeKey: manualDedupeKey(),
  ...overrides,
});

describe('sendWhatsappMessage', () => {
  test('sends through the gateway and records the message as sent', async () => {
    const settings = await createTestWhatsappSettings(clinicId);
    const gateway = createFakeGateway();

    const result = await sendWhatsappMessage(request(), { gateway });

    expect(result.status).toBe('sent');
    expect(gateway.sent).toEqual([
      { sessionId: settings.sessionId ?? '', chatId: '970599123456@c.us', text: 'تذكير بموعدك' },
    ]);

    const [row] = await listRecentMessages(clinicId);
    expect(row?.status).toBe('sent');
    expect(row?.direction).toBe('outbound');
    expect(row?.phone).toBe('970599123456');
  });

  test('sends only once for the same dedupe key, however many times it is called', async () => {
    await createTestWhatsappSettings(clinicId);
    const gateway = createFakeGateway();

    const dedupeKey = reminderDedupeKey('appointment-1', '2026-08-05');

    const first = await sendWhatsappMessage(request({ dedupeKey }), { gateway });
    const second = await sendWhatsappMessage(request({ dedupeKey }), { gateway });
    const third = await sendWhatsappMessage(request({ dedupeKey, body: 'different text' }), { gateway });

    expect(first.status).toBe('sent');
    expect(second).toEqual({ status: 'skipped', reason: 'duplicate' });
    expect(third).toEqual({ status: 'skipped', reason: 'duplicate' });

    expect(gateway.sent).toHaveLength(1);
    expect(await db.select().from(whatsappMessages)).toHaveLength(1);
  });

  test('concurrent calls with one dedupe key still send once', async () => {
    // The realistic race: two cron ticks, or two app instances, reaching the same
    // reminder at the same moment. The unique index is the arbiter, not a read.
    await createTestWhatsappSettings(clinicId);
    const gateway = createFakeGateway();
    const dedupeKey = reminderDedupeKey('appointment-2', '2026-08-06');

    const results = await Promise.all([
      sendWhatsappMessage(request({ dedupeKey }), { gateway }),
      sendWhatsappMessage(request({ dedupeKey }), { gateway }),
      sendWhatsappMessage(request({ dedupeKey }), { gateway }),
    ]);

    expect(results.filter((result) => result.status === 'sent')).toHaveLength(1);
    expect(gateway.sent).toHaveLength(1);
  });

  test('a manual send may repeat, because its key is random', async () => {
    await createTestWhatsappSettings(clinicId);
    const gateway = createFakeGateway();

    await sendWhatsappMessage(request({ body: 'يرجى إحضار التحاليل' }), { gateway });
    await sendWhatsappMessage(request({ body: 'يرجى إحضار التحاليل' }), { gateway });

    expect(gateway.sent).toHaveLength(2);
  });

  test('records a failure on the message and the connection, and does not throw', async () => {
    await createTestWhatsappSettings(clinicId);
    const gateway = createFakeGateway();
    gateway.failWith = new GatewayError('The gateway refused the send.', 400, 'Session is not connected');

    const result = await sendWhatsappMessage(request(), { gateway });

    expect(result.status).toBe('failed');

    const [row] = await listRecentMessages(clinicId);
    expect(row?.status).toBe('failed');
    expect(row?.error).toContain('Session is not connected');

    // Visible on the settings page, not only in the server log.
    expect((await getSettings(clinicId))?.lastError).toContain('Session is not connected');
  });

  test('marks the session disconnected when the gateway no longer has it', async () => {
    await createTestWhatsappSettings(clinicId);
    const gateway = createFakeGateway();
    gateway.failWith = new GatewayError('No such session.', 404);

    await sendWhatsappMessage(request(), { gateway });

    // Every later send in the same run would fail identically; the status stops
    // the app from pretending otherwise.
    expect((await readWhatsappSettings(clinicId))?.status).toBe('disconnected');
  });

  test('skips, without a row, when the clinic never connected WhatsApp', async () => {
    const gateway = createFakeGateway();

    expect(await sendWhatsappMessage(request(), { gateway })).toEqual({
      status: 'skipped',
      reason: 'not_configured',
    });

    expect(gateway.sent).toHaveLength(0);
    expect(await db.select().from(whatsappMessages)).toHaveLength(0);
  });

  test('skips when the session exists but is not paired', async () => {
    await createTestWhatsappSettings(clinicId, { status: 'qr_ready' });
    const gateway = createFakeGateway();

    expect(await sendWhatsappMessage(request(), { gateway })).toEqual({
      status: 'skipped',
      reason: 'not_connected',
    });

    // Nothing is claimed either: the reminder must remain sendable once the phone
    // is back, rather than being burnt by a dedupe row nobody will retry.
    expect(await db.select().from(whatsappMessages)).toHaveLength(0);
  });

  test('skips a client whose phone number is missing or unusable', async () => {
    await createTestWhatsappSettings(clinicId);
    const gateway = createFakeGateway();

    expect(await sendWhatsappMessage(request({ phone: null }), { gateway })).toEqual({
      status: 'skipped',
      reason: 'no_phone',
    });
    expect(await sendWhatsappMessage(request({ phone: 'ask the son' }), { gateway })).toEqual({
      status: 'skipped',
      reason: 'no_phone',
    });
  });

  test('skips everything when the feature is switched off', async () => {
    await createTestWhatsappSettings(clinicId);
    disableWhatsappForTests();

    const gateway = createFakeGateway();

    expect(await sendWhatsappMessage(request(), { gateway })).toEqual({
      status: 'skipped',
      reason: 'not_configured',
    });

    enableWhatsappForTests();
  });

  test('one clinic cannot dedupe against another clinic', async () => {
    // The dedupe index is scoped to the clinic, so two tenants reminding about
    // their own appointment number 1 both get their message.
    const otherClinicId = await createTestClinic('Other Clinic');
    const otherClientId = await createTestClient(otherClinicId, 'سارة');

    await createTestWhatsappSettings(clinicId);
    await createTestWhatsappSettings(otherClinicId);

    const gateway = createFakeGateway();
    const dedupeKey = reminderDedupeKey('appointment-1', '2026-08-05');

    const first = await sendWhatsappMessage(request({ dedupeKey }), { gateway });
    const second = await sendWhatsappMessage(
      { clinicId: otherClinicId, clientId: otherClientId, kind: 'manual', phone: '0598222333', body: 'hi', dedupeKey },
      { gateway },
    );

    expect(first.status).toBe('sent');
    expect(second.status).toBe('sent');
    expect(gateway.sent).toHaveLength(2);
  });
});
