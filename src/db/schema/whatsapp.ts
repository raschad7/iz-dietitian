import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { appointments } from './appointments';
import { clients } from './clients';
import { clinics } from './clinics';

/**
 * Storage for the WhatsApp automation (`src/features/whatsapp/`).
 *
 * The clinic talks to WhatsApp through a **self-hosted OpenWA gateway** — a
 * separate process that owns the WhatsApp connection itself (see
 * `infra/openwa/`). Nothing about the WhatsApp protocol lives in this app; these
 * two tables record only what this app must remember between requests:
 *
 *  - `whatsapp_settings` — which gateway session belongs to this clinic, what
 *    the gateway last told us about it, and which automations the clinic wants.
 *  - `whatsapp_messages` — every message we sent or received, which is both the
 *    audit trail staff read and, through `dedupe_key`, the thing that stops an
 *    automation from sending twice.
 *
 * Enum-like columns are `text` validated by Zod rather than `pgEnum`, following
 * the precedent set by `clients.goal` and `users.role`: adding a message kind
 * should be a code change, not a migration.
 */

/** Statuses the gateway reports for a session. Mirrored, never invented here. */
export const WHATSAPP_STATUSES = [
  'not_connected',
  'created',
  'initializing',
  'qr_ready',
  'authenticating',
  'ready',
  'disconnected',
  'action_required',
  'failed',
] as const;

export type WhatsappStatus = (typeof WHATSAPP_STATUSES)[number];

/**
 * One gateway session per clinic — the tenant boundary, same as everywhere else.
 *
 * A row exists only once a dietitian has asked to connect WhatsApp; its absence
 * is the "not set up" state, so nothing needs a nullable "enabled" flag to mean
 * the same thing.
 */
export const whatsappSettings = pgTable(
  'whatsapp_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),

    /**
     * The session's name on the gateway. Derived from the clinic id
     * (`clinic-<uuid>`) rather than chosen by staff: the gateway enforces
     * uniqueness on it, and a name a human picked could collide with another
     * clinic's on a shared gateway.
     */
    sessionName: text('session_name').notNull(),

    /**
     * The id the gateway assigned. Distinct from `session_name` — the gateway
     * generates its own id and every one of its endpoints is keyed by that, so
     * this is the value the API client actually uses. Null until the session has
     * been created there.
     */
    sessionId: text('session_id'),

    /**
     * The gateway-side webhook row that points back at
     * `/api/whatsapp/webhook`. Stored so re-connecting updates that webhook
     * instead of registering a second one that would deliver every event twice.
     */
    webhookId: text('webhook_id'),

    /** Last status the gateway reported. See {@link WHATSAPP_STATUSES}. */
    status: text('status').notNull().default('not_connected'),

    /** The connected WhatsApp number, as the gateway reports it. Digits only. */
    phone: text('phone'),

    /** Last failure from the gateway, shown to staff so a break is visible. */
    lastError: text('last_error'),

    /** Send appointment reminders on the schedule below. */
    remindersEnabled: boolean('reminders_enabled').notNull().default(true),

    /**
     * How long before an appointment its reminder goes out.
     *
     * **One day, for everybody.** The clinic asked for a single, predictable
     * rule, so nothing writes this column — there is no picker in the UI and the
     * automation form has no field for it. It stays a column rather than becoming
     * a constant because the reminder run reads it (see `reminders.ts`), which
     * means a clinic that ever wants a different lead is an `UPDATE`, not a
     * deploy, and the value in force is visible in the row instead of buried in
     * code.
     *
     * The check constraint keeps it inside a quarter of an hour and a week —
     * outside that range a "reminder" is something else.
     */
    reminderLeadMinutes: integer('reminder_lead_minutes').notNull().default(24 * 60),

    /**
     * Send a confirmation the moment an appointment is booked.
     *
     * A move is **not** this switch — see {@link reschedulesEnabled} — and
     * neither is a cancellation; see {@link cancellationsEnabled}.
     */
    confirmationsEnabled: boolean('confirmations_enabled').notNull().default(true),

    /**
     * Tell the patient when their appointment moves to another day or time.
     *
     * Split out of `confirmations_enabled`, which used to mean both. They are
     * one message to the code and two decisions to a clinic: a booking is news
     * the patient asked for, and a move is often the clinic rearranging its own
     * diary after agreeing the new time by phone — at which point the automatic
     * notice arrives as a second, colder copy of a conversation already had.
     *
     * Defaults to on, so a clinic that had confirmations on keeps being told
     * about moves exactly as it was.
     */
    reschedulesEnabled: boolean('reschedules_enabled').notNull().default(true),

    /**
     * Tell the patient when their appointment is deleted.
     *
     * Its own column rather than a third meaning for `confirmations_enabled`,
     * because it is the one automatic message a clinic may reasonably want off
     * while keeping the others: a booking and a move are news the patient asked
     * for, and a cancellation is sometimes the clinic tidying its own diary. A
     * clinic that deletes and rebooks by phone does not want the patient told
     * twice, by a machine, in the wrong order.
     *
     * Defaults to on, so an existing row keeps behaving exactly as it did
     * before this column existed.
     *
     * ⚠ A slot already in the past sends nothing whatever this says. That rule
     * is about truthfulness rather than preference and lives in
     * `notifyAppointmentCancelled`.
     */
    cancellationsEnabled: boolean('cancellations_enabled').notNull().default(true),

    /**
     * Let staff send a patient a reminder of what is outstanding on their
     * account.
     *
     * ⚠ Not automatic, unlike everything else on this switchboard: nothing sends
     * it on a schedule or in response to a booking — somebody chooses it, on a
     * subscriber's own row in Bills. The switch is what decides whether that
     * choice is offered at all, which is the question a clinic that does not
     * chase money by message wants to answer once rather than every month.
     */
    paymentRemindersEnabled: boolean('payment_reminders_enabled').notNull().default(true),

    /** When the gateway last reported `ready` for this session. */
    connectedAt: timestamp('connected_at', { withTimezone: true }),

    /** When this row was last reconciled against the gateway. */
    syncedAt: timestamp('synced_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One connection per clinic. Two would mean two numbers claiming to be the
    // clinic, and no way for an inbound message to know which thread it joins.
    uniqueIndex('whatsapp_settings_clinic_id_idx').on(table.clinicId),
    // A gateway session belongs to exactly one clinic. This is the index the
    // webhook route reads: an event names a session, and this maps it to a tenant.
    uniqueIndex('whatsapp_settings_session_name_idx').on(table.sessionName),
    uniqueIndex('whatsapp_settings_session_id_idx').on(table.sessionId),

    check(
      'whatsapp_settings_reminder_lead_minutes_range',
      sql`${table.reminderLeadMinutes} >= 15 AND ${table.reminderLeadMinutes} <= 10080`,
    ),
  ],
);

export type WhatsappSettings = typeof whatsappSettings.$inferSelect;
export type NewWhatsappSettings = typeof whatsappSettings.$inferInsert;

/** Who sent it. Outbound is this app; inbound is the client replying. */
export const WHATSAPP_DIRECTIONS = ['outbound', 'inbound'] as const;

/** Why it was sent. `manual` is a dietitian typing; the rest are automations. */
export const WHATSAPP_MESSAGE_KINDS = [
  'appointment_reminder',
  'appointment_confirmation',
  'appointment_rescheduled',
  'appointment_cancelled',
  'portal_credentials',
  'manual',
  'inbound',
] as const;

/**
 * Delivery state, in the order it advances. Position in this array is the rank:
 * `sent` may become `delivered`, never the other way round (see
 * `applyDeliveryStatus` in `src/features/whatsapp/mutations.ts`).
 */
export const WHATSAPP_MESSAGE_STATUSES = ['queued', 'sent', 'delivered', 'read', 'failed', 'received'] as const;

export type WhatsappDirection = (typeof WHATSAPP_DIRECTIONS)[number];
export type WhatsappMessageKind = (typeof WHATSAPP_MESSAGE_KINDS)[number];
export type WhatsappMessageStatus = (typeof WHATSAPP_MESSAGE_STATUSES)[number];

/**
 * Every WhatsApp message this clinic sent or received.
 *
 * **`dedupe_key` is the point of this table, not `body`.** WhatsApp has no
 * "unsend", so an automation that sends twice cannot be taken back — and the
 * reminder job is expected to run repeatedly (every few minutes, from a cron)
 * over an overlapping window. The unique index on `(clinic_id, dedupe_key)`
 * makes the insert itself the lock: the row is written *before* the gateway is
 * called, and a second attempt for the same appointment loses the insert and
 * never reaches the network. The key is deterministic for automations
 * (`reminder:<appointmentId>:<date>`) and random for a manual send, where
 * repeating on purpose is the whole intent.
 *
 * Rows outlive what they refer to: deleting a client or an appointment nulls the
 * reference rather than removing the message, because "what did we tell this
 * person" is a record the clinic keeps.
 */
export const whatsappMessages = pgTable(
  'whatsapp_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),

    /** Null for an inbound message from a number no client owns. */
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),

    /** Set for the two appointment automations; null for everything else. */
    appointmentId: uuid('appointment_id').references(() => appointments.id, { onDelete: 'set null' }),

    direction: text('direction').notNull(),
    kind: text('kind').notNull(),

    /** The gateway's chat id — `<digits>@c.us` for an individual. */
    chatId: text('chat_id').notNull(),

    /** E.164 digits without `+`, as sent. Kept beside `chat_id` for searching. */
    phone: text('phone').notNull(),

    body: text('body').notNull(),

    status: text('status').notNull().default('queued'),

    /** The gateway's message id, once it accepted the send. Acks arrive by it. */
    gatewayMessageId: text('gateway_message_id'),

    /** Why the send failed, verbatim from the gateway. Null on success. */
    error: text('error'),

    /** See the note above the table. */
    dedupeKey: text('dedupe_key').notNull(),

    /** When the gateway accepted it — not when it was delivered. */
    sentAt: timestamp('sent_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The idempotency guarantee. Scoped to the clinic so two clinics reminding
    // about their own appointments never collide.
    uniqueIndex('whatsapp_messages_clinic_id_dedupe_key_idx').on(table.clinicId, table.dedupeKey),

    // The log view: this clinic, newest first.
    index('whatsapp_messages_clinic_id_created_at_idx').on(table.clinicId, table.createdAt),
    // One client's thread.
    index('whatsapp_messages_client_id_created_at_idx').on(table.clientId, table.createdAt),
    // Delivery receipts arrive naming a gateway message id and nothing else.
    index('whatsapp_messages_gateway_message_id_idx').on(table.gatewayMessageId),
  ],
);

export type WhatsappMessage = typeof whatsappMessages.$inferSelect;
export type NewWhatsappMessage = typeof whatsappMessages.$inferInsert;
