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
 * The four **declared axes** — see `docs/catalog.md`.
 *
 * Unlike `DISH_TAGS` these are fields, not a bag: every dish carries exactly one
 * value on each of the four, and none may be absent. A tag bag lets a dish end
 * up describing nothing, which is how `no_cook` came to sit on two dishes out of
 * a hundred and thirteen.
 *
 * They hold only what the recipe cannot know. Anything derivable from the
 * ingredients — vegetarian, allergens, protein source, carb base, the nutrition
 * category — is computed and must never be added here, or a dish could be
 * labelled to contradict its own food.
 *
 * They replaced `DISH_TAGS` outright: eight optional labels where a dish could
 * end up carrying none, and where every extra one ANDed the filter down. The
 * column is gone.
 */

/** Where a client obtains the dish. Drives `isFixedPortion`. */
export const DISH_SOURCES = ['home', 'street', 'restaurant', 'shop'] as const;

/** How much work it is. Replaces the overlapping `quick`/`easy_prep`/`no_cook`. */
export const DISH_EFFORTS = ['no_cook', 'quick', 'medium', 'long'] as const;

/** Price relative to the local basket, not an absolute figure. */
export const DISH_COSTS = ['cheap', 'normal', 'expensive'] as const;

/** When the dish belongs. Keeps كنافة out of a Tuesday afternoon. */
export const DISH_OCCASIONS = ['everyday', 'family', 'ramadan', 'festive'] as const;

export type MealType = (typeof MEAL_TYPES)[number];
export type DishSource = (typeof DISH_SOURCES)[number];
export type DishEffort = (typeof DISH_EFFORTS)[number];
export type DishCost = (typeof DISH_COSTS)[number];
export type DishOccasion = (typeof DISH_OCCASIONS)[number];

/**
 * Whether a dish is sold in whole units.
 *
 * Nobody eats 0.7 of a shawarma sandwich. Street and restaurant food arrives as
 * a thing, not as a weight, so the serving multiplier has to move in whole steps
 * — the same rule `UNIT_STEPS` applies to a single line, applied to the dish.
 *
 * Derived from `source` rather than stored: a dish that is bought ready-made is
 * exactly the set that cannot be subdivided, and a second column would only
 * create the chance for the two to disagree.
 *
 * Takes a plain `string` because that is how a source arrives — out of a text
 * column, through types that pass the catalog vocabulary along without narrowing
 * it. The closed set is enforced once, at the seed. Anything unrecognised is not
 * fixed, which is the safe answer: a dish keeps being divisible.
 */
export function isFixedPortion(source: string): boolean {
  return source === 'street' || source === 'restaurant';
}

/**
 * The four axes as one list, for anything that has to loop over them.
 *
 * The filter panels, the catalog page's query string, the clinic dish form and
 * `db:check`'s distribution report all iterate the same four in the same order,
 * and each of them getting its own copy is how one of them ends up out of date.
 * The order is the order they are offered in: where you get it first, because it
 * is the question that most often has an answer.
 */
export const DISH_AXES = [
  {
    key: 'source',
    label: 'axisLabels.source',
    values: [
      { value: 'home', message: 'axes.source.home' },
      { value: 'street', message: 'axes.source.street' },
      { value: 'restaurant', message: 'axes.source.restaurant' },
      { value: 'shop', message: 'axes.source.shop' },
    ],
  },
  {
    key: 'effort',
    label: 'axisLabels.effort',
    values: [
      { value: 'no_cook', message: 'axes.effort.no_cook' },
      { value: 'quick', message: 'axes.effort.quick' },
      { value: 'medium', message: 'axes.effort.medium' },
      { value: 'long', message: 'axes.effort.long' },
    ],
  },
  {
    key: 'cost',
    label: 'axisLabels.cost',
    values: [
      { value: 'cheap', message: 'axes.cost.cheap' },
      { value: 'normal', message: 'axes.cost.normal' },
      { value: 'expensive', message: 'axes.cost.expensive' },
    ],
  },
  {
    key: 'occasion',
    label: 'axisLabels.occasion',
    values: [
      { value: 'everyday', message: 'axes.occasion.everyday' },
      { value: 'family', message: 'axes.occasion.family' },
      { value: 'ramadan', message: 'axes.occasion.ramadan' },
      { value: 'festive', message: 'axes.occasion.festive' },
    ],
  },
] as const;

/**
 * The message key for one axis value, as a literal.
 *
 * next-intl only accepts keys it can see, and `t(\`axes.${key}.${value}\`)`
 * widens to every combination of the two — including `axes.occasion.expensive`,
 * which does not exist. Carrying the key beside the value keeps the union exact.
 */
export type AxisMessageKey = (typeof DISH_AXES)[number]['values'][number]['message'];

export function axisMessageKey(key: DishAxisKey, value: string): AxisMessageKey {
  const axis = DISH_AXES.find((one) => one.key === key);
  const found = axis?.values.find((one) => one.value === value)?.message;

  // A value outside the closed set can only come from a clinic row written before
  // the axes existed. Naming it "home" is the honest fallback: unlabelled food is
  // food someone cooked.
  return found ?? 'axes.source.home';
}

export type DishAxisKey = (typeof DISH_AXES)[number]['key'];

/** A selection on each axis, empty meaning "not narrowed on this one". */
export type DishAxisFilters = {
  source: readonly string[];
  effort: readonly string[];
  cost: readonly string[];
  occasion: readonly string[];
};

export const EMPTY_AXIS_FILTERS: DishAxisFilters = {
  source: [],
  effort: [],
  cost: [],
  occasion: [],
};

/**
 * Whether a dish survives an axis selection.
 *
 * **OR within an axis, AND across axes.** Picking `street` and `restaurant` asks
 * for either, because they are alternative answers to one question; picking
 * `street` and `quick` asks for both, because they are answers to two. This is
 * the opposite of how `tags` combined — every tag was an AND — and it is the
 * difference between a facet and a bag.
 */
export function matchesAxes(
  dish: { source: string; effort: string; cost: string; occasion: string },
  filters: DishAxisFilters,
): boolean {
  return DISH_AXES.every(({ key }) => {
    const selected = filters[key];
    return selected.length === 0 || selected.includes(dish[key]);
  });
}

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

export const GENERATION_SCOPES = ['week', 'day', 'meal', 'review'] as const;
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

/**
 * How many things may stand beside one main.
 *
 * The same cap the prompt gives the model (`MAX_SIDES`), stated again here
 * because the dietitian's own hand is a second way in and a plate with five
 * accompaniments is not a plate any more. Two is a salad and a soup, which is
 * what a Palestinian lunch actually carries.
 */
export const MAX_MEAL_SIDES = 2;

/**
 * The whole set of sides on one meal, replaced at once.
 *
 * Not add-one / remove-one. A side has no identity of its own — it is a dish id
 * in a set — so "the sides are now these" is both the simplest thing the client
 * can say and the only one that cannot drift: two clicks racing each other
 * produce one of the two answers rather than a merge of both. It also makes
 * *removing the last one* the same write as changing one, which is the case the
 * dietitian actually needs — a lunch does not always come with a salad.
 *
 * `dishIds` arrives as a comma-separated field because this posts from a form
 * like every other edit. Empty means no sides.
 */
export const setMealSidesSchema = z.object({
  ...editBase,
  mealId: mealIdSchema,
  dishIds: z.preprocess(
    (value) =>
      typeof value === 'string'
        ? value.split(',').map((one) => one.trim()).filter(Boolean)
        : value,
    z.array(dishIdSchema).max(MAX_MEAL_SIDES),
  ),
});

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
  /**
   * Slugs of dishes to stand beside the main — صحن سلطة، كوب شوربة.
   *
   * Defaulted rather than required, so a response written before sides existed,
   * or one from a model that omitted the key, parses into a meal with no sides
   * instead of failing the whole week.
   */
  sides: z.array(z.string().trim().min(1).max(120)).default([]),
});

export type GeneratedMeal = z.infer<typeof generatedMealSchema> & { slotKey: string };

/**
 * How long the dietitian's notes on a week may be.
 *
 * `summary_ar` used to hold three sentences describing the week, and 400
 * characters was the length at which that stopped being a summary. It holds
 * **notes** now — two to four short things the dietitian can act on, one per
 * line — and four Arabic lines with a day and a dish named in each do not fit in
 * 400. 900 is roughly six such lines, which is past the point where a note stops
 * being read anyway.
 *
 * Over-long text is trimmed rather than refused, for the same reason an over-long
 * rationale is: the plan is still good.
 */
export const MAX_SUMMARY_LENGTH = 900;

/** The canonical shape the rest of the feature works in, after parsing. */
export type GeneratedPlan = {
  /** The model's description of this week as a whole. Empty when it wrote none. */
  summaryAr: string;
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
  const { summaryAr, days } = z
    .object({
      // Defaulted rather than required: a plan whose summary went missing is a
      // plan, and refusing thirty-five meals over a caption would be absurd.
      summaryAr: z.string().trim().max(4000).default(''),
      days: z.array(z.record(z.string(), z.unknown())).min(1).max(7),
    })
    .parse(raw);

  const dayOfWeek = z.number().int().min(0).max(6);
  const slot = generatedMealSchema.optional();

  return {
    summaryAr,
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
