import { z } from 'zod';

/**
 * Validation for every meal-plan input. Mirrors `src/features/clients/schema.ts`
 * — the rules live here, not in the database, so extending them is a code change
 * rather than a migration.
 */

export const planIdSchema = z.uuid();
export const mealIdSchema = z.uuid();
export const itemIdSchema = z.uuid();
export const foodIdSchema = z.uuid();

/**
 * `HH:MM`, the value an `<input type="time">` submits.
 *
 * PostgreSQL hands `time` columns back as `HH:MM:SS`, so anything read from the
 * database goes through `toTimeInput` below before it reaches a form.
 */
export const timeOfDaySchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM');

/** Trims `HH:MM:SS` down to what an `<input type="time">` expects. */
export function toTimeInput(value: string): string {
  return value.slice(0, 5);
}

function blankToUndefined(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

export const planFormSchema = z.object({
  clientId: z.uuid(),
  title: z.string().trim().min(2).max(120),
  notes: z.preprocess(blankToUndefined, z.string().trim().max(2000).optional()),
});

export type PlanFormInput = z.infer<typeof planFormSchema>;

/**
 * The seven days, as stored: 0 = Sunday … 6 = Saturday, matching
 * `Date.prototype.getDay()`. The order here is the order the UI walks the week
 * in; the labels come from the message catalogue.
 */
export const DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6] as const;

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

/** Message-catalogue keys for the day names, indexed by `day_of_week`. */
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
 * `DAY_KEYS[n]` on a plain number widens to `| undefined` under
 * `noUncheckedIndexedAccess`, which would let `days.undefined` reach
 * `useTranslations` and throw at render. Every caller goes through here instead,
 * so an out-of-range day degrades to Sunday rather than to a missing message.
 */
export function dayKey(dayOfWeek: number): DayKey {
  return DAY_KEYS[dayOfWeek] ?? DAY_KEYS[0];
}

export const dayOfWeekSchema = z.coerce.number().int().min(0).max(6);

export const mealFormSchema = z.object({
  label: z.string().trim().min(1).max(60),
  timeOfDay: timeOfDaySchema,
});

export type MealFormInput = z.infer<typeof mealFormSchema>;

/**
 * Copying one day over another.
 *
 * `refine` rather than two independent fields: copying a day onto itself would
 * delete the source and then have nothing left to copy from, so it is rejected
 * here rather than guarded for downstream.
 */
export const copyDaySchema = z
  .object({
    fromDay: dayOfWeekSchema,
    toDay: dayOfWeekSchema,
  })
  .refine((value) => value.fromDay !== value.toDay, {
    message: 'cannot copy a day onto itself',
    path: ['toDay'],
  });

export type CopyDayInput = z.infer<typeof copyDaySchema>;

/**
 * A quantity in grams.
 *
 * The ceiling is deliberately generous — 5 kg covers any single plausible entry
 * (a stockpot of soup) while still catching the slipped decimal point that would
 * otherwise put 90,000 kcal in a breakfast.
 */
export const quantityGramsSchema = z.coerce.number().positive().max(5000);

export const itemFormSchema = z.object({
  foodId: foodIdSchema,
  quantityGrams: quantityGramsSchema,
});

export type ItemFormInput = z.infer<typeof itemFormSchema>;

/** How many foods the picker returns for one query. */
export const FOOD_SEARCH_LIMIT = 25;

/** How many foods one page of the browsable food table shows. */
export const FOODS_PAGE_SIZE = 25;

export const foodSearchSchema = z.object({
  q: z.preprocess(blankToUndefined, z.string().trim().max(120).optional()),
  category: z.preprocess(blankToUndefined, z.string().trim().max(120).optional()),
});

export type FoodSearchInput = z.infer<typeof foodSearchSchema>;

/**
 * Filters for the food browser. Every field uses `.catch()` so a hand-edited
 * query string degrades to the default view instead of throwing a 500, matching
 * `listClientsSchema`.
 */
export const listFoodsSchema = foodSearchSchema.extend({
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export type ListFoodsInput = z.infer<typeof listFoodsSchema>;

export const foodIdParamSchema = z.uuid();
