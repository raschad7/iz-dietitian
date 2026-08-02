import { z } from 'zod';

import { CLIENT_GOALS } from '@/features/clients/schema';

import { MAX_SERVINGS, MIN_SERVINGS } from './similar';

/**
 * Validation for every weekly-plan input, and for everything the model returns.
 *
 * The rules live here, not in the
 * database, so extending them is a code change rather than a migration.
 *
 * The response schemas at the bottom are the load-bearing ones. Everything a
 * model produces passes through them before it is looked at, and a plan is only
 * written from what survives.
 */

export const planIdSchema = z.uuid();
export const mealIdSchema = z.uuid();
export const dishIdSchema = z.uuid();
export const clientIdSchema = z.uuid();

/** The closed sets behind the catalog's array columns. */
export const MEAL_TYPES = ['breakfast', 'snack', 'lunch', 'dinner'] as const;
export const DISH_TAGS = [
  'cheap',
  'portable',
  'quick',
  'vegetarian',
  'high_protein',
  'diabetic_friendly',
] as const;
export const ALLERGENS = ['nuts', 'lactose', 'gluten', 'egg', 'fish', 'sesame'] as const;

export type MealType = (typeof MEAL_TYPES)[number];
export type Allergen = (typeof ALLERGENS)[number];

export const PLAN_STATUSES = ['draft', 'published', 'archived'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

/** 0 = Sunday … 6 = Saturday, matching V1 and `Date.prototype.getDay()`. */
export const DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6] as const;

export const DAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

export type DayKey = (typeof DAY_KEYS)[number];

/**
 * The message key for a day.
 *
 * Same guard as V1's `dayKey`: `DAY_KEYS[n]` on a plain number widens to
 * `| undefined` under `noUncheckedIndexedAccess`, and `days.undefined` reaching
 * `useTranslations` throws at render.
 */
export function dayKey(dayOfWeek: number): DayKey {
  return DAY_KEYS[dayOfWeek] ?? DAY_KEYS[0];
}

export const dayOfWeekSchema = z.coerce.number().int().min(0).max(6);

/** `HH:MM`, the value an `<input type="time">` submits. */
export const timeOfDaySchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM');

/** Trims PostgreSQL's `HH:MM:SS` down to what an `<input type="time">` expects. */
export function toTimeInput(value: string): string {
  return value.slice(0, 5);
}

function blankToUndefined(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

function optionalText(max: number) {
  return z.preprocess(blankToUndefined, z.string().trim().max(max).optional());
}

// ---------------------------------------------------------------------------
// The client's schedule and profile
// ---------------------------------------------------------------------------

export const mealSlotSchema = z.object({
  slotKey: z
    .string()
    .trim()
    .min(1)
    .max(32)
    // Referenced by `weekly_plan_meals.slot_key` and used as a React key and a
    // form field name, so it is kept to an identifier rather than free text.
    .regex(/^[a-z0-9_]+$/, 'lowercase letters, digits and underscores only'),
  label: z.string().trim().min(1).max(60),
  timeOfDay: timeOfDaySchema,
  kcalShare: z.coerce.number().min(0).max(1),
});

/**
 * A day's slots.
 *
 * Between one and eight: a schedule of zero meals cannot be planned against, and
 * beyond eight the board stops being readable. Slot keys must be unique — two
 * meals with the same key would collide on the meal table's unique index and lose
 * one silently.
 *
 * Shares deliberately do NOT have to sum to 1. `slotBudgets` normalises them, so
 * a dietitian mid-edit is not blocked by arithmetic.
 */
export const mealScheduleSchema = z
  .array(mealSlotSchema)
  .min(1)
  .max(8)
  .refine((slots) => new Set(slots.map((slot) => slot.slotKey)).size === slots.length, {
    message: 'slot keys must be unique',
  });

export type MealScheduleInput = z.infer<typeof mealScheduleSchema>;

/**
 * The default schedule, offered to a client who has none.
 *
 * Five meals, and the shares that let a dietitian recognise their own practice:
 * lunch is the largest meal of the day in Palestine, which is why it carries 35%
 * and dinner 20% rather than the other way round.
 */
export const DEFAULT_MEAL_SCHEDULE: MealScheduleInput = [
  { slotKey: 'breakfast', label: 'فطور', timeOfDay: '07:30', kcalShare: 0.25 },
  { slotKey: 'snack_1', label: 'سناك صباحي', timeOfDay: '10:30', kcalShare: 0.1 },
  { slotKey: 'lunch', label: 'غداء', timeOfDay: '14:00', kcalShare: 0.35 },
  { slotKey: 'snack_2', label: 'سناك عصر', timeOfDay: '17:00', kcalShare: 0.1 },
  { slotKey: 'dinner', label: 'عشاء', timeOfDay: '20:00', kcalShare: 0.2 },
];

/**
 * Which meal type a slot draws from.
 *
 * The schedule stores a free-text label, but the catalog is tagged by meal type,
 * so the two have to be bridged. Keyed on the slot key's stem so `snack_1` and
 * `snack_2` both resolve to `snack`; anything unrecognised falls back to `lunch`,
 * the most broadly stocked category.
 */
export function mealTypeForSlot(slotKey: string): MealType {
  if (slotKey.startsWith('breakfast')) return 'breakfast';
  if (slotKey.startsWith('snack')) return 'snack';
  if (slotKey.startsWith('dinner')) return 'dinner';
  return 'lunch';
}

/**
 * The nutrition profile form.
 *
 * Weight has a generous range that still catches a slipped decimal: 500 kg is not
 * a client, it is a typo. The calorie ceiling is likewise a sanity bound, not a
 * clinical one.
 */
export const nutritionProfileSchema = z.object({
  clientId: clientIdSchema,
  /**
   * The checkbox list, not prose. A `FormData` with one ticked box yields a
   * string rather than an array, which is why this coerces before parsing.
   */
  allergenTags: z.preprocess(
    (value) => (value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]),
    z.array(z.enum(ALLERGENS)),
  ),
  weightKg: z.preprocess(blankToUndefined, z.coerce.number().min(20).max(400).optional()),
  dailyKcalTarget: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(800).max(6000).optional(),
  ),
  proteinTargetGrams: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(20).max(400).optional(),
  ),
  preferences: optionalText(1000),
  dislikes: optionalText(1000),
  permanentInstructions: optionalText(2000),
  mealSchedule: mealScheduleSchema,
});

export type NutritionProfileInput = z.infer<typeof nutritionProfileSchema>;

// ---------------------------------------------------------------------------
// Generation inputs
// ---------------------------------------------------------------------------

/** `YYYY-MM-DD`. A calendar date, so it is validated as one rather than parsed. */
export const weekStartDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const GENERATION_SCOPES = ['week', 'day', 'meal'] as const;
export type GenerationScope = (typeof GENERATION_SCOPES)[number];

/**
 * The instruction accompanying a generation.
 *
 * Capped at 600 characters: this is a note to a colleague ("cheaper, and nothing
 * that needs an oven"), not a document. The cap also bounds what a compromised
 * form could push into a prompt.
 */
export const instructionSchema = optionalText(600);

export const generateWeekSchema = z.object({
  clientId: clientIdSchema,
  weekStartDate: weekStartDateSchema,
  instruction: instructionSchema,
  /**
   * This week's figures, when the dietitian overrode them.
   *
   * The same bounds the nutrition profile uses, because they are the same
   * quantities — a target that would be a typo on the profile is a typo here too.
   * Blank means "use the profile", which is why these are optional rather than
   * defaulted: the difference is recorded on the plan, and a plan that stored a
   * copy of the profile's number could never say whether the week was deliberately
   * different.
   */
  kcalTarget: z.preprocess(blankToUndefined, z.coerce.number().int().min(800).max(6000).optional()),
  proteinTarget: z.preprocess(blankToUndefined, z.coerce.number().int().min(20).max(400).optional()),
  goal: z.preprocess(blankToUndefined, z.enum(CLIENT_GOALS).optional()),
});

export const regenerateDaySchema = z.object({
  planId: planIdSchema,
  dayOfWeek: dayOfWeekSchema,
  instruction: instructionSchema,
});

export const regenerateMealSchema = z.object({
  planId: planIdSchema,
  mealId: mealIdSchema,
  instruction: instructionSchema,
});

export const swapMealSchema = z.object({
  planId: planIdSchema,
  mealId: mealIdSchema,
  dishId: dishIdSchema,
  servings: z.coerce.number().min(MIN_SERVINGS).max(MAX_SERVINGS),
});

export const publishPlanSchema = z.object({ planId: planIdSchema });

/**
 * Starting a week without generating one.
 *
 * Two schemas rather than one with an optional source: a copy that lost its
 * `sourcePlanId` to a typo would silently become an empty week, which is the one
 * mistake a dietitian would not notice until the board loaded blank.
 */
export const startEmptyWeekSchema = z.object({
  clientId: clientIdSchema,
  weekStartDate: weekStartDateSchema,
});

export const startWeekFromPlanSchema = z.object({
  clientId: clientIdSchema,
  weekStartDate: weekStartDateSchema,
  sourcePlanId: planIdSchema,
});

// ---------------------------------------------------------------------------
// The model's response
// ---------------------------------------------------------------------------

/**
 * How long a rationale may be.
 *
 * The prompt asks for one short sentence. The cap is enforced here rather than
 * trusted, because a model that ignores it would otherwise put a paragraph inside
 * a meal card. Over-long text is truncated by the caller, not rejected — the dish
 * choice is still good.
 */
export const MAX_RATIONALE_LENGTH = 240;

/**
 * The shape a generated meal must have.
 *
 * `dish` is a plain string here and an *enum of the slugs valid for this slot* in
 * the JSON schema handed to the API (see `prompt.ts`). Both checks exist on
 * purpose: the enum stops the model from naming a dish that does not exist or does
 * not belong in this slot, and `generate.ts` re-checks every slug against the
 * catalog anyway, because a schema the provider enforces is still a promise made
 * by someone else.
 *
 * There is no `slotKey` field. A day is an OBJECT keyed by slot, not a list of
 * meals — see `parseGeneratedPlan`.
 */
export const generatedMealSchema = z.object({
  dish: z.string().trim().min(1).max(120),
  servings: z.coerce.number().min(MIN_SERVINGS).max(MAX_SERVINGS),
  rationaleAr: z.string().trim().max(2000).default(''),
  alternatives: z
    .array(
      z.object({
        dish: z.string().trim().min(1).max(120),
        servings: z.coerce.number().min(MIN_SERVINGS).max(MAX_SERVINGS),
      }),
    )
    .max(3)
    .default([]),
});

export type GeneratedMeal = z.infer<typeof generatedMealSchema> & { slotKey: string };

/** The canonical shape the rest of the feature works in, after parsing. */
export type GeneratedPlan = {
  days: { dayOfWeek: number; meals: GeneratedMeal[] }[];
};

/**
 * Parses a response whose days are keyed by slot.
 *
 * The model returns `{ days: [{ dayOfWeek: 0, breakfast: {...}, lunch: {...} }] }`
 * rather than a list of meals carrying their own `slotKey`. That is a deliberately
 * narrower contract than an array:
 *
 *  - a slot cannot be missing, because every slot is a required property;
 *  - a slot cannot be duplicated, because an object has one value per key;
 *  - a slot cannot be invented, because `additionalProperties` is false;
 *  - and each slot's `dish` enum lists only dishes valid for THAT meal type, so a
 *    breakfast dish at lunch is unrepresentable rather than merely discouraged.
 *
 * Each slot is nonetheless `optional()` here. The provider enforces `required`,
 * but this code does not depend on that being true — a missing slot is reconciled
 * into an empty meal, and a partial plan is worth more than a rejected one.
 *
 * Output is flattened to the canonical array form so nothing downstream has to
 * know about dynamic keys.
 */
export function parseGeneratedPlan(raw: unknown, slotKeys: readonly string[]): GeneratedPlan {
  // The days are read as open records and their fields validated individually,
  // rather than by building an object schema with dynamic keys — `z.object().extend()`
  // over a `Record<string, …>` widens every known field's inferred type, including
  // `dayOfWeek`, which then has to be cast back. This is the same validation with
  // types that mean what they say.
  const { days } = z
    .object({ days: z.array(z.record(z.string(), z.unknown())).min(1).max(7) })
    .parse(raw);

  const dayOfWeek = z.number().int().min(0).max(6);
  const slot = generatedMealSchema.optional();

  return {
    days: days.map((day) => ({
      dayOfWeek: dayOfWeek.parse(day.dayOfWeek),
      // Only the client's own slots are read, so a slot the model invented is
      // ignored rather than stored.
      meals: slotKeys.flatMap((slotKey) => {
        const meal = slot.parse(day[slotKey]);
        return meal ? [{ ...meal, slotKey }] : [];
      }),
    })),
  };
}
