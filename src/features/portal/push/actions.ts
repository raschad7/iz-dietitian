'use server';

import { localeSchema } from '@/features/portal/schema';
import { requirePortalClient } from '@/features/portal/session';
import { type PortalResult } from '@/features/portal/types';

import { deletePushSubscription, savePushSubscription } from './mutations';
import { pushSubscriptionSchema, pushUnsubscribeSchema } from './schema';

/**
 * The two writes behind the "notifications on this device" switch.
 *
 * A server action is a public endpoint: the layout guard protects the render,
 * never the write. So both of these re-resolve the client from the session and
 * never accept a client id from the payload, exactly as every action in
 * `portal/actions.ts` does — and the delete proves ownership again in its own
 * `WHERE` clause rather than trusting the endpoint it was handed.
 *
 * Called directly rather than through a `<form action>`, like
 * `toggleMealCompletionAction`: the caller is a hook that has just been handed
 * a `PushSubscription` object by the browser, there is no form for it to live
 * in, and the result is needed back to decide what the switch shows.
 *
 * **Neither revalidates anything.** Nothing rendered on any portal screen is
 * derived from these rows — the switch's own state is read from the browser's
 * `pushManager`, which is the authority on whether *this* device is subscribed
 * — so a `revalidatePath` here would re-render the settings screen to produce
 * exactly what it already showed.
 */

/**
 * Registers this device, so the clinic's events can reach it.
 *
 * The client will already have granted notification permission by the time this
 * is called: the browser refuses to hand over a subscription otherwise, so
 * there is no state where a row exists for a device that never agreed. Consent
 * for *what* may be sent is a separate, older thing and stays where it was — the
 * four switches on this same screen, which gate both this channel and WhatsApp.
 */
export async function subscribeToPushAction(input: {
  locale: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}): Promise<PortalResult> {
  const locale = localeSchema.parse(input.locale);
  const { id: clientId } = await requirePortalClient(locale);

  const parsed = pushSubscriptionSchema.safeParse({
    endpoint: input.endpoint,
    p256dh: input.p256dh,
    auth: input.auth,
    locale,
    userAgent: input.userAgent,
  });

  if (!parsed.success) return { ok: false, error: 'errors.invalid' };

  try {
    await savePushSubscription({
      clientId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.p256dh,
      auth: parsed.data.auth,
      locale: parsed.data.locale,
      userAgent: parsed.data.userAgent ?? null,
    });
  } catch (error) {
    console.error('[push] saving a subscription failed', error);
    return { ok: false, error: 'errors.unexpected' };
  }

  return { ok: true, data: undefined };
}

/**
 * Forgets this device.
 *
 * The browser-side unsubscribe happens first, in the hook — if it fails, this
 * is never called, because a row deleted while the device is still subscribed
 * would leave a phone that can no longer be reached *and* no record of it. The
 * reverse order is recoverable: a row whose device has unsubscribed is deleted
 * by the send path the first time the push service answers 410.
 */
export async function unsubscribeFromPushAction(input: {
  locale: string;
  endpoint: string;
}): Promise<PortalResult> {
  const locale = localeSchema.parse(input.locale);
  const { id: clientId } = await requirePortalClient(locale);

  const parsed = pushUnsubscribeSchema.safeParse({ endpoint: input.endpoint });
  if (!parsed.success) return { ok: false, error: 'errors.invalid' };

  try {
    await deletePushSubscription(clientId, parsed.data.endpoint);
  } catch (error) {
    console.error('[push] deleting a subscription failed', error);
    return { ok: false, error: 'errors.unexpected' };
  }

  return { ok: true, data: undefined };
}
