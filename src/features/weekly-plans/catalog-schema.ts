import { z } from 'zod';

import { ALLERGENS } from '@/features/clients/nutrition';

import { MEAL_TYPES } from './schema';

/**
 * Validation for dishes and foods a clinic creates in its own catalog.
 *
 * Kept out of `schema.ts` only to keep that file about generation; the same Zod
 * discipline applies. Ids are validated as uuids but their ownership is checked
 * in the mutation, not here — a schema cannot know which clinic is calling.
 */
const uuid = z.string().uuid();

export const ingredientInputSchema = z.object({
  foodId: uuid,
  quantityGrams: z.coerce.number().positive(),
  displayNameAr: z.string().trim().max(120).optional(),
  householdLabel: z.string().trim().max(60).optional(),
  householdGrams: z.coerce.number().positive().optional(),
});

export const clinicDishInputSchema = z.object({
  nameAr: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().min(1).max(120),
  mealTypes: z.array(z.enum(MEAL_TYPES)).min(1),
  tags: z.array(z.string().trim().min(1).max(40)),
  allergenTags: z.array(z.enum(ALLERGENS)),
  baseServingLabel: z.string().trim().min(1).max(60),
  ingredients: z.array(ingredientInputSchema).min(1),
});

export type ClinicDishInput = z.infer<typeof clinicDishInputSchema>;

export const customFoodInputSchema = z.object({
  description: z.string().trim().min(1).max(200),
  nameAr: z.string().trim().min(1).max(120),
  kcal: z.coerce.number().nonnegative(),
  protein: z.coerce.number().nonnegative(),
  carbs: z.coerce.number().nonnegative(),
  fat: z.coerce.number().nonnegative(),
});

export type CustomFoodInput = z.infer<typeof customFoodInputSchema>;
