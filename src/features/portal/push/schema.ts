import { z } from 'zod';

import { PUSH_LOCALES } from '@/db/schema';

/**
 * Zod schemas for the two things a browser sends the server about its own push
 * subscription.
 *
 * Shape only, as in `portal/schema.ts` — whether this device belongs to the
 * caller is a question about the session, and it is answered in `actions.ts`,
 * which re-resolves the client rather than accepting an id from the payload.
 *
 * ## Why the bounds are here at all
 *
 * These three values come from the browser's push service and are written
 * straight into a table. They are not user input in the ordinary sense — nobody
 * types an endpoint — but they arrive over a public server action, so they are
 * exactly as trustworthy as anything else that does. The lengths below are
 * generous next to what real services emit (an FCM endpoint is around 200
 * characters, Apple's about 100, a `p256dh` key 87 and an `auth` secret 22) and
 * mean that a crafted post cannot use this table as free storage.
 */

/**
 * The push service URL.
 *
 * **HTTPS is required by the Push API itself**, and checking it here is what
 * keeps a crafted payload from parking an arbitrary `http://` — or worse, an
 * internal — address in the table for the server to later make requests to.
 * `web-push` would refuse to send to it, but the row would sit there being
 * counted as a device this client owns.
 */
const endpointSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => {
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'endpoint must be an https URL');

/**
 * One device registering itself.
 *
 * `locale` is the portal's own language as the client is reading it right now,
 * not a browser setting: it decides what language this device is pushed in, and
 * the client already chose that in settings. See `push_subscriptions.locale`.
 */
export const pushSubscriptionSchema = z.object({
  endpoint: endpointSchema,
  /** The device's P-256 public key, base64url. */
  p256dh: z.string().trim().min(1).max(255),
  /** The device's auth secret, base64url. */
  auth: z.string().trim().min(1).max(255),
  locale: z.enum(PUSH_LOCALES),
  /**
   * Diagnostics only, and clamped hard. It is never rendered anywhere — it
   * exists so that "notifications do not work" can be answered with "on which
   * device?" without asking the client.
   */
  userAgent: z.string().trim().max(300).optional(),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

/** One device being forgotten. The endpoint is all that identifies it. */
export const pushUnsubscribeSchema = z.object({ endpoint: endpointSchema });

export type PushUnsubscribeInput = z.infer<typeof pushUnsubscribeSchema>;
