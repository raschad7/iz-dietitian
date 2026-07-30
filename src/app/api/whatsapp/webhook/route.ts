import { getWhatsappConfig } from '@/features/whatsapp/config';
import { handleWebhookEvent } from '@/features/whatsapp/inbound';
import { webhookEnvelopeSchema } from '@/features/whatsapp/schema';
import { SIGNATURE_HEADER, verifyWebhookSignature } from '@/features/whatsapp/signature';

/**
 * Where the OpenWA gateway delivers events: inbound replies, delivery receipts,
 * and session status changes.
 *
 * **Why this is an HTTP endpoint at all.** The project's rule is server actions
 * only — `api/auth/[...all]` was the single exception. This is the second, and for
 * a reason that cannot be designed around: the caller is another process with no
 * session cookie and no ability to invoke a server action. An external system that
 * must reach in needs a URL.
 *
 * Its security therefore rests entirely on the HMAC signature:
 *
 *  - the body is read **raw** and verified before it is parsed, because the
 *    gateway signs bytes and re-serialising JSON reorders keys;
 *  - a bad or missing signature is 401 with no detail — a stranger learns nothing
 *    about whether the session, clinic or message id they guessed exists;
 *  - the request is never trusted to say which clinic it concerns. The clinic is
 *    resolved from `session_id` against `whatsapp_settings`, so a valid signature
 *    still only reaches the tenant that owns that session.
 *
 * It answers 200 for anything it understood, **including events it chose to
 * ignore**. A non-2xx makes the gateway retry, five times, and then file a
 * delivery failure — the wrong outcome for an event this app will never handle.
 */

/** Node, not Edge: the signature check uses `node:crypto`'s timing-safe compare. */
export const runtime = 'nodejs';

/** A webhook is a write. Nothing about it may be cached or prerendered. */
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const config = getWhatsappConfig();

  // The feature is switched off on this deployment. Answering 404 rather than 503
  // keeps a disabled install from advertising that the route exists.
  if (!config) return new Response('Not found', { status: 404 });

  const rawBody = await request.text();

  if (!verifyWebhookSignature(rawBody, request.headers.get(SIGNATURE_HEADER), config.webhookSecret)) {
    // No body, no reason, no logging of the payload: an unsigned request is
    // hostile until proven otherwise, and its contents are not evidence of
    // anything.
    console.warn('[whatsapp] rejected a webhook delivery with an invalid signature');
    return new Response('Invalid signature', { status: 401 });
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Signed but not JSON. That is a gateway bug, not an attack — say so plainly
    // and do not ask for a retry that would fail identically.
    return Response.json({ ok: false, reason: 'malformed_json' }, { status: 400 });
  }

  const envelope = webhookEnvelopeSchema.safeParse(payload);

  if (!envelope.success) {
    return Response.json({ ok: false, reason: 'malformed_payload' }, { status: 400 });
  }

  try {
    const outcome = await handleWebhookEvent(envelope.data);

    return Response.json({ ok: true, ...outcome });
  } catch (error) {
    // A database failure is the one case worth a retry: the event was valid and
    // the gateway can usefully send it again.
    console.error('[whatsapp] webhook handling failed', { event: envelope.data.event, error });

    return Response.json({ ok: false, reason: 'handler_error' }, { status: 500 });
  }
}
