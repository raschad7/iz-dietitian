import { check, index, date, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { clients } from './clients';
import { clinics } from './clinics';

/**
 * How closely a client followed their assigned nutrition plan on one day, as
 * they report it themselves.
 *
 * Deliberately separate from `client_check_ins`. That table is general
 * wellness — energy, sleep, appetite, mood, water — answering "how are you
 * doing"; this one answers a narrower clinical question, "did you follow the
 * plan the dietitian gave you", and the two must not be averaged together or
 * a client who feels great on a day they ignored their plan would read as
 * adherent.
 *
 * **The counts are the measure; the level is only a label for it.**
 * `completed_meals` and `total_meals` are what every percentage in the portal
 * is computed from — 1 of 4 is 25%, 2 of 3 is 67% — so a day's adherence is
 * the fraction the client actually achieved rather than a bucket it fell into.
 * `level` is derived from the same pair (none ticked is `missed`, all ticked is
 * `full`, anything between is `partial`) and exists only for the copy that
 * needs a word rather than a number — the encouragement line under today's
 * ring, and whether a day continues a streak. Nothing may recover a percentage
 * from it: `partial` was worth a flat 50% under the old scheme, which is what
 * made 1 of 4 meals and 3 of 4 meals draw the same half-full ring.
 *
 * Both are written together by
 * `src/features/portal/mutations.ts:recomputeDayAdherence`, from
 * `weekly_plan_meal_completions` counted against that day's
 * `weekly_plan_meals`, so the pair can never disagree with the meals it was
 * derived from.
 */
export const ADHERENCE_LEVELS = ['missed', 'partial', 'full'] as const;

export type AdherenceLevel = (typeof ADHERENCE_LEVELS)[number];

/**
 * One client's report for one clinic-local day.
 *
 * Same reasoning as `client_check_ins.date`: a wall-clock date, not an
 * instant, so "did Tuesday go to plan" stays Tuesday's question across a DST
 * change. One row per client per day — the log replaces the day's answer
 * rather than appending to it, so correcting today's tap is an upsert, not a
 * second row to reconcile.
 */
export const clientPlanAdherence = pgTable(
  'client_plan_adherence',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * The tenant boundary, denormalised from the client — the same reasoning
     * as `client_check_ins.clinic_id`.
     */
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),

    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),

    /** Clinic-local `YYYY-MM-DD`. */
    date: date('date', { mode: 'string' }).notNull(),

    level: text('level').notNull(),

    /**
     * How many of that day's meals were ticked, and how many it had.
     *
     * Stored rather than counted at read time because the plan behind a past
     * day can be edited or deleted, and "you followed 3 of 4 meals on Tuesday"
     * must keep meaning what it meant on Tuesday. The rows are still
     * recomputed whenever that day's meals change, so a day whose plan is
     * rewritten today reports against the plan it now has.
     */
    completedMeals: integer('completed_meals').notNull(),
    totalMeals: integer('total_meals').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One adherence report per client per day, enforced here and not only in
    // the mutation — the same guarantee as `client_check_ins`.
    uniqueIndex('client_plan_adherence_client_id_date_idx').on(table.clientId, table.date),
    index('client_plan_adherence_clinic_id_date_idx').on(table.clinicId, table.date),

    check('client_plan_adherence_level_check', sql`${table.level} IN ('missed', 'partial', 'full')`),

    // A day with no meals has no adherence to report — `recomputeDayAdherence`
    // deletes the row instead of writing a 0-of-0 that would divide by zero in
    // every percentage downstream.
    check('client_plan_adherence_total_meals_check', sql`${table.totalMeals} > 0`),
    check(
      'client_plan_adherence_completed_meals_check',
      sql`${table.completedMeals} >= 0 AND ${table.completedMeals} <= ${table.totalMeals}`,
    ),
  ],
);

export type ClientPlanAdherence = typeof clientPlanAdherence.$inferSelect;
export type NewClientPlanAdherence = typeof clientPlanAdherence.$inferInsert;
