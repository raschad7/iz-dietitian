import { z } from 'zod';

import { ALLERGENS } from '@/features/clients/nutrition';

import { DISH_TAGS, MEAL_TYPES } from './schema';

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
  // Optional and secondary in the UI: Arabic is the working name, and forcing an
  // English translation for every clinic dish was friction with no payoff. Stored
  // as '' when blank (the column is NOT NULL); the slug's random tail keeps it
  // unique regardless, and the catalog renders the English line only when present.
  nameEn: z.string().trim().max(120).optional().default(''),
  mealTypes: z.array(z.enum(MEAL_TYPES)).min(1),
  // Only the practical tags, validated against the closed set: a removed tag
  // (`high_protein`, `diabetic_friendly`) or an unknown one is rejected here, not
  // silently stored. Nutrition is computed, never hand-tagged.
  tags: z.array(z.enum(DISH_TAGS)),
  allergenTags: z.array(z.enum(ALLERGENS)),
  baseServingLabel: z.string().trim().min(1).max(60),
  ingredients: z.array(ingredientInputSchema).min(1),
});

export type ClinicDishInput = z.infer<typeof clinicDishInputSchema>;

/**
 * The household units a custom food may be measured in — the UnitKeys from
 * `ingredient-units.ts`, plus `g`. Kept as a literal tuple here (rather than
 * imported) so this validation stays free of the unit module and Zod gets the
 * non-empty tuple it needs for `z.enum`.
 */
export const CUSTOM_FOOD_UNITS = ['loaf', 'piece', 'slice', 'cup', 'tbsp', 'tsp', 'g'] as const;

export const customFoodInputSchema = z
  .object({
    // The English name, optional and secondary like a dish's. When blank the
    // mutation falls back to the Arabic name so the row still has a description
    // (the column is NOT NULL and the reuse-by-description guard needs a value).
    description: z.string().trim().max(200).optional().default(''),
    nameAr: z.string().trim().min(1).max(120),
    kcal: z.coerce.number().nonnegative(),
    protein: z.coerce.number().nonnegative(),
    carbs: z.coerce.number().nonnegative(),
    fat: z.coerce.number().nonnegative(),
    // The natural serving unit, persisted on `foods.portionLabel` /
    // `.portionGrams` (spec §10). `g` (or omitted) means grams-only. A household
    // unit must carry a positive grams-per-unit, enforced below.
    unit: z.enum(CUSTOM_FOOD_UNITS).optional(),
    unitGrams: z.coerce.number().positive().optional(),
  })
  .refine((value) => !(value.unit && value.unit !== 'g') || (value.unitGrams ?? 0) > 0, {
    message: 'A household unit needs a positive grams-per-unit value.',
    path: ['unitGrams'],
  });

export type CustomFoodInput = z.infer<typeof customFoodInputSchema>;
