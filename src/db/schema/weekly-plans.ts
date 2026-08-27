import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import type { MealNutritionSnapshot } from '@/features/weekly-plans/nutrition-snapshot';

import { catalogFoodPortions, catalogFoods } from './catalog-foods';
import { clients } from './clients';
import { clinics } from './clinics';
import { dishes } from './dishes';

/**
 * An AI-generated weekly plan — the only kind of plan there is.
 *
 * It began as V2 beside a hand-built `meal_plans`; that table is gone, and this
 * one carries what it never could: a dish reference, a serving multiplier, a
 * rationale, ranked alternatives, and a publish lifecycle.
 *
 * Day numbering is 0 = Sunday … 6 = Saturday, matching `Date.prototype.getDay()`.
 * Sunday leads because the clinic's week does; the labels are translated, the
 * numbering is not.
 */
export const weeklyPlans = pgTable(
  'weekly_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** Denormalised tenant boundary, as everywhere else. See `meal_plans.clinic_id`. */
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),

    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),

    /**
     * The Sunday this week begins, as a calendar date.
     *
     * A `date` and not a `timestamptz`: a week is a wall-clock fact, and the week
     * of the 27th must not become the week of the 26th because a server is in
     * another zone. Unlike V1's plans — which are repeating templates with no
     * dates at all — a V2 plan is generated *for* a specific week, and the client
     * portal needs to know which one is current.
     */
    weekStartDate: date('week_start_date', { mode: 'string' }).notNull(),

    /**
     * `draft` | `published` | `archived`.
     *
     * `archived` is what a published plan becomes when a newer one replaces it for
     * the same week. Nothing is deleted, so the history is free.
     */
    status: text('status').notNull().default('draft'),

    publishedAt: timestamp('published_at', { withTimezone: true }),

    /** What the dietitian asked for THIS week: "easier preparation", "lower cost". */
    weekInstructions: text('week_instructions'),

    /**
     * The daily calorie target this plan was generated against.
     *
     * Snapshotted rather than read live from the profile: the client's weight and
     * target will change, and a plan has to keep explaining itself against the
     * numbers it was actually built for.
     */
    kcalTargetSnapshot: integer('kcal_target_snapshot').notNull(),

    /**
     * The protein target and goal this plan was built against, when they differ
     * from the client's profile.
     *
     * Null means "whatever the profile says". Nullable rather than copied from the
     * profile at write time, so a plan built without touching these keeps deferring
     * to the profile exactly as every plan did before the columns existed — and so
     * "was this week deliberately different" stays an answerable question.
     *
     * Never written back to `client_nutrition_profiles`. A one-week experiment must
     * not silently become the client's standing target.
     */
    proteinTargetSnapshot: integer('protein_target_snapshot'),

    /** One of `CLIENT_GOALS`. Constrained in Zod, as `clients.goal` is. */
    goalSnapshot: text('goal_snapshot'),

    /** `ai` | `manual`. A plan can be started by hand and never generated. */
    generatedBy: text('generated_by').notNull().default('ai'),

    /** Which model produced it, for audit. Null on a manually built plan. */
    model: text('model'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // At most one live plan per client per week, enforced by the database rather
    // than by the publish action remembering to check. Partial, so any number of
    // drafts and archived plans may coexist.
    uniqueIndex('weekly_plans_published_week_idx')
      .on(table.clientId, table.weekStartDate)
      .where(sql`status = 'published'`),

    // The board reads one client's plans, newest week first.
    index('weekly_plans_client_id_week_idx').on(table.clientId, table.weekStartDate),
    index('weekly_plans_clinic_id_idx').on(table.clinicId),
  ],
);

/** One meal, in one day, of one plan. */
export const weeklyPlanMeals = pgTable(
  'weekly_plan_meals',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    planId: uuid('plan_id')
      .notNull()
      .references(() => weeklyPlans.id, { onDelete: 'cascade' }),

    /** 0 = Sunday … 6 = Saturday. An index, not a date. */
    dayOfWeek: integer('day_of_week').notNull(),

    /** Matches a `slotKey` in the client's `meal_schedule`. */
    slotKey: text('slot_key').notNull(),

    /**
     * Label and time are snapshotted from the schedule at generation time, not
     * joined at read time: changing a client's schedule must not silently rewrite
     * the plan they were already given.
     */
    label: text('label').notNull(),
    timeOfDay: time('time_of_day').notNull(),

    /**
     * The calories this slot was asked to carry.
     *
     * Snapshotted alongside the label for the same reason, and derived from the
     * schedule's `kcalShare` at generation time. Recomputing it at read time would
     * mean dividing the daily target evenly, which is wrong the moment a client's
     * lunch is meant to be larger than their breakfast — and it is what the model
     * was actually given, so it is what the board must show a meal against.
     */
    budgetKcal: integer('budget_kcal').notNull(),

    sortOrder: integer('sort_order').notNull().default(0),

    /**
     * Nullable on purpose. A slot the model could not fill — or one it filled with
     * a slug that failed server-side validation — is stored as an EMPTY meal, so
     * the dietitian sees a gap to fill rather than a plan that silently has four
     * meals where the schedule says five.
     */
    dishId: uuid('dish_id').references(() => dishes.id, { onDelete: 'restrict' }),

    /** Portion multiplier over the dish's base recipe. 1.5 is one and a half servings. */
    servings: real('servings').notNull().default(1),

    /** The model's short Arabic explanation. Its words, shown as a suggestion. */
    rationaleAr: text('rationale_ar'),

    /**
     * The nutrition this meal was prescribed at, frozen when the plan was published.
     *
     * Null means "not frozen — compute live", which is every draft. Non-null means
     * the numbers are a historical record and the current recipe must not be
     * consulted for them. That single rule is implemented once, in
     * `resolveMealNutrition` (`nutrition-snapshot.ts`), and shared by the staff
     * board, the patient portal, and archived plans.
     *
     * It exists because a plan stores only `dish_id + servings`. Everything else
     * about the food is a join away, so before this column a clinic editing a
     * recipe — or the coming migration off USDA to a canonical catalog — silently
     * rewrote the calories on plans patients were already following.
     *
     * `jsonb` rather than a spread of `real` columns: the frozen value is the whole
     * `NutrientTotals` shape (12 nutrients, each with its `unmeasured` count) plus
     * the dish's total weight, and flattening that would be ~25 columns that still
     * could not carry a future nutrient. Validated on read with Zod rather than
     * trusted, because a `jsonb` column accepts anything.
     *
     * Options (`weekly_plan_meal_options`) deliberately carry no snapshot: an
     * alternative is an offer, not the prescription. Their energy figures are still
     * live and may drift on an old plan.
     */
    nutritionSnapshot: jsonb('nutrition_snapshot').$type<MealNutritionSnapshot>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One meal per slot per day. Makes "regenerate this meal" an upsert and makes
    // a duplicated slot impossible.
    uniqueIndex('weekly_plan_meals_slot_idx').on(table.planId, table.dayOfWeek, table.slotKey),
    // Every read walks the week in order.
    index('weekly_plan_meals_plan_id_idx').on(table.planId, table.dayOfWeek, table.timeOfDay),
  ],
);

/**
 * What one planned meal actually contains, once a dietitian has said so.
 *
 * A meal is normally `dish_id + servings`: the recipe, scaled. That is one number
 * for the whole plate, so raising the chicken raises the eggplant, the oil and the
 * pine nuts with it. A dietitian does not prescribe that way — she moves the
 * chicken and the rice and leaves the rest alone — and no single multiplier can
 * express it.
 *
 * So these rows are the answer to "what is in this meal" whenever they exist, and
 * `servings` is the answer whenever they do not. Exactly one of the two is
 * consulted, decided in one place ({@link
 * src/features/weekly-plans/meal-ingredients.ts}), so a meal can never be half
 * described by each.
 *
 * ## They are written all at once, or not at all
 *
 * The first time a dietitian touches an ingredient control, the meal's ENTIRE
 * recipe is copied here at the amounts it currently has, and `servings` is set
 * to 1. Storing only the line she moved would leave the other lines still scaling
 * with a multiplier she can no longer see, and "I pinned the chicken, then pressed
 * the dish's +, what happened to my chicken?" has no answer a person would accept.
 * A whole-meal copy has one: after the first adjustment there is no dish
 * multiplier, only ingredients.
 *
 * ## They are self-contained on purpose
 *
 * A row names a `catalog_food`, not a `dish_ingredients` line. `db:seed:dishes`
 * replaces every recipe wholesale, so a reference to a recipe line would be
 * dangling after the next seed — and a prescribed meal should not change because
 * the dish it came from was edited afterwards. The food, the weight, the unit and
 * the order are all here, which is what makes a planned meal readable without the
 * dish it was built from.
 */
export const weeklyPlanMealIngredients = pgTable(
  'weekly_plan_meal_ingredients',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    mealId: uuid('meal_id')
      .notNull()
      .references(() => weeklyPlanMeals.id, { onDelete: 'cascade' }),

    /**
     * The food this line is, and the one live nutrition reference.
     *
     * `restrict`, exactly as `dish_ingredients.catalog_food_id`: deleting a food a
     * patient has been prescribed must fail loudly, not empty their meal.
     */
    catalogFoodId: uuid('catalog_food_id')
      .notNull()
      .references(() => catalogFoods.id, { onDelete: 'restrict' }),

    /**
     * Grams in this meal, and the **authoritative** quantity — the whole amount,
     * not a per-serving one. Nothing multiplies it.
     *
     * The two columns below record the unit it was counted in; neither is ever an
     * input to a calculation, which is the same rule `dish_ingredients` follows.
     */
    quantityGrams: real('quantity_grams').notNull(),

    /** The unit the count is in — رغيف, حبة, ملعقة. Null when this line is grams. */
    portionId: uuid('portion_id').references(() => catalogFoodPortions.id, {
      onDelete: 'set null',
    }),

    /** How many of `portion_id`. Null exactly when `portion_id` is. */
    portionQuantity: real('portion_quantity'),

    /**
     * Whether this line carried a control when the meal was copied here.
     *
     * Copied from `dish_ingredients.is_primary` rather than joined back to it, for
     * the same reason the food is: re-starring a dish must not add or remove
     * controls on meals that were already prescribed.
     */
    isPrimary: boolean('is_primary').notNull().default(false),

    /** The recipe's own order, preserved so the meal reads as it was written. */
    sortOrder: integer('sort_order').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('weekly_plan_meal_ingredients_meal_id_idx').on(table.mealId, table.sortOrder),
    // One line per food per meal. Two rows for the same food would render as two
    // identical names with different amounts and no way to tell which is meant.
    uniqueIndex('weekly_plan_meal_ingredients_food_idx').on(table.mealId, table.catalogFoodId),
  ],
);

/**
 * A ranked alternative for one meal — what the client may eat instead.
 *
 * A separate table rather than an array column on the meal: an option carries its
 * own serving multiplier, so it is a row, not a value. Zero to three per meal.
 */
export const weeklyPlanMealOptions = pgTable(
  'weekly_plan_meal_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    mealId: uuid('meal_id')
      .notNull()
      .references(() => weeklyPlanMeals.id, { onDelete: 'cascade' }),

    dishId: uuid('dish_id')
      .notNull()
      .references(() => dishes.id, { onDelete: 'restrict' }),

    servings: real('servings').notNull().default(1),

    /** Rank as the model offered them — first is the closest substitute. */
    sortOrder: integer('sort_order').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('weekly_plan_meal_options_meal_id_idx').on(table.mealId, table.sortOrder),
    // The same dish twice in one meal's options is noise, not a choice.
    uniqueIndex('weekly_plan_meal_options_dish_idx').on(table.mealId, table.dishId),
  ],
);

/**
 * One row per call to the model.
 *
 * Not decoration. Three weeks from now the only way to answer "why did Tuesday
 * come out like that" is to read the instruction that produced it, and the only
 * way to know what this feature costs is to have counted the tokens. Written for
 * failures too — a run that errored is the most interesting kind.
 */
export const weeklyPlanGenerations = pgTable(
  'weekly_plan_generations',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** `set null`, not cascade: deleting a plan must not erase the record that it was generated. */
    planId: uuid('plan_id').references(() => weeklyPlans.id, { onDelete: 'set null' }),

    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),

    /** `week` | `day` | `meal`. */
    scope: text('scope').notNull(),

    /** The one-line instruction for this run, if any. */
    instruction: text('instruction'),

    model: text('model').notNull(),

    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    durationMs: integer('duration_ms'),

    /** `ok` | `failed`. */
    status: text('status').notNull(),
    error: text('error'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('weekly_plan_generations_clinic_id_idx').on(table.clinicId, table.createdAt)],
);

export type WeeklyPlan = typeof weeklyPlans.$inferSelect;
export type NewWeeklyPlan = typeof weeklyPlans.$inferInsert;
export type WeeklyPlanMeal = typeof weeklyPlanMeals.$inferSelect;
export type NewWeeklyPlanMeal = typeof weeklyPlanMeals.$inferInsert;
export type WeeklyPlanMealIngredient = typeof weeklyPlanMealIngredients.$inferSelect;
export type NewWeeklyPlanMealIngredient = typeof weeklyPlanMealIngredients.$inferInsert;
export type WeeklyPlanMealOption = typeof weeklyPlanMealOptions.$inferSelect;
export type NewWeeklyPlanMealOption = typeof weeklyPlanMealOptions.$inferInsert;
export type WeeklyPlanGeneration = typeof weeklyPlanGenerations.$inferSelect;
