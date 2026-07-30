import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Proving that a webhook delivery really came from the gateway.
 *
 * `/api/whatsapp/webhook` has to be reachable by an unauthenticated caller — the
 * gateway holds no session cookie — so the signature is the *only* thing
 * standing between a stranger and the ability to inject messages into a clinic's
 * thread, or to mark a reminder as delivered when it never was. Treat a failed
 * check as hostile: reject, log nothing from the body, and answer 401.
 *
 * The gateway signs the **raw request body** with HMAC-SHA256 and sends
 * `X-OpenWA-Signature: sha256=<hex>`. Signing the raw bytes (not a re-serialised
 * object) is why the route reads `request.text()` and parses afterwards: JSON
 * round-tripping reorders keys and would invalidate every signature.
 */

export const SIGNATURE_HEADER = 'x-openwa-signature';

/** The gateway's idempotency key header. See `inbound.ts` for why it matters. */
export const IDEMPOTENCY_HEADER = 'x-openwa-idempotency-key';

const PREFIX = 'sha256=';

export function signWebhookBody(rawBody: string, secret: string): string {
  return `${PREFIX}${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
}

/**
 * Constant-time comparison of the received signature against the expected one.
 *
 * `timingSafeEqual` throws on a length mismatch rather than returning false, so
 * the lengths are compared first — but only after both sides are hex-decoded, so
 * the early return leaks nothing beyond "the header was the wrong size", which an
 * attacker already knows.
 */
export function verifyWebhookSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
): boolean {
  if (!header || !secret) return false;
  if (!header.startsWith(PREFIX)) return false;

  const received = Buffer.from(header.slice(PREFIX.length), 'hex');
  const expected = Buffer.from(signWebhookBody(rawBody, secret).slice(PREFIX.length), 'hex');

  // A malformed hex string decodes to a short buffer; the length check catches
  // it before `timingSafeEqual` can throw.
  if (received.length !== expected.length || received.length === 0) return false;

  return timingSafeEqual(received, expected);
}

/**
 * Constant-time equality for a shared secret — the cron route's bearer token.
 *
 * A plain `===` on a secret leaks its prefix length through timing. That is a
 * marginal attack over the internet and a real one from a co-located process, and
 * the fix is one function call.
 */
export function timingSafeEquals(provided: string | null | undefined, expected: string): boolean {
  if (!provided || !expected) return false;

  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');

  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
