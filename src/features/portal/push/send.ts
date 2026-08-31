import webpush from 'web-push';

import { getWebPushConfig, WebPushConfigError, type WebPushConfig } from './config';
import {
  claimPushDelivery,
  deleteExpiredSubscriptions,
  markPushDelivered,
  markPushFailed,
  recordDeliveryCount,
  releasePushClaim,
} from './mutations';
import { hasPushConsent, listPushTargets } from './queries';
import { pushConsentKind, renderPushPayload, type PushMessage } from './templates';
import { type PushSendResult, type PushTarget } from './types';

/**
 * The single funnel every push notification passes through.
 *
 * ⚠ **Server only.** It imports `web-push`, which is a Node module; nothing in
 * a client bundle may import this file. The client-side half of the feature
 * shares `types.ts` and `templates.ts`, both of which are free of it.
 *
 * One function, so the five rules that make this safe are written once — the
 * first four are `sendWhatsappMessage`'s, and for the same reasons:
 *
 *  1. **It never throws.** A notification is a courtesy on top of a product
 *     that worked without one. Publishing a plan must not fail because a push
 *     service was slow, so every failure comes back as a {@link PushSendResult}
 *     and the caller decides whether it cares. Every current caller logs it.
 *  2. **The claim is written before the network call.** `claimPushDelivery`
 *     inserts against a unique `(client_id, dedupe_key)`, so a repeated tick
 *     loses the insert and returns without sending. A notification has no
 *     unsend; this is the only place that guarantee can live.
 *  3. **Consent is checked first**, against the same four flags the client set
 *     on the notifications screen and that already gate WhatsApp.
 *  4. **The transport is injectable**, so `bun test` asserts on what would have
 *     been sent without a network — exactly as `src/lib/mail/` does with its
 *     transports and the WhatsApp feature does with its gateway.
 *  5. **Only 404 and 410 delete a subscription.** Everything else is recorded
 *     against the row and retried next time. See {@link isGoneStatus}.
 */

/**
 * How long the push service should hold a notification for a device that is
 * offline, in seconds.
 *
 * Six hours, not the protocol's default of four weeks. Every notification this
 * app sends is about *now* — an appointment tomorrow, a day still worth
 * logging, a reply just written — and a phone switched on after a week should
 * not open onto a queue of things that stopped being true. A client who missed
 * one has the in-app feed, which is derived from live records and cannot go
 * stale.
 */
const DEFAULT_TTL_SECONDS = 6 * 60 * 60;

export type SendWebPushRequest = {
  clientId: string;
  /**
   * The idempotency anchor, and the device-side collapse tag. Deterministic per
   * event — `reminder:<appointmentId>:<date>` — never random: a random key
   * here would defeat the whole of rule 2.
   */
  dedupeKey: string;
  /**
   * What to say. Rendered per device, in that device's own locale.
   *
   * **The consent flag is derived from this, not passed alongside it** —
   * `pushConsentKind`. A caller that could name both would eventually name a
   * mismatched pair, checking one switch while sending another kind of
   * message, and nothing about it would look broken.
   */
  message: PushMessage;
  /** Overrides the kind's default destination. See `pushDestination`. */
  tail?: string;
  ttlSeconds?: number;
};

/**
 * What actually talks to the push service.
 *
 * Resolves when the device's push service accepted the payload; throws
 * otherwise, carrying a `statusCode` when the failure was an HTTP one. That is
 * `web-push`'s own contract (`WebPushError`), restated here so a test double
 * has something to implement.
 */
export type PushTransport = (
  target: PushTarget,
  payload: string,
  options: { config: WebPushConfig; ttlSeconds: number },
) => Promise<void>;

export type SendWebPushDeps = {
  transport?: PushTransport;
};

/** The real one. */
export const httpPushTransport: PushTransport = async (target, payload, { config, ttlSeconds }) => {
  await webpush.sendNotification(
    {
      endpoint: target.endpoint,
      keys: { p256dh: target.p256dh, auth: target.auth },
    },
    payload,
    {
      TTL: ttlSeconds,
      vapidDetails: {
        subject: config.subject,
        publicKey: config.publicKey,
        privateKey: config.privateKey,
      },
      // `normal` rather than `high`: none of these justify waking a dozing
      // radio, and Apple's service is documented to throttle a sender that
      // marks everything urgent.
      urgency: 'normal',
    },
  );
};

/**
 * The endpoint is permanently gone: the browser was uninstalled, the site data
 * was cleared, or the push service dropped the registration.
 *
 * **404 and 410 only, and this narrowness is the point.** RFC 8030 §7.3 gives
 * 404 (endpoint never existed) and 410 (it did and no longer does) as the two
 * terminal answers; every other status is about the attempt. A 500 is the push
 * service having a bad afternoon, a 429 is throttling, a 413 is a payload too
 * large, and — the one worth naming — a **403 is a VAPID key that no longer
 * matches the subscription**, which happens to *every* row at once the day
 * somebody rotates the keypair. Deleting on any of those would unsubscribe the
 * whole client base in one run.
 */
function isGoneStatus(status: number | undefined): boolean {
  return status === 404 || status === 410;
}

function statusOf(error: unknown): number | undefined {
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === 'number' ? status : undefined;
}

function describe(error: unknown): string {
  const status = statusOf(error);
  const message = error instanceof Error ? error.message : String(error);

  return status ? `${status} ${message}` : message;
}

/**
 * Sends one notification to every device a client has registered.
 *
 * The unit is the **client**, not the device: a client with a phone and a
 * tablet is told once, on both, and `push_deliveries` holds one row for it. That
 * is why the dedupe key names the event and never the endpoint.
 */
export async function sendWebPush(
  request: SendWebPushRequest,
  deps: SendWebPushDeps = {},
): Promise<PushSendResult> {
  let config: WebPushConfig | null;

  try {
    config = getWebPushConfig();
  } catch (error) {
    /*
      Half-configured — one key set and not the other. `getWebPushConfig`
      throws on that deliberately, because it is a deployment mistake rather
      than a feature being off, and a silent skip would hide it behind
      something that merely looked switched off.

      It is still caught here rather than allowed to escape: rule 1 says a
      notification never breaks the thing that triggered it, and a dietitian
      must not see a publish fail because of a `.env`. The log line is the
      loud part, and it names the variable — see `WebPushConfigError`.
    */
    if (error instanceof WebPushConfigError) {
      console.error('[push]', error.message);
      return { status: 'skipped', reason: 'not_configured' };
    }

    throw error;
  }

  if (!config) return { status: 'skipped', reason: 'not_configured' };

  const kind = pushConsentKind(request.message);

  if (!(await hasPushConsent(request.clientId, kind))) {
    return { status: 'skipped', reason: 'no_consent' };
  }

  const targets = await listPushTargets(request.clientId);
  if (targets.length === 0) return { status: 'skipped', reason: 'no_devices' };

  // Before the network, never after. See rule 2.
  const claim = await claimPushDelivery(request.clientId, kind, request.dedupeKey);
  if (!claim) return { status: 'skipped', reason: 'duplicate' };

  const transport = deps.transport ?? httpPushTransport;
  const ttlSeconds = request.ttlSeconds ?? DEFAULT_TTL_SECONDS;

  const delivered: string[] = [];
  const expired: string[] = [];
  const failed: string[] = [];
  let lastError = '';

  await Promise.all(
    targets.map(async (target) => {
      // Rendered per device: two phones on one account can be reading the
      // portal in two languages. See `push_subscriptions.locale`.
      const payload = JSON.stringify(
        renderPushPayload(request.message, target.locale, {
          dedupeKey: request.dedupeKey,
          tail: request.tail,
        }),
      );

      try {
        await transport(target, payload, { config, ttlSeconds });
        delivered.push(target.id);
      } catch (error) {
        if (isGoneStatus(statusOf(error))) {
          expired.push(target.id);
          return;
        }

        lastError = describe(error);
        failed.push(target.id);
      }
    }),
  );

  const removed = await deleteExpiredSubscriptions(expired);
  await markPushDelivered(delivered);
  await markPushFailed(failed, lastError);

  if (delivered.length === 0) {
    /*
      Nobody got it. Releasing the claim is what lets the next tick try again —
      left in place, the unique key would mean this notification is never sent,
      which is the wrong answer for a client whose only device happened to be
      unreachable for a minute.

      Partial delivery is deliberately *not* released: one device is a client
      who has been told, and sending again on the next tick would be telling
      them twice.
    */
    await releasePushClaim(claim.id);

    if (failed.length > 0) {
      console.error('[push] every device failed', {
        clientId: request.clientId,
        kind,
        error: lastError,
      });
    }
  } else {
    await recordDeliveryCount(claim.id, delivered.length);
  }

  return { status: 'sent', delivered: delivered.length, removed, failed: failed.length };
}
