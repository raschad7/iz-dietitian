import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { clients } from './clients';
import { clinics } from './clinics';

/**
 * Something the client has asked the clinic to do about their own record.
 *
 * Two kinds today: correct a detail that is wrong, and close the account.
 *
 * **Why asking is the whole mechanism.** The client's profile is a clinical
 * record their dietitian wrote and works from. A client who edits their own
 * height silently invalidates the calorie target computed from it, and one who
 * deletes their own account takes appointment history the clinic is obliged to
 * keep. So neither is a write the client performs — both are a row in this
 * table, and a person at the clinic acts on it. The screen that files one says
 * so plainly rather than presenting a control that appears to edit and does not.
 *
 * The shape is `appointment_requests` again, for the same reasons that table
 * gives: a request carries no authority until someone acts on it, so it lives
 * beside the record rather than inside it.
 *
 * **Where the allowed values live.** `CLIENT_REQUEST_KINDS`, `_TOPICS` and
 * `_STATUSES` are declared in `src/features/portal/types.ts`, and the check
 * constraints below restate them as SQL literals — the same split
 * `appointment_requests` uses, and for the same reason: client components read
 * those unions, and importing them from this barrel would drag drizzle's
 * pg-core into the browser bundle under `verbatimModuleSyntax`.
 */

export const clientRequests = pgTable(
  'client_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** The tenant boundary, denormalised from the client — as in `appointment_requests`. */
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),

    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),

    /** `data_update` | `account_deletion`. */
    kind: text('kind').notNull(),

    /**
     * Which part of the profile a `data_update` is about — `basic` | `health` |
     * `contact` | `other`; null for a deletion. It is what lets staff route an
     * inbox item without reading it, and the screen the client tapped from
     * fills it in rather than asking them to classify their own problem.
     */
    topic: text('topic'),

    /**
     * The client's own words. Required for a correction — a request that does
     * not say what is wrong is an inbox item nobody can act on — and optional
     * for a deletion, where the ask is complete without a reason.
     */
    message: text('message'),

    /** `pending` | `resolved` | `declined` | `withdrawn`. */
    status: text('status').notNull().default('pending'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The clinic's inbox: one clinic, oldest pending first.
    index('client_requests_clinic_id_status_idx').on(table.clinicId, table.status, table.createdAt),
    // The client's own view: their requests, newest first.
    index('client_requests_client_id_idx').on(table.clientId, table.createdAt),

    /**
     * One open request of each kind per client.
     *
     * A correction and a deletion are independent asks, so both may be waiting
     * at once; a second copy of either is not a new fact, it is the same client
     * tapping twice. Partial, so the resolved history is unconstrained.
     */
    uniqueIndex('client_requests_open_per_kind_idx')
      .on(table.clientId, table.kind)
      .where(sql`status = 'pending'`),

    check('client_requests_kind', sql`${table.kind} IN ('data_update', 'account_deletion')`),
    check(
      'client_requests_status',
      sql`${table.status} IN ('pending', 'resolved', 'declined', 'withdrawn')`,
    ),

    // A topic belongs to a correction and to nothing else, and a correction
    // without one is an item the inbox cannot route. Both halves are written by
    // the same statement, so there is no window in which one is legitimately absent.
    check(
      'client_requests_topic_matches_kind',
      sql`(${table.kind} = 'data_update') = (${table.topic} IS NOT NULL)`,
    ),
    check(
      'client_requests_topic',
      sql`${table.topic} IS NULL OR ${table.topic} IN ('basic', 'health', 'contact', 'other')`,
    ),

    // A correction has to say what is wrong.
    check(
      'client_requests_message_required',
      sql`${table.kind} <> 'data_update' OR (${table.message} IS NOT NULL AND length(btrim(${table.message})) > 0)`,
    ),
  ],
);

export type ClientRequest = typeof clientRequests.$inferSelect;
export type NewClientRequest = typeof clientRequests.$inferInsert;
