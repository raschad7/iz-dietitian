import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { isUniqueViolation } from '@/db/errors';
import { pushDeliveries, pushSubscriptions } from '@/db/schema';

import { type PushKind } from './types';

/**
 * Writes for the push feature: registering a device, forgetting one, and
 * claiming a delivery before it is sent.
 *
 * Same split as everywhere else in this codebase — the rules are here, the
 * Next.js concerns (session, revalidation) are in `actions.ts`, and the shapes
 * are in `schema.ts`. Nothing in this file reads a session, so every function
 * takes the `clientId` its caller has already proved.
 */

/**
 * Registers a device, or updates the one already registered at that endpoint.
 *
 * **The upsert targets the endpoint, not the client**, which is what makes the
 * three ways this is legitimately called a second time all correct:
 *
 *  - the same client re-subscribing (they switched notifications off and on, or
 *    the browser rotated the subscription) — the row is refreshed in place;
 *  - a *different* client subscribing on the same device (a shared family
 *    phone, a clinic tablet) — the row moves to them, which is right: the
 *    device now belongs to whoever is signed in, and the previous client must
 *    stop receiving anything there;
 *  - a client subscribing on a second device — a different endpoint, so a
 *    second row, and they are notified on both.
 *
 * `updatedAt` is set explicitly. The column has a default for inserts, but
 * `onConflictDoUpdate` writes only what it is given, so without this a
 * long-lived subscription's timestamp would freeze at the day it was created.
 *
 * The failure columns are cleared on every write: a device coming back is a
 * device whose last error no longer describes it.
 */
export async function savePushSubscription(input: {
  clientId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  locale: 'ar' | 'en';
  userAgent: string | null;
}): Promise<void> {
  const { clientId, endpoint, p256dh, auth, locale, userAgent } = input;

  await db
    .insert(pushSubscriptions)
    .values({ clientId, endpoint, p256dh, auth, locale, userAgent })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { clientId, p256dh, auth, locale, userAgent, lastError: null, updatedAt: new Date() },
    });
}

/**
 * Forgets one device, on the client's own instruction.
 *
 * Scoped to the client as well as the endpoint even though the endpoint is
 * unique on its own. The id comes from a browser, and a public endpoint that
 * takes an identifier must prove ownership in the `WHERE` clause rather than
 * trusting it — the rule `portal/actions.ts` states for every write in this
 * area. Without the extra clause, a crafted post carrying someone else's
 * endpoint would unsubscribe their phone.
 */
export async function deletePushSubscription(clientId: string, endpoint: string): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.clientId, clientId), eq(pushSubscriptions.endpoint, endpoint)));
}

/**
 * Deletes subscriptions the push service has told us are gone — a 404 or a 410
 * from the endpoint itself.
 *
 * By id rather than endpoint: the send path is already holding the rows, and an
 * endpoint is a 300-character URL. Called with whatever the run collected, so a
 * batch of expired devices costs one statement.
 *
 * ⚠ **Only 404 and 410 may reach this.** Every other failure — a 500 from the
 * push service, a timeout, a 403 from a rotated VAPID key — describes the
 * *attempt*, not the device, and deleting on one would silently unsubscribe
 * every client the first time a push service had a bad afternoon. See
 * `sendWebPush`, which is the only caller and makes that distinction.
 */
export async function deleteExpiredSubscriptions(ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;

  const removed = await db
    .delete(pushSubscriptions)
    .where(inArray(pushSubscriptions.id, [...ids]))
    .returning({ id: pushSubscriptions.id });

  return removed.length;
}

/** Records that a device took a payload, so a dead endpoint is visible as one. */
export async function markPushDelivered(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;

  await db
    .update(pushSubscriptions)
    .set({ lastSuccessAt: new Date(), lastError: null, updatedAt: new Date() })
    .where(inArray(pushSubscriptions.id, [...ids]));
}

/** Records why a device did not take it. Kept for diagnosis; never for a decision. */
export async function markPushFailed(ids: readonly string[], error: string): Promise<void> {
  if (ids.length === 0) return;

  await db
    .update(pushSubscriptions)
    // Clamped: this is a diagnostic, and a push service that answers with a
    // whole HTML error page should not put one in every row.
    .set({ lastError: error.slice(0, 500), updatedAt: new Date() })
    .where(inArray(pushSubscriptions.id, [...ids]));
}

/**
 * Claims one notification before it is sent, and reports whether the claim was
 * won.
 *
 * **This is the idempotency guarantee, and it is `claimOutboundMessage`'s
 * exactly** — see the note on `push_deliveries`. The row is inserted *before*
 * the push service is called, against a unique `(client_id, dedupe_key)`, so a
 * second cron tick, a retry, or a second instance loses the insert and returns
 * `null` without reaching the network. A notification cannot be unsent, so this
 * has to be a database constraint rather than a check-then-act.
 *
 * A unique violation is the expected outcome rather than an error: it means
 * this exact notification has already gone out. Anything else is rethrown —
 * a database that is genuinely unhappy must not read as "already sent".
 */
export async function claimPushDelivery(
  clientId: string,
  kind: PushKind,
  dedupeKey: string,
): Promise<{ id: string } | null> {
  try {
    const [row] = await db
      .insert(pushDeliveries)
      .values({ clientId, kind, dedupeKey })
      .returning({ id: pushDeliveries.id });

    return row ?? null;
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

/** How many devices the claimed notification actually reached. */
export async function recordDeliveryCount(deliveryId: string, delivered: number): Promise<void> {
  await db
    .update(pushDeliveries)
    .set({ deliveredCount: delivered })
    .where(eq(pushDeliveries.id, deliveryId));
}

/**
 * Releases a claim that never became a send.
 *
 * The claim is written first so that nothing else can send the same
 * notification while this one is in flight — but if the send then reaches
 * nobody at all (every device expired between the read and the write, or the
 * push service was down for all of them), leaving the row would mean the client
 * is never told, and the next tick would skip it as already sent. Deleting the
 * claim puts the notification back in the queue for the next run.
 *
 * Deliberately *not* called when a push was delivered to at least one device.
 * Partial delivery is delivery: the client has been told.
 */
export async function releasePushClaim(deliveryId: string): Promise<void> {
  await db.delete(pushDeliveries).where(eq(pushDeliveries.id, deliveryId));
}
