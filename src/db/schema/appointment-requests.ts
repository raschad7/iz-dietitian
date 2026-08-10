import { check, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { MINUTES_PER_DAY } from '@/lib/time-constants';

import { appointments } from './appointments';
import { clients } from './clients';
import { clinics } from './clinics';

/**
 * Something a client asked their dietitian for from the portal: a new
 * appointment, a different time for one they have, or its cancellation.
 *
 * **Why this is not a column on `appointments`.** A request is not a booking. It
 * carries no authority over the calendar until the dietitian acts on it, and
 * `appointments` is written on the assumption that every row in it is a real,
 * agreed slot — the unique index on (client, date) and the `EXCLUDE USING gist`
 * overlap constraint both say so. Writing pending rows there would mean a client
 * could block a slot, or their own day, simply by asking for it. Two people may
 * legitimately request the same time; only one of them can be booked into it.
 *
 * So a request is an inbox item. Approving one is a booking written through the
 * ordinary path in `src/features/booking/`, where every rule is applied against
 * the calendar as it stands at that moment — not as it stood when the client
 * asked.
 *
 * Enum-like columns are `text` validated by Zod, following `clients.status`.
 */
export const appointmentRequests = pgTable(
  'appointment_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * The tenant boundary, denormalised from the client for the same reason
     * `meal_plans.clinic_id` is: the dietitian's inbox reads "this clinic, still
     * pending", and that filter must not depend on a join staying correct.
     */
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),

    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),

    /**
     * The appointment this is about — required for `reschedule` and `cancel`,
     * null for `new`. Cascades: a request to move an appointment that no longer
     * exists is not a record worth keeping.
     */
    appointmentId: uuid('appointment_id').references(() => appointments.id, { onDelete: 'cascade' }),

    /** new | reschedule | cancel */
    kind: text('kind').notNull(),

    /**
     * What the client is asking for, as a clinic-local wall clock — the same
     * date + minute-offset pair as `appointments`, and for the same reasons (see
     * that table).
     *
     * Null for a `cancel`, which proposes no time, and null for every `new`
     * request filed since the portal stopped asking for one: a client now
     * writes a note and the dietitian decides when to see them. Rows filed
     * before that still carry a date and a minute, and the staff inbox still
     * renders — and still answers — them.
     */
    preferredDate: date('preferred_date', { mode: 'string' }),
    preferredStartMinute: integer('preferred_start_minute'),

    /**
     * The client's own words. Optional against the column, because a
     * `reschedule` or a `cancel` is complete without one — but a `new` request
     * that proposes no time is nothing *but* this, and the check below says so.
     */
    note: text('note'),

    /** pending | approved | declined | withdrawn */
    status: text('status').notNull().default('pending'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The dietitian's inbox: one clinic, oldest pending first.
    index('appointment_requests_clinic_id_status_idx').on(table.clinicId, table.status, table.createdAt),
    // The portal's own list: one client, newest first.
    index('appointment_requests_client_id_idx').on(table.clientId, table.createdAt),

    /**
     * One open request per appointment. Without it, a client who taps "cancel"
     * twice puts two identical items in the dietitian's inbox, and approving the
     * second one acts on an appointment the first one already removed.
     *
     * Partial, so the many resolved requests against one appointment — and the
     * `new` requests, which have no appointment at all — are unconstrained.
     */
    uniqueIndex('appointment_requests_open_per_appointment_idx')
      .on(table.appointmentId)
      .where(sql`status = 'pending' AND appointment_id IS NOT NULL`),

    check('appointment_requests_kind', sql`${table.kind} IN ('new', 'reschedule', 'cancel')`),
    check(
      'appointment_requests_status',
      sql`${table.status} IN ('pending', 'approved', 'declined', 'withdrawn')`,
    ),

    // A `new` request names no appointment; the other two are meaningless
    // without one. Enforced here because both halves of the row are written by
    // the same statement, so there is no window in which one is legitimately absent.
    check(
      'appointment_requests_appointment_matches_kind',
      sql`(${table.kind} = 'new') = (${table.appointmentId} IS NULL)`,
    ),

    /**
     * Which kinds may propose a time, and which must.
     *
     * `cancel` proposes none. `reschedule` is meaningless without a whole one —
     * it exists to name a different hour. `new` may go either way: the portal
     * files it as a note with no time at all, and the rows filed before that
     * carry both halves. What it may never be is half a time, which is the
     * pairing this still enforces on it.
     */
    check(
      'appointment_requests_preferred_matches_kind',
      sql`CASE ${table.kind}
        WHEN 'cancel' THEN ${table.preferredDate} IS NULL AND ${table.preferredStartMinute} IS NULL
        WHEN 'reschedule' THEN ${table.preferredDate} IS NOT NULL AND ${table.preferredStartMinute} IS NOT NULL
        ELSE (${table.preferredDate} IS NULL) = (${table.preferredStartMinute} IS NULL)
      END`,
    ),

    /**
     * A `new` request that names no time has to carry a note.
     *
     * It is the entire request — the client wrote to their dietitian and there
     * is nothing else in the row. Without this a blank one would be an inbox
     * item that says only that somebody tapped a button.
     */
    check(
      'appointment_requests_note_when_no_time',
      sql`${table.kind} <> 'new' OR ${table.preferredDate} IS NOT NULL OR ${table.note} IS NOT NULL`,
    ),

    // Same bound as `appointments.start_minute`; `sql.raw` for the same reason —
    // an interpolated number would be bound as a `$1` placeholder inside DDL.
    check(
      'appointment_requests_start_minute_in_day',
      sql`${table.preferredStartMinute} IS NULL OR (${table.preferredStartMinute} >= 0 AND ${table.preferredStartMinute} < ${sql.raw(String(MINUTES_PER_DAY))})`,
    ),
  ],
);

export type AppointmentRequest = typeof appointmentRequests.$inferSelect;
export type NewAppointmentRequest = typeof appointmentRequests.$inferInsert;
