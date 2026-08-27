import { type PushKind } from '@/db/schema';

/**
 * Plain data shapes for Web Push.
 *
 * Free of anything that would reach the database or the `web-push` package, so
 * the service worker's payload contract and the client-side subscribe flow can
 * both name these types without dragging a Node module into a browser bundle —
 * the same rule `src/features/portal/types.ts` and `booking/types.ts` follow.
 */

export type { PushKind };

/**
 * What is actually delivered to the device: the JSON body the service worker's
 * `push` handler parses and hands to `showNotification`.
 *
 * **This is a contract with `public/portal-sw.js`, and it is duplicated there
 * on purpose.** A service worker is a static file with no build step, so it
 * cannot import this type; what it can do is read these five fields
 * defensively, which is what it does. Anything added here has to be added there
 * — and, because an old worker keeps serving until it updates, has to be
 * optional on arrival.
 *
 * It is deliberately small. A notification is a sentence and a destination, not
 * a screen: everything else the client might want to know is behind `url`,
 * where it is rendered by the app with the client's session behind it. Nothing
 * clinical goes in a payload — a push is decrypted by the browser and drawn on
 * a lock screen, which is the one surface in this product a stranger can read.
 */
export type PushPayload = {
  title: string;
  body: string;
  /**
   * Where tapping it goes — an app-relative path *including* the locale prefix
   * (`/ar/portal/appointments`), because `routing.localePrefix` is `'always'`
   * and the worker turns this into an absolute URL against its own origin.
   */
  url: string;
  /**
   * Collapse key. Two notifications with the same tag replace each other on the
   * device rather than stacking, which is what stops a client who has not
   * opened their phone all day from finding four copies of the same reminder.
   */
  tag: string;
  /** Why it was sent. Carried through so the worker can log and group by it. */
  kind: PushKind;
};

/**
 * One device, as the send path needs it.
 *
 * Exactly the shape `web-push` calls a `PushSubscription`, plus the two columns
 * that decide what is sent to it and how it is written. The row's other fields
 * (`user_agent`, the timestamps) are diagnostics and never reach a send.
 */
export type PushTarget = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  locale: 'ar' | 'en';
};

/**
 * What one `sendWebPush` call did, per client.
 *
 * A summary rather than a throw, for `SendResult`'s reason in the WhatsApp
 * feature: the caller is a server action that has already done the thing worth
 * doing (published a plan, answered a request), and it must not fail because a
 * push service was slow.
 *
 * `skipped` carries *why*, because the three reasons are three different
 * conversations: `not_configured` is a deployment, `no_consent` is the client's
 * own choice, `no_devices` means nobody switched it on, and `duplicate` means
 * the dedupe row was already there — which is the tick working, not a fault.
 */
export type PushSendResult =
  | { status: 'sent'; delivered: number; removed: number; failed: number }
  | {
      status: 'skipped';
      reason: 'not_configured' | 'no_consent' | 'no_devices' | 'duplicate';
    };

/** What a whole reminder run did. Mirrors `ReminderRunSummary` in the WhatsApp feature. */
export type PushRunSummary = {
  /** Clients considered — one per due appointment, or per un-logged day. */
  candidates: number;
  sent: number;
  skipped: number;
  failed: number;
  /** Subscriptions deleted because the push service said they were gone. */
  removed: number;
};
