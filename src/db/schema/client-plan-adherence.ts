import { check, index, date, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
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
 * Three levels rather than a 0–10 scale: the portal asks for a quick daily
 * read, not a rating scale. There is no manual selector for it any more — a
 * row here is written automatically, derived from the fraction of that day's
 * meals ticked complete on the meal-plan screen (see
 * `weekly_plan_meal_completions` and
 * `src/features/portal/mutations.ts:toggleMealCompletion`): none ticked is
 * `missed`, all ticked is `full`, anything between is `partial`.
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

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One adherence report per client per day, enforced here and not only in
    // the mutation — the same guarantee as `client_check_ins`.
    uniqueIndex('client_plan_adherence_client_id_date_idx').on(table.clientId, table.date),
    index('client_plan_adherence_clinic_id_date_idx').on(table.clinicId, table.date),

    check('client_plan_adherence_level_check', sql`${table.level} IN ('missed', 'partial', 'full')`),
  ],
);

export type ClientPlanAdherence = typeof clientPlanAdherence.$inferSelect;
export type NewClientPlanAdherence = typeof clientPlanAdherence.$inferInsert;
