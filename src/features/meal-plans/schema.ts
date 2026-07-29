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

export const mealFormSchema = z.object({
  label: z.string().trim().min(1).max(60),
  timeOfDay: timeOfDaySchema,
});

export type MealFormInput = z.infer<typeof mealFormSchema>;

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

export const foodSearchSchema = z.object({
  q: z.preprocess(blankToUndefined, z.string().trim().max(120).optional()),
  category: z.preprocess(blankToUndefined, z.string().trim().max(120).optional()),
});

export type FoodSearchInput = z.infer<typeof foodSearchSchema>;
