import { sql } from 'drizzle-orm';
import {
  date,
  index,
  integer,
  pgTable,
  real,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { clients } from './clients';
import { clinics } from './clinics';
import { dishes } from './dishes';

/**
 * An AI-generated weekly plan — the storage behind meal planning V2.
 *
 * Deliberately separate from `meal_plans`. V2 needs a dish reference, a serving
 * multiplier, a rationale, ranked alternatives, and a publish lifecycle; none of
 * those mean anything to the manual editor, and adding them there would make every
 * one of its columns nullable-and-ignored. The two features share `foods` and the
 * nutrition arithmetic, which is the part worth sharing.
 *
 * Same day numbering as V1: 0 = Sunday … 6 = Saturday, matching
 * `Date.prototype.getDay()`.
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
export type WeeklyPlanMealOption = typeof weeklyPlanMealOptions.$inferSelect;
export type NewWeeklyPlanMealOption = typeof weeklyPlanMealOptions.$inferInsert;
export type WeeklyPlanGeneration = typeof weeklyPlanGenerations.$inferSelect;
