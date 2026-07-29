import { check, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { MINUTES_PER_DAY, SLOT_MINUTES } from '@/lib/time-constants';

import { clients } from './clients';
import { clinics } from './clinics';
import { practitioners } from './practitioners';

/**
 * One booking, on one clinic-local calendar day.
 *
 * **Why a `date` plus a minute offset, and not a `timestamptz`.** A clinic's day
 * is a wall-clock fact: the 09:00 slot is 09:00 whether or not the country moved
 * its clocks last night. Storing the instant would make every DST transition
 * shift an existing appointment by an hour, and would turn "everything on
 * Tuesday" — the single query this whole feature runs — into a time-zone
 * conversion instead of `WHERE date = '…'`.
 *
 * The trade-off, agreed before this table was written: appointments are
 * clinic-local and are *not* timezone-aware. Booking a remote consultation for a
 * client in another zone would need a second column naming that zone and a
 * conversion at render time.
 *
 * ## Constraints
 *
 * Two rules are enforced here rather than only in `validateBooking`, because two
 * staff members booking the same slot at the same moment is an everyday race,
 * not an exception:
 *
 *  - **One booking per client per day** — the unique index below. `client_id` is
 *    `NOT NULL` (nothing is written until a client is chosen), so it needs no
 *    `WHERE` clause to be correct.
 *  - **No overlapping appointments for one practitioner** — an `EXCLUDE USING
 *    gist` constraint, added by `drizzle/0006_booking_overlap_exclusion.sql`. Drizzle's
 *    pg-core has no `EXCLUDE` builder, so that one migration is written by hand
 *    via `drizzle-kit generate --custom`. drizzle-kit compares against its own
 *    snapshots in `drizzle/meta/`, never the live database, so a constraint it
 *    has never seen is never dropped — but it also will not recreate it, so
 *    `db:reset` replays that migration like any other. Do not delete it.
 */
export const appointments = pgTable(
  'appointments',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * Denormalised from the practitioner deliberately. Every calendar read is
     * "this clinic, this date range"; without it that is a join on every query,
     * and the tenant filter would depend on a join staying correct.
     */
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),

    practitionerId: uuid('practitioner_id')
      .notNull()
      .references(() => practitioners.id, { onDelete: 'cascade' }),

    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),

    /** A clinic-local calendar date, read as a `YYYY-MM-DD` string. */
    date: date('date', { mode: 'string' }).notNull(),

    /** Minutes from local midnight. 09:15 is 555. */
    startMinute: integer('start_minute').notNull(),

    durationMinutes: integer('duration_minutes').notNull(),

    /** Free text. No default, and none in the seed either — an empty field. */
    reason: text('reason'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Rule 5, at the database level: one booking per client per day, whichever
    // practitioner and whatever time.
    uniqueIndex('appointments_client_id_date_idx').on(table.clientId, table.date),

    // The index every calendar read uses: one clinic, one day or one week.
    index('appointments_clinic_id_date_idx').on(table.clinicId, table.date),
    // Backs the per-practitioner overlap read inside the write transaction.
    index('appointments_practitioner_id_date_idx').on(table.practitionerId, table.date),

    // `sql.raw`, not a bare `${MINUTES_PER_DAY}`: Drizzle binds an interpolated
    // number as a query parameter, and a `$1` placeholder inside DDL is not
    // valid SQL — the generated migration fails on apply rather than at build.
    check(
      'appointments_start_minute_in_day',
      sql`${table.startMinute} >= 0 AND ${table.startMinute} < ${sql.raw(String(MINUTES_PER_DAY))}`,
    ),
    // A quarter-hour minimum, and an appointment may not run past midnight —
    // which also guarantees the int4range in the exclusion constraint is valid.
    check(
      'appointments_duration_within_day',
      sql`${table.durationMinutes} >= ${sql.raw(String(SLOT_MINUTES))} AND ${table.startMinute} + ${table.durationMinutes} <= ${sql.raw(String(MINUTES_PER_DAY))}`,
    ),
  ],
);

export type Appointment = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;
