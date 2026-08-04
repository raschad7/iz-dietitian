import { boolean, check, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { clients } from './clients';

/**
 * The account settings a client owns outright.
 *
 * **Why a table and not more columns on `clients`.** `clients` is a clinical
 * record the dietitian writes; every column on it answers to the clinic. These
 * answer to the client, and nobody at the clinic may change them. Keeping the
 * two owners in two tables is what makes "the client can edit this" checkable
 * by looking at which table a write touches, rather than by reading a comment.
 *
 * One row per client, created lazily the first time a setting is saved — the
 * same pattern as `client_nutrition_profiles`, so every existing client is
 * valid with no backfill. `defaultClientSettings` below is what a client with
 * no row reads as, and the column defaults match it exactly.
 *
 * Deliberately no clinic id. Every other table in this schema carries one as
 * the tenant boundary; this one has nothing a clinic-scoped query would ever
 * want, and adding it would imply staff read these.
 *
 * **Where the allowed values live.** `THEME_PREFERENCES` and `CONTACT_METHODS`
 * are declared in `src/features/portal/types.ts`, not here, and the check
 * constraints below restate them as SQL literals. That is the same split
 * `appointment_requests` uses for its `kind` and `status`: the unions are read
 * by client components, and importing them from this barrel would pull
 * drizzle's pg-core into the browser bundle under `verbatimModuleSyntax`.
 */

export const clientSettings = pgTable(
  'client_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),

    /**
     * What the clinic may send. All four default on: a client who has just been
     * given portal access is expecting to hear about their appointments, and a
     * silent app they have to go and switch on is the worse first week.
     *
     * These are consent, not routing — which channel a message goes out on is
     * the clinic's own WhatsApp configuration. A false here means the message is
     * not sent, on any channel.
     */
    notifyAppointmentReminder: boolean('notify_appointment_reminder').notNull().default(true),
    notifyCheckInReminder: boolean('notify_check_in_reminder').notNull().default(true),
    notifyPlanUpdate: boolean('notify_plan_update').notNull().default(true),
    notifyClinicMessage: boolean('notify_clinic_message').notNull().default(true),

    /**
     * `system` | `light` | `dark`. Default `system` because a client opening
     * this app at 6am and at 11pm is the same person in two different rooms,
     * and the phone already knows which.
     */
    theme: text('theme').notNull().default('system'),

    /** `whatsapp` | `phone` | `email` — how the client would rather be reached. */
    preferredContact: text('preferred_contact').notNull().default('whatsapp'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One row per client, enforced here and not only in the upsert that writes it.
    uniqueIndex('client_settings_client_id_idx').on(table.clientId),

    // The columns are plain `text` following `clients.status`, so the union is
    // held by the database as well as by Zod — a value the UI has no branch for
    // would otherwise render as a missing translation key.
    check('client_settings_theme', sql`${table.theme} IN ('system', 'light', 'dark')`),
    check(
      'client_settings_preferred_contact',
      sql`${table.preferredContact} IN ('whatsapp', 'phone', 'email')`,
    ),
  ],
);

export type ClientSettings = typeof clientSettings.$inferSelect;
export type NewClientSettings = typeof clientSettings.$inferInsert;

/**
 * What a client with no row reads as.
 *
 * Kept beside the columns so the two cannot drift: a default changed in one
 * place and not the other would make a client's settings appear to change the
 * moment they first saved an unrelated one.
 */
export const defaultClientSettings = {
  notifyAppointmentReminder: true,
  notifyCheckInReminder: true,
  notifyPlanUpdate: true,
  notifyClinicMessage: true,
  theme: 'system',
  preferredContact: 'whatsapp',
} as const;
