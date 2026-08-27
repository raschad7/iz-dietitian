import { z } from 'zod';

import { deletePushSubscription, savePushSubscription } from '@/features/portal/push/mutations';
import { pushSubscriptionSchema } from '@/features/portal/push/schema';
import { getPortalClient } from '@/features/portal/queries';
import { localeSchema } from '@/features/portal/schema';
import { getSession } from '@/lib/session';

/**
 * Re-registers a device whose push subscription the browser rotated.
 *
 * **This exists because a service worker cannot call a server action.** The
 * client's own subscribe and unsubscribe both go through
 * `features/portal/push/actions.ts`, which is where they belong; but
 * `pushsubscriptionchange` fires with no page open — the browser expired an
 * endpoint, or updated itself — and the worker handling it has no React, no
 * router and no action to invoke. It has `fetch`. So this is one of the very
 * few HTTP endpoints in the app, and it exists for the same reason the two
 * WhatsApp routes do: something outside a rendered page has to reach in.
 *
 * ## What authenticates it
 *
 * The session cookie, exactly as every other portal write does. The worker
 * sends `credentials: 'include'`, and `getSession()` reads it — so this endpoint
 * is no more reachable than the portal itself, and a request without a client
 * session is answered 401 and writes nothing.
 *
 * `getSession` rather than `requirePortalClient`: the guards in `lib/session.ts`
 * answer an unauthenticated caller with a `redirect()`, which is right for a
 * page and useless here — a worker's `fetch` would follow it and post the
 * payload into an HTML sign-in page. A status code is the honest answer.
 *
 * ⚠ The client id is resolved from the session and never read from the body,
 * the same rule the server actions follow: a public endpoint that accepts an
 * identifier can be told any identifier.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * What the worker sends: the new subscription in the browser's own
 * `PushSubscription.toJSON()` shape, plus the endpoint it replaces.
 *
 * The nested `keys` object is that shape rather than this app's — the worker
 * has no way to build anything else — so it is flattened here into what
 * `pushSubscriptionSchema` validates, and the real bounds checking happens
 * there rather than being restated.
 */
const bodySchema = z.object({
  locale: z.string(),
  subscription: z.object({
    endpoint: z.string(),
    keys: z.object({ p256dh: z.string(), auth: z.string() }),
  }),
  /** Null on a browser that reported no previous subscription. */
  previousEndpoint: z.string().nullable().optional(),
});

export async function POST(request: Request): Promise<Response> {
  const session = await getSession();

  if (!session || session.user.role !== 'client') {
    return Response.json({ ok: false, reason: 'unauthenticated' }, { status: 401 });
  }

  const client = await getPortalClient(session.user.id);

  // A live session whose client row is gone — staff revoked portal access. The
  // same case `requirePortalClient` sends back to the door.
  if (!client) {
    return Response.json({ ok: false, reason: 'no_client' }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, reason: 'invalid' }, { status: 400 });
  }

  const parsedBody = bodySchema.safeParse(body);
  if (!parsedBody.success) {
    return Response.json({ ok: false, reason: 'invalid' }, { status: 400 });
  }

  const { locale: rawLocale, subscription, previousEndpoint } = parsedBody.data;

  const parsed = pushSubscriptionSchema.safeParse({
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    // `localeSchema` falls back to the default rather than rejecting, so a
    // worker registered under a scope this app no longer serves still lands
    // somewhere sensible instead of losing the device.
    locale: localeSchema.parse(rawLocale),
    userAgent: request.headers.get('user-agent') ?? undefined,
  });

  if (!parsed.success) {
    return Response.json({ ok: false, reason: 'invalid' }, { status: 400 });
  }

  try {
    await savePushSubscription({
      clientId: client.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.p256dh,
      auth: parsed.data.auth,
      locale: parsed.data.locale,
      userAgent: parsed.data.userAgent ?? null,
    });

    /*
      The row the rotation replaced. Deleted after the new one is saved, and
      only when it is genuinely a different endpoint: a browser that reports
      the same one on both sides of the event would otherwise have its device
      removed a moment after registering it.
    */
    if (previousEndpoint && previousEndpoint !== parsed.data.endpoint) {
      await deletePushSubscription(client.id, previousEndpoint);
    }
  } catch (error) {
    console.error('[push] re-registering a rotated subscription failed', error);
    return Response.json({ ok: false, reason: 'unexpected' }, { status: 500 });
  }

  return Response.json({ ok: true });
}
