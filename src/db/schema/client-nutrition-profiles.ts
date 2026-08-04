import { boolean, index, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { clients } from './clients';
import { clinics } from './clinics';

/**
 * One slot in a client's daily eating schedule.
 *
 * `kcalShare` is the fraction of the daily target this slot should carry. It is
 * what turns "1,850 kcal a day" into five per-meal budgets — without it the model
 * has to guess how to spread the day, and the board has no figure to show a
 * meal's calories *against*.
 *
 * Shares are not forced to sum to 1 in the type; `src/features/weekly-plans/schema.ts`
 * checks that, so the error message can name the slot that broke it.
 */
export type MealSlot = {
  /** Stable key, referenced by `weekly_plan_meals.slot_key`. */
  slotKey: string;
  /** What the dietitian calls it. Free text — clinics name meals their own way. */
  label: string;
  /** `HH:MM`, wall-clock. Same reasoning as `meal_plan_meals.time_of_day`. */
  timeOfDay: string;
  /** 0-1. */
  kcalShare: number;
};

/**
 * The nutrition context for one client — everything plan generation reads that
 * `clients` does not already hold.
 *
 * A separate table rather than six more columns on `clients`: these are fields
 * only this feature uses, and the clients module has no business owning them. One
 * row per client, created lazily the first time the dietitian saves the form, so
 * every existing client is valid without a backfill.
 */
export const clientNutritionProfiles = pgTable(
  'client_nutrition_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * The tenant boundary, denormalised from the client on purpose — the same
     * reasoning as `meal_plans.clinic_id`. Reachable through `client_id`, but
     * carrying it here keeps the authorisation check off the join path.
     */
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),

    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),

    /**
     * Current weight. Nullable, because a client can exist before they have been
     * weighed — but BMI and the calorie suggestion are both unanswerable without
     * it, so the UI blocks generation until it is filled in.
     *
     * One value, not a history: a weight log with a trend chart is a feature of
     * its own and nobody has asked for it yet.
     */
    weightKg: real('weight_kg'),

    /**
     * Whether the client may see the weight above in their own portal.
     *
     * §11 of the design system, "Sensitive data": weight and measurements can
     * be hidden per client at the account level, and hidden means hidden
     * everywhere. It is a clinical judgement — for some clients a number on a
     * screen is the thing that helps, and for others it is the thing that
     * hurts — so the dietitian makes it, not the app and not the client.
     *
     * **Default false, deliberately.** Revealing a figure nobody chose to
     * reveal is the failure this column exists to prevent, and the reverse
     * (a client who wants to see it and has to ask once) is not. When it is
     * false the portal omits the row entirely rather than blanking it: §9.8
     * specifies "the card is absent, not blanked", because a visible field
     * reading "hidden" tells the client there is a number being kept from
     * them, which is worse than not raising the subject.
     *
     * There is no toggle in the practitioner app for this yet; the switch it
     * is drawn as ("إظهار الوزن للعميلة") is specified in §9.3.
     */
    shareWeightWithClient: boolean('share_weight_with_client').notNull().default(false),

    /**
     * The dietitian's override. Null means "use the figure `targets.ts` computes
     * from Mifflin-St Jeor", which is the normal case — this column exists for
     * the client whose clinical picture the formula does not fit.
     */
    dailyKcalTarget: integer('daily_kcal_target'),

    proteinTargetGrams: integer('protein_target_grams'),

    /**
     * Structured allergens: `nuts`, `lactose`, `gluten`, `egg`, `fish`, `sesame`.
     *
     * Deliberately NOT derived from `clients.allergies`, which is free text a
     * dietitian writes in Arabic or English however they like. Filtering a catalog
     * by keyword-matching prose is exactly the kind of nearly-right that puts a
     * client in hospital, so this is a checkbox list the dietitian ticks and the
     * only thing the catalog query filters on.
     *
     * `clients.allergies` is still sent to the model as context — the prose carries
     * detail these six tags cannot ("mild reaction to walnuts, not almonds").
     */
    allergenTags: text('allergen_tags').array().notNull().default([]),

    /** Free text, sent to the model as the dietitian wrote it. */
    preferences: text('preferences'),
    dislikes: text('dislikes'),

    /**
     * Standing clinical direction — "type 2 diabetes, avoid added sugar". Carried
     * into every generation, unlike `weekly_plans.week_instructions`, which
     * applies to one week only.
     */
    permanentInstructions: text('permanent_instructions'),

    /**
     * The day's slots, as {@link MealSlot}[].
     *
     * jsonb and not a table: five rows per client with no lifecycle of their own,
     * which is exactly the argument `meal-plans.ts` makes for having no
     * `meal_plan_days` table. Validated by Zod on write AND on read, so a
     * hand-edited row cannot reach a component.
     */
    mealSchedule: jsonb('meal_schedule').$type<MealSlot[]>().notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One profile per client, enforced here and not only in the mutation.
    uniqueIndex('client_nutrition_profiles_client_id_idx').on(table.clientId),
    index('client_nutrition_profiles_clinic_id_idx').on(table.clinicId),
  ],
);

export type ClientNutritionProfile = typeof clientNutritionProfiles.$inferSelect;
export type NewClientNutritionProfile = typeof clientNutritionProfiles.$inferInsert;
