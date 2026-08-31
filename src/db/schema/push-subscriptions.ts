import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { clients } from './clients';

/**
 * Storage for Web Push (`src/features/portal/push/`).
 *
 * The portal is an installed PWA, and this is what lets it reach a client whose
 * phone is in their pocket. Two tables, and each answers a question the other
 * cannot:
 *
 *  - `push_subscriptions` — the *devices* a client has switched notifications on
 *    for. One row per browser profile per install, written by the client
 *    themselves from the notifications screen.
 *  - `push_deliveries` — what has already been pushed, so the reminder tick can
 *    run every five minutes without telling anyone the same thing twice.
 *
 * **There is no notification table, and this is not one.** The in-app feed
 * behind the bell is still derived at request time from the records it reports
 * on (`src/features/portal/notifications.ts`), and nothing here changes that.
 * These two tables are about *delivery* — where a message can be sent, and
 * whether it already was — which is exactly the split `whatsapp_messages` makes
 * against the same feed.
 *
 * ## Why the endpoint is the identity
 *
 * A push subscription is a URL the push service (FCM for Chrome, Apple's own
 * for Safari) hands the browser, plus two keys the payload is encrypted
 * against. That URL *is* the device as far as this app is concerned: it is
 * unique per browser profile per install, the browser reissues it if it ever
 * rotates, and it is the only thing the sender addresses. So it carries the
 * unique index, and re-subscribing the same device — a new sign-in, a shared
 * phone, a client who switched notifications off and on again — updates the
 * row rather than adding a second one that would deliver every message twice.
 *
 * ⚠ **The keys in `p256dh` and `auth` are not credentials of ours.** They are
 * the browser's own public key and an authentication secret, both generated on
 * the device, and they are useless without the endpoint. They are stored
 * because `web-push` needs all three to encrypt a payload; nothing else may read
 * them, and no query outside `src/features/portal/push/` should touch this
 * table.
 */

/** Locales a device can be pushed in — the app's own two. See `src/i18n/routing.ts`. */
export const PUSH_LOCALES = ['ar', 'en'] as const;

export type PushLocale = (typeof PUSH_LOCALES)[number];

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * Whose device this is.
     *
     * `cascade`, unlike `whatsapp_messages.client_id`, which is `set null` so
     * the clinic keeps a record of what it told someone. This is not a record
     * of anything — a subscription belonging to nobody is an address the app
     * would have no reason and no right to send to, so it goes with the client.
     */
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),

    /** The push service URL. See the note above on why this is the identity. */
    endpoint: text('endpoint').notNull(),

    /** The device's public key (P-256, base64url), for payload encryption. */
    p256dh: text('p256dh').notNull(),

    /** The device's auth secret (base64url), for payload encryption. */
    auth: text('auth').notNull(),

    /**
     * Which language to push this device in.
     *
     * A property of the *device*, not of the client, and captured at subscribe
     * time from the portal the client was reading. It has to live here because
     * the message is rendered without a request behind it — a cron tick has no
     * locale — and because a household sharing an account can honestly want two
     * different answers.
     */
    locale: text('locale').notNull().default('ar'),

    /**
     * What the browser called itself when it subscribed. Diagnostics only: it
     * is the difference between "notifications are broken" and "notifications
     * are broken on the one iPhone that never finished installing the app".
     */
    userAgent: text('user_agent'),

    /** When a push to this endpoint last succeeded. Null until the first one. */
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),

    /**
     * Why the last attempt failed, verbatim from the push service. Null on
     * success. A permanently dead endpoint is deleted rather than recorded here
     * — see `sendWebPush`, which treats 404 and 410 as "this device is gone".
     */
    lastError: text('last_error'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One row per device. The upsert in `savePushSubscription` targets this.
    uniqueIndex('push_subscriptions_endpoint_idx').on(table.endpoint),

    // The send path's only read: every device belonging to one client.
    index('push_subscriptions_client_id_idx').on(table.clientId),

    check('push_subscriptions_locale', sql`${table.locale} IN ('ar', 'en')`),
  ],
);

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscriptionRow = typeof pushSubscriptions.$inferInsert;

/**
 * Why a notification was sent. Matches the four consent flags on
 * `client_settings` one-for-one, which is what makes "did the client agree to
 * this?" a lookup rather than a judgement — see `pushConsentColumn`.
 */
export const PUSH_KINDS = [
  'appointment_reminder',
  'check_in_reminder',
  'plan_update',
  'clinic_message',
] as const;

export type PushKind = (typeof PUSH_KINDS)[number];

/**
 * Every push already sent, keyed so it is never sent twice.
 *
 * **This table exists for the reminder tick, and the reasoning is
 * `whatsapp_messages`' exactly.** The tick is expected to run every few minutes
 * over a window that overlaps the last run's, because a missed tick must not
 * mean a missed reminder — and a notification, like a WhatsApp message, cannot
 * be taken back. The insert against the unique `(client_id, dedupe_key)` is the
 * lock: it happens *before* the push service is called, so a second tick, a
 * retry, or a second instance loses the insert and never reaches the network.
 *
 * The key is deterministic per event: `reminder:<appointmentId>:<date>`,
 * `checkin:<date>`, `plan:<weekStartDate>`, `request:<requestId>:<status>`. One
 * row per client per event — **not per device**, which is the point: a client
 * with a phone and a tablet is told once, on both.
 *
 * Rows are small and are kept: they are the only record that a client was told
 * something, and the volume is a handful per client per week. `created_at`
 * carries an index so a future prune ("delete anything older than 90 days") is
 * a cheap range scan rather than a sequential one.
 */
export const pushDeliveries = pgTable(
  'push_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),

    /** See {@link PUSH_KINDS}. Plain `text` guarded by a check, like `clients.goal`. */
    kind: text('kind').notNull(),

    /** The idempotency anchor. See the note above the table. */
    dedupeKey: text('dedupe_key').notNull(),

    /**
     * How many devices the payload actually reached. Zero is a legitimate
     * outcome — every subscription expired — and recording it is what tells a
     * silent phone apart from a notification that was never attempted.
     */
    deliveredCount: integer('delivered_count').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The idempotency guarantee. Scoped to the client, so two clients reminded
    // about their own appointments never collide.
    uniqueIndex('push_deliveries_client_id_dedupe_key_idx').on(table.clientId, table.dedupeKey),

    index('push_deliveries_created_at_idx').on(table.createdAt),

    check(
      'push_deliveries_kind',
      sql`${table.kind} IN ('appointment_reminder', 'check_in_reminder', 'plan_update', 'clinic_message')`,
    ),
  ],
);

export type PushDelivery = typeof pushDeliveries.$inferSelect;
export type NewPushDelivery = typeof pushDeliveries.$inferInsert;
