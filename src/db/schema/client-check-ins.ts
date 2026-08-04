import { check, date, index, integer, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { clients } from './clients';
import { clinics } from './clinics';

/**
 * The five things a client rates about their day.
 *
 * They are columns rather than rows in a `client_check_in_metrics` table: the
 * set is fixed by the check-in form, every one of them is read together or not
 * at all, and the week summary averages all five in a single pass. A row-per-
 * metric shape would turn one `WHERE date BETWEEN` into a join and a group-by
 * to answer exactly the same question.
 *
 * Adding a sixth means a migration, which is the correct amount of friction —
 * this list is a clinical decision, not configuration.
 */
export const CHECK_IN_METRICS = ['energy', 'sleep', 'appetite', 'mood', 'water'] as const;

export type CheckInMetric = (typeof CHECK_IN_METRICS)[number];

/** The rating scale each metric is answered on, inclusive. */
export const METRIC_MIN = 1;
export const METRIC_MAX = 5;

/** The scale a whole day is scored on, inclusive. */
export const DAY_SCORE_MIN = 0;
export const DAY_SCORE_MAX = 10;

/**
 * One client's rating of one clinic-local day.
 *
 * **Why a `date` and not a `timestamptz`.** The same reasoning as
 * `appointments.date`: "how did Tuesday go" is a wall-clock question about the
 * clinic's day, and storing the instant would make a DST transition move a
 * check-in onto the day before. The portal's week strip is a plain
 * `WHERE date BETWEEN` against this column.
 *
 * **Why absence, not a zero row.** A day with no row is a day the client did
 * not answer, and the portal draws that as its own quiet state. Writing a
 * `score = 0` row on their behalf would be the app asserting something about
 * their day that nobody told it — and it would make "did they check in?"
 * unanswerable. `score = 0` therefore means a real answer of zero, which is
 * a different fact from silence.
 *
 * The metric columns are individually nullable so a client can answer the day
 * without answering all five; the week summary skips the nulls rather than
 * treating them as a low score.
 */
export const clientCheckIns = pgTable(
  'client_check_ins',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * The tenant boundary, denormalised from the client for the same reason as
     * `client_nutrition_profiles.clinic_id` — reachable through `client_id`,
     * but carrying it here keeps the authorisation check off the join path.
     */
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),

    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),

    /** Clinic-local `YYYY-MM-DD`. */
    date: date('date', { mode: 'string' }).notNull(),

    /** How the day went overall, 0–10. See the note above on what 0 means. */
    score: integer('score').notNull(),

    energy: integer('energy'),
    sleep: integer('sleep'),
    appetite: integer('appetite'),
    mood: integer('mood'),
    water: integer('water'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One check-in per client per day, enforced here and not only in the mutation.
    uniqueIndex('client_check_ins_client_id_date_idx').on(table.clientId, table.date),
    index('client_check_ins_clinic_id_date_idx').on(table.clinicId, table.date),

    // The ranges the UI relies on. A component that renders a ring at
    // `score / 10` has no sensible output for 11, so the database refuses it
    // rather than leaving every reader to re-check.
    check(
      'client_check_ins_score_range',
      sql`${table.score} between ${sql.raw(String(DAY_SCORE_MIN))} and ${sql.raw(String(DAY_SCORE_MAX))}`,
    ),
    check(
      'client_check_ins_energy_range',
      sql`${table.energy} is null or ${table.energy} between ${sql.raw(String(METRIC_MIN))} and ${sql.raw(String(METRIC_MAX))}`,
    ),
    check(
      'client_check_ins_sleep_range',
      sql`${table.sleep} is null or ${table.sleep} between ${sql.raw(String(METRIC_MIN))} and ${sql.raw(String(METRIC_MAX))}`,
    ),
    check(
      'client_check_ins_appetite_range',
      sql`${table.appetite} is null or ${table.appetite} between ${sql.raw(String(METRIC_MIN))} and ${sql.raw(String(METRIC_MAX))}`,
    ),
    check(
      'client_check_ins_mood_range',
      sql`${table.mood} is null or ${table.mood} between ${sql.raw(String(METRIC_MIN))} and ${sql.raw(String(METRIC_MAX))}`,
    ),
    check(
      'client_check_ins_water_range',
      sql`${table.water} is null or ${table.water} between ${sql.raw(String(METRIC_MIN))} and ${sql.raw(String(METRIC_MAX))}`,
    ),
  ],
);

export type ClientCheckIn = typeof clientCheckIns.$inferSelect;
export type NewClientCheckIn = typeof clientCheckIns.$inferInsert;
