import { describe, expect, test } from 'bun:test';

import { signWebhookBody, timingSafeEquals, verifyWebhookSignature } from './signature';

/**
 * The signature is the only thing authenticating `/api/whatsapp/webhook`. These
 * tests are about what it must *refuse*: everything below is a request a stranger
 * could make, and each one has to come back false.
 */

const SECRET = 'a-webhook-secret';
const BODY = JSON.stringify({ event: 'message.received', sessionId: 'sess-1', data: { id: 'x' } });

describe('verifyWebhookSignature', () => {
  test('accepts a body signed with the shared secret', () => {
    expect(verifyWebhookSignature(BODY, signWebhookBody(BODY, SECRET), SECRET)).toBe(true);
  });

  test('rejects a body that was altered after signing', () => {
    const signature = signWebhookBody(BODY, SECRET);

    expect(verifyWebhookSignature(`${BODY} `, signature, SECRET)).toBe(false);
  });

  test('rejects a signature made with a different secret', () => {
    expect(verifyWebhookSignature(BODY, signWebhookBody(BODY, 'another-secret'), SECRET)).toBe(false);
  });

  test('rejects a missing signature header', () => {
    expect(verifyWebhookSignature(BODY, null, SECRET)).toBe(false);
    expect(verifyWebhookSignature(BODY, undefined, SECRET)).toBe(false);
    expect(verifyWebhookSignature(BODY, '', SECRET)).toBe(false);
  });

  test('rejects a signature without the sha256= prefix', () => {
    const bare = signWebhookBody(BODY, SECRET).replace('sha256=', '');

    expect(verifyWebhookSignature(BODY, bare, SECRET)).toBe(false);
  });

  test('rejects a truncated or over-long hex digest instead of throwing', () => {
    const signature = signWebhookBody(BODY, SECRET);

    expect(verifyWebhookSignature(BODY, signature.slice(0, -4), SECRET)).toBe(false);
    expect(verifyWebhookSignature(BODY, `${signature}ffff`, SECRET)).toBe(false);
  });

  test('rejects a non-hex digest', () => {
    expect(verifyWebhookSignature(BODY, 'sha256=not-hex-at-all', SECRET)).toBe(false);
  });

  test('rejects everything when no secret is configured', () => {
    // A deployment with an empty secret must not accidentally accept every
    // delivery — including one signed with the empty string.
    expect(verifyWebhookSignature(BODY, signWebhookBody(BODY, ''), '')).toBe(false);
  });

  test('is sensitive to key order, which is why the raw body is what gets signed', () => {
    const signature = signWebhookBody(BODY, SECRET);
    const reserialised = JSON.stringify(JSON.parse(BODY) as Record<string, unknown>);
    const reordered = JSON.stringify({ sessionId: 'sess-1', event: 'message.received', data: { id: 'x' } });

    expect(verifyWebhookSignature(reserialised, signature, SECRET)).toBe(true);
    expect(verifyWebhookSignature(reordered, signature, SECRET)).toBe(false);
  });
});

describe('timingSafeEquals', () => {
  test('accepts an identical secret', () => {
    expect(timingSafeEquals('cron-secret', 'cron-secret')).toBe(true);
  });

  test('rejects a different secret, a prefix, and nothing', () => {
    expect(timingSafeEquals('cron-secre', 'cron-secret')).toBe(false);
    expect(timingSafeEquals('cron-secrets', 'cron-secret')).toBe(false);
    expect(timingSafeEquals(null, 'cron-secret')).toBe(false);
    expect(timingSafeEquals('', 'cron-secret')).toBe(false);
  });

  test('rejects when the expected secret is empty', () => {
    expect(timingSafeEquals('anything', '')).toBe(false);
  });
});
