import { z } from 'zod';

import { mealSlotSchema, timeOfDaySchema } from '@/features/clients/nutrition';
import { CLIENT_GOALS } from '@/features/clients/schema';

import { MAX_SERVINGS, MIN_SERVINGS } from './similar';

/**
 * The client's own nutrition vocabulary, re-exported.
 *
 * These moved to `src/features/clients/nutrition.ts` when the nutrition profile
 * stopped being a form this feature owns — see the note there. Re-exported
 * rather than relocated at every call site: the planner still validates against
 * exactly these, and thirty imports pointing here is not the interesting part of
 * that change.
 */
export {
  ALLERGENS,
  DEFAULT_MEAL_SCHEDULE,
  mealScheduleSchema,
  mealSlotSchema,
  timeOfDaySchema,
  toTimeInput,
  type Allergen,
  type MealScheduleInput,
} from '@/features/clients/nutrition';

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

/**
 * The **manual, practical** dish tags — and only those.
 *
 * These describe how a dish fits into a real week (cost, effort, cuisine), which
 * is exactly what a dietitian's instruction resolves against and what the numbers
 * cannot know. Nutrition is deliberately absent: "high protein" is *computed* from
 * the recipe by `nutritionCategory()` in `nutrition.ts`, the single source of
 * truth, so it cannot be hand-set to disagree with the food. Disease suitability
 * (the former `diabetic_friendly`) is absent too — that is a patient-specific
 * clinical judgement, not a boolean a dish carries.
 *
 * The order is the accent-colour priority in `meal-tag-tone.ts` and the chip
 * order in the catalog filters.
 */
export const DISH_TAGS = [
  'economical',
  'quick',
  'easy_prep',
  'no_cook',
  'portable',
  'filling',
  'local',
  'vegetarian',
] as const;

export type MealType = (typeof MEAL_TYPES)[number];
export type DishTag = (typeof DISH_TAGS)[number];

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

/**
 * An absent or empty form field, as `undefined`.
 *
 * `null` as well as `''`: `FormData.get` returns `null` for a field the form
 * does not render at all, and every schema downstream of this spells "not
 * given" as `.optional()`, which accepts `undefined` and rejects `null`. So a
 * control that is removed from a form — the generate door's goal select, for
 * one — would fail the whole parse rather than falling back to its default,
 * and the caller would see "unexpected error" for a field it deliberately
 * stopped sending.
 */
function blankToUndefined(value: unknown): unknown {
  if (value === null) return undefined;

  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

function optionalText(max: number) {
  return z.preprocess(blankToUndefined, z.string().trim().max(max).optional());
}

// ---------------------------------------------------------------------------
// The client's schedule
// ---------------------------------------------------------------------------

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
// Editing a plan
// ---------------------------------------------------------------------------

/**
 * Shared by every edit: which plan.
 *
 * There was an `allowPublished` flag here, letting a caller opt into editing a plan
 * the client was already following. It is gone: publishing freezes each meal's
 * nutrition, so editing in place would leave a frozen total describing a dish the
 * plan no longer holds. A published plan is now immutable and must be unpublished
 * before it can be edited — enforced in `editablePlan` (`editor-mutations.ts`), and
 * the field is dropped here so a form can no longer even ask for it.
 */
const editBase = { planId: planIdSchema };

export const placeDishSchema = z.object({
  ...editBase,
  mealId: mealIdSchema,
  dishId: dishIdSchema,
  servings: z.coerce.number().min(MIN_SERVINGS).max(MAX_SERVINGS),
});

export const setServingsSchema = z.object({
  ...editBase,
  mealId: mealIdSchema,
  servings: z.coerce.number().min(MIN_SERVINGS).max(MAX_SERVINGS),
});

/**
 * One ingredient's amount inside one meal.
 *
 * `quantityGrams` is what the server stores and computes from; the portion pair
 * beside it records the unit the dietitian was counting in, and is accepted only
 * together — a unit with no count, or a count with no unit, describes nothing.
 *
 * The upper bound matches `MAX_INGREDIENT_GRAMS`, and is a guard on form input
 * rather than a clinical limit. The mutation re-checks it: this schema protects
 * the action, and the mutation protects everything that is not this action.
 */
export const setMealIngredientSchema = z
  .object({
    ...editBase,
    mealId: mealIdSchema,
    foodId: z.uuid(),
    quantityGrams: z.coerce.number().positive().max(2000),
    portionId: z.uuid().nullish(),
    portionQuantity: z.coerce.number().positive().nullish(),
  })
  .refine(
    (value) => (value.portionId == null) === (value.portionQuantity == null),
    'a portion and its count must be given together',
  );

export const mealEditSchema = z.object({ ...editBase, mealId: mealIdSchema });

export const addMealSchema = z.object({
  ...editBase,
  dayOfWeek: dayOfWeekSchema,
  slotKey: mealSlotSchema.shape.slotKey,
  label: mealSlotSchema.shape.label,
  timeOfDay: timeOfDaySchema,
});

/**
 * The same slot, added to all seven days at once.
 *
 * No `dayOfWeek`, and that absence is the point: the board is drawn as a table
 * of slots against days, so a new slot is a new *row*. Adding one to a single
 * day is still possible — that is what restoring a skipped cell does — but it
 * is the exception, not the way a schedule grows.
 */
export const addWeekMealSchema = z.object({
  ...editBase,
  slotKey: mealSlotSchema.shape.slotKey,
  label: mealSlotSchema.shape.label,
  timeOfDay: timeOfDaySchema,
});

/** The same slot, removed from all seven days — see `addWeekMealSchema`. */
export const removeWeekMealSchema = z.object({
  ...editBase,
  slotKey: mealSlotSchema.shape.slotKey,
});

/**
 * Puts a removed slot back, with the dishes it was carrying.
 *
 * The undo half of `removeWeekMealSchema`, and it needs its own shape because
 * `addWeekMealSchema` cannot express it: adding a slot to the week creates
 * seven *empty* cells, and what was removed was seven cells with dishes in
 * them. The client sends back what it had on screen a moment ago, which is the
 * only place that information still exists once the rows are deleted.
 *
 * `days` arrives as JSON in a form field, so it is parsed here rather than
 * trusted: every dish id is re-checked against the clinic's catalog by
 * `restoreMealToWeek` before anything is written.
 */
export const restoreWeekMealSchema = z.object({
  ...editBase,
  slotKey: mealSlotSchema.shape.slotKey,
  label: mealSlotSchema.shape.label,
  timeOfDay: timeOfDaySchema,
  days: z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value;
      try {
        return JSON.parse(value);
      } catch {
        return undefined;
      }
    },
    z
      .array(
        z.object({
          dayOfWeek: dayOfWeekSchema,
          dishId: z.uuid().nullable(),
          servings: z.number().positive().max(20),
          budgetKcal: z.number().min(0).max(20000),
        }),
      )
      .max(7),
  ),
});

export const moveMealSchema = z.object({
  ...editBase,
  fromMealId: mealIdSchema,
  toMealId: mealIdSchema,
  mode: z.enum(['move', 'copy']),
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
