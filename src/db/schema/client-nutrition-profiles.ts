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
     * Whether the client may see their body composition history in the portal.
     *
     * **A second switch rather than a widening of the one above, and the split is
     * the point.** `share_weight_with_client` governs one number a client
     * usually already knows — they stood on the scale. This governs a body-fat
     * percentage, a muscle mass and a trend across months, which is a different
     * disclosure: it is the material a client is most likely to read a judgement
     * into, and the dietitian may well want to show the weight while keeping the
     * composition for the room.
     *
     * **Default false, for the reason stated above.** Revealing a figure nobody
     * chose to reveal is the failure both columns exist to prevent, and the
     * reverse — a client who wants to see it and asks once — is not.
     *
     * When it is false the portal omits the card entirely rather than blanking
     * it, per §9.8: a visible panel reading "hidden" tells a client there is
     * something being kept from them, which is worse than not raising it.
     *
     * What this never reveals, at any setting: the visceral fat rating, the
     * metabolic age, the machine's own scores, and the original PDF. Those need
     * a clinician to interpret them, and a number with no interpretation is how
     * a client ends up frightened by a normal result. See the portal's own
     * reader for what it selects.
     */
    shareMeasurementsWithClient: boolean('share_measurements_with_client')
      .notNull()
      .default(false),

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

    /**
     * Allergens the dietitian typed that are not among the six above.
     *
     * A separate column, and the separation is the whole point: these do **not**
     * filter the catalog. `dishes.allergen_tags` carries the same six closed
     * values, so a dish can only be excluded by one of them — a custom entry
     * like "فراولة" matches no dish and removes nothing.
     *
     * They are recorded, shown to the dietitian, and sent to the model as
     * context. Putting them in `allergen_tags` would have been one line shorter
     * and silently wrong: that column would stop meaning "what the catalog
     * filters on", and a client would look protected from something nothing
     * checks. The UI draws them differently for the same reason.
     *
     * The upgrade path for any one of these is to add it to `ALLERGENS` *and*
     * tag the dish catalog with it, at which point it becomes a real filter.
     */
    customAllergens: text('custom_allergens').array().notNull().default([]),

    /** Free text, sent to the model as the dietitian wrote it. */
    preferences: text('preferences'),
    dislikes: text('dislikes'),

    /**
     * Standing clinical direction — "type 2 diabetes, avoid added sugar". Carried
     * into every generation, unlike `weekly_plans.week_instructions`, which
     * applies to one week only.
     */
    permanentInstructions: text('permanent_instructions'),

    // ── Nutrition assessment form ────────────────────────────────────────────
    /*
     * The clinic's paper intake questionnaire ("نموذج التقييم التغذوي"), which a
     * dietitian used to fill in on a sheet and file away. Columns rather than one
     * jsonb blob: each answer is asked once, has a fixed meaning, and several of
     * them are closed vocabularies the UI draws as a select — a blob would make
     * every one of those a free-text field that nothing can validate or count.
     *
     * All nullable. The sheet is worked through over several visits, and the
     * intake form has never required anything but the meal schedule.
     */

    /** One of `CLIENT_MARITAL_STATUSES`. Free of clinical meaning on its own. */
    maritalStatus: text('marital_status'),
    /** How many children, when the answer to "يوجد أطفال" is yes. */
    childrenCount: integer('children_count'),
    /** One of `BLOOD_TYPES`. */
    bloodType: text('blood_type'),
    occupation: text('occupation'),

    /** "سبب زيارة عيادة التغذية" — the client's own words for why they came. */
    visitReason: text('visit_reason'),
    /** Previous diets, and when. */
    dietHistory: text('diet_history'),
    /** Drug allergies. Kept apart from `allergen_tags`, which is food only. */
    drugAllergies: text('drug_allergies'),
    /** Hereditary disease or obesity in the family. */
    familyHistory: text('family_history'),

    /**
     * How the client actually moves, in prose — not `clients.activity_level`.
     *
     * The enum is the multiplier Mifflin-St Jeor needs; this is "walks 40
     * minutes most evenings, desk job", which is what a dietitian reads back.
     */
    activityNotes: text('activity_notes'),
    /** What stops them — an injury, hours, a knee. */
    activityBarriers: text('activity_barriers'),
    sleepHours: real('sleep_hours'),
    /** One of `SMOKING_HABITS`. */
    smoking: text('smoking'),

    /*
     * Ten food-frequency answers, each one of `INTAKE_FREQUENCIES`.
     *
     * A closed scale rather than a number: the paper form asks "كم مرة يوميا"
     * and gets "٢-٣" or "أحيانا" written in a margin. A five-point scale is what
     * the answer actually carries, it renders as one select, and two records are
     * comparable — which a free-text count is not.
     *
     * The daily/weekly split is per question and fixed, matching the sheet; the
     * label the UI shows says which.
     *
     * ⚠ **One column per food, not per question on the sheet.** Four of these
     * were two: caffeine shared a column with sweetened drinks, vegetables
     * shared `produce_frequency` with fruit, and beef, chicken and fish shared
     * `protein_food_frequency`. A single answer covering several foods cannot be
     * read back — "3-4 times a week" across meat, chicken and fish says nothing
     * about which of the three, which is the only thing a dietitian would act
     * on. The old answers were copied into every column they used to cover when
     * the columns split (migrations 0025 and 0027), so a record answered before
     * the split reads as the same answer for each of its foods rather than as
     * blanks.
     */
    caffeineFrequency: text('caffeine_frequency'),
    /** Split out of `caffeine_frequency`; juice, soft drinks, sweetened tea. */
    sweetDrinksFrequency: text('sweet_drinks_frequency'),
    fastFoodFrequency: text('fast_food_frequency'),
    /* The two that were `produce_frequency`. */
    vegetablesFrequency: text('vegetables_frequency'),
    fruitFrequency: text('fruit_frequency'),
    dairyFrequency: text('dairy_frequency'),
    /* The three that were `protein_food_frequency`. */
    redMeatFrequency: text('red_meat_frequency'),
    chickenFrequency: text('chicken_frequency'),
    fishFrequency: text('fish_frequency'),
    sweetsFrequency: text('sweets_frequency'),

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
