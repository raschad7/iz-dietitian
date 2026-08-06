import { index, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { clients } from './clients';
import { clinics } from './clinics';
import { weeklyPlanMeals } from './weekly-plans';

/**
 * Which of a client's own meals they have ticked off, one row per meal.
 *
 * This is the source of truth `client_plan_adherence` is now derived from: a
 * day's level is recomputed from the fraction of that day's meals with a row
 * here, every time one is ticked or unticked (see
 * `src/features/portal/mutations.ts:toggleMealCompletion`). There is no
 * boolean column — a meal is "done" exactly when its row exists, "not done"
 * when it does not, so unticking is a delete rather than a second state to
 * keep in sync with the first.
 *
 * `meal_id` alone identifies which day this belongs to (via
 * `weekly_plan_meals.day_of_week` and the plan's `week_start_date`), so there
 * is no separate `date` column to fall out of step with it.
 */
export const weeklyPlanMealCompletions = pgTable(
  'weekly_plan_meal_completions',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** The tenant boundary, denormalised from the client — same reasoning as `client_plan_adherence.clinic_id`. */
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),

    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),

    mealId: uuid('meal_id')
      .notNull()
      .references(() => weeklyPlanMeals.id, { onDelete: 'cascade' }),

    completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One completion per client per meal — ticking twice is a no-op, not a second row.
    uniqueIndex('weekly_plan_meal_completions_client_meal_idx').on(table.clientId, table.mealId),
    index('weekly_plan_meal_completions_clinic_id_idx').on(table.clinicId),
  ],
);

export type WeeklyPlanMealCompletion = typeof weeklyPlanMealCompletions.$inferSelect;
export type NewWeeklyPlanMealCompletion = typeof weeklyPlanMealCompletions.$inferInsert;
