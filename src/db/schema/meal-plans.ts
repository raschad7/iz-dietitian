import { index, integer, pgTable, real, text, time, timestamp, uuid } from 'drizzle-orm/pg-core';

import { clients } from './clients';
import { clinics } from './clinics';
import { foods } from './foods';

/**
 * A weekly meal plan for one client.
 *
 * Three tables, one hierarchy: a plan holds meals ("Sunday, Breakfast, 07:00"),
 * a meal holds items ("120 g of Egg, whole, raw, fresh"). Nutrition is never
 * stored — it is derived from `foods` at read time by
 * `src/features/meal-plans/nutrition.ts`. Storing computed totals would let them
 * drift the moment a quantity changes.
 *
 * There is deliberately no `meal_plan_days` table. A day carries no data of its
 * own beyond which day it is, so it lives as a column on the meal; a table would
 * add a join and a lifecycle to manage for nothing. See `meal_plan_meals.day_of_week`.
 */
export const mealPlans = pgTable(
  'meal_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * The tenant boundary, denormalised from the client on purpose.
     *
     * It is reachable via `client_id -> clients.clinic_id`, but carrying it here
     * means every query and every write can filter on the plan row itself. The
     * alternative is a join on the hot path of an authorisation check, which is
     * exactly where a forgotten one turns into a cross-tenant leak.
     */
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),

    /** Deleting a client takes their plans with them; the plan is not a record of its own. */
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),

    title: text('title').notNull(),
    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('meal_plans_clinic_id_idx').on(table.clinicId),
    index('meal_plans_client_id_idx').on(table.clientId),
  ],
);

/** A block in the day's schedule — breakfast, a snack, dinner. */
export const mealPlanMeals = pgTable(
  'meal_plan_meals',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    planId: uuid('plan_id')
      .notNull()
      .references(() => mealPlans.id, { onDelete: 'cascade' }),

    /**
     * Which day of the week this meal belongs to: 0 = Sunday … 6 = Saturday,
     * matching `Date.prototype.getDay()`. Sunday leads because the clinic's week
     * does; the labels are translated, the numbering is not.
     *
     * It is a plain index, NOT a date — a plan is a repeating template ("this is
     * your Monday"), not a diary of specific calendar days.
     *
     * Defaults to 0 so the migration that introduced weekly plans could land
     * without inventing a day for meals that already existed.
     */
    dayOfWeek: integer('day_of_week').notNull().default(0),

    /** Free text, seeded from a template. Dietitians name meals their own way. */
    label: text('label').notNull(),

    /**
     * A wall-clock time, stored as `time` — "07:00" means seven in the morning
     * wherever the client is, so it must not be an instant that a time zone can
     * shift. Same reasoning as `clients.date_of_birth` being a `date`.
     */
    timeOfDay: time('time_of_day').notNull(),

    /**
     * Ties the display order. Meals are shown by `time_of_day` first, so this
     * only decides between two meals set to the same time.
     */
    sortOrder: integer('sort_order').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // Every read either loads a whole plan or one of its days, and both walk the
  // week in order — so the day leads the index, ahead of the time.
  (table) => [index('meal_plan_meals_plan_id_idx').on(table.planId, table.dayOfWeek, table.timeOfDay)],
);

/** One food, in one meal, at a quantity. */
export const mealPlanItems = pgTable(
  'meal_plan_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    mealId: uuid('meal_id')
      .notNull()
      .references(() => mealPlanMeals.id, { onDelete: 'cascade' }),

    /**
     * `restrict`, not `cascade`: `foods` is reference data, and a re-seed that
     * silently emptied someone's meal plan would be a catastrophe. Deleting a
     * food that is in use now fails loudly instead.
     */
    foodId: uuid('food_id')
      .notNull()
      .references(() => foods.id, { onDelete: 'restrict' }),

    /**
     * Grams, always — the one unit every `foods` column is expressed against.
     * Household measures ("1 cup") are a UI convenience that is converted to
     * grams before it reaches this column, so nothing downstream has to know
     * about units.
     */
    quantityGrams: real('quantity_grams').notNull(),

    sortOrder: integer('sort_order').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('meal_plan_items_meal_id_idx').on(table.mealId, table.sortOrder)],
);

export type MealPlan = typeof mealPlans.$inferSelect;
export type MealPlanMeal = typeof mealPlanMeals.$inferSelect;
export type MealPlanItem = typeof mealPlanItems.$inferSelect;
