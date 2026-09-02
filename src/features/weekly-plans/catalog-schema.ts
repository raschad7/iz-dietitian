import { z } from 'zod';

import { ALLERGENS } from '@/features/clients/nutrition';

import {
  DISH_COSTS,
  DISH_EFFORTS,
  DISH_OCCASIONS,
  DISH_SOURCES,
  MEAL_TYPES,
} from './schema';

/**
 * Validation for dishes and foods a clinic creates in its own catalog.
 *
 * Kept out of `schema.ts` only to keep that file about generation; the same Zod
 * discipline applies. Ids are validated as uuids but their ownership is checked
 * in the mutation, not here — a schema cannot know which clinic is calling.
 */
const uuid = z.string().uuid();

/**
 * One recipe line.
 *
 * `quantityGrams` is the authoritative amount and is what nutrition is computed
 * from; the portion pair only records how the dietitian typed it. Both are
 * validated here for shape — finite and positive — while the two questions a
 * schema cannot answer (does this portion belong to this food, and can this clinic
 * see it) are checked against the database in `catalog-mutations.ts`.
 */
export const ingredientInputSchema = z
  .object({
    foodId: uuid,
    // `.finite()` as well as `.positive()`: `Number("Infinity")` coerces happily,
    // and an infinite gram count would poison every total on the plan.
    quantityGrams: z.coerce.number().positive().finite(),
    portionId: uuid.nullish(),
    portionQuantity: z.coerce.number().positive().finite().nullish(),
  })
  .refine(
    (value) =>
      (value.portionId == null && value.portionQuantity == null) ||
      (value.portionId != null && value.portionQuantity != null),
    {
      // Half a record of how the amount was entered is not a record of anything:
      // a portion with no count cannot be rendered, and a count with no portion
      // has no unit. Grams-only lines carry neither.
      message: 'A portion and its quantity must be given together, or neither.',
      path: ['portionQuantity'],
    },
  );

export const clinicDishInputSchema = z.object({
  nameAr: z.string().trim().min(1).max(120),
  // Optional and secondary in the UI: Arabic is the working name, and forcing an
  // English translation for every clinic dish was friction with no payoff. Stored
  // as '' when blank (the column is NOT NULL); the slug's random tail keeps it
  // unique regardless, and the catalog renders the English line only when present.
  nameEn: z.string().trim().max(120).optional().default(''),
  mealTypes: z.array(z.enum(MEAL_TYPES)).min(1),
  // The four declared axes, each a single value from its own closed set. A dish
  // that answers nothing is what the old tag bag allowed; here every one is
  // required and an unknown value is rejected rather than silently stored.
  // Nutrition stays computed and is never among them.
  source: z.enum(DISH_SOURCES),
  effort: z.enum(DISH_EFFORTS),
  cost: z.enum(DISH_COSTS),
  occasion: z.enum(DISH_OCCASIONS),
  allergenTags: z.array(z.enum(ALLERGENS)),
  baseServingLabel: z.string().trim().min(1).max(60),
  ingredients: z.array(ingredientInputSchema).min(1),
});

export type ClinicDishInput = z.infer<typeof clinicDishInputSchema>;

/**
 * The household units a custom food may be measured in — the keys of
 * `CUSTOM_UNIT_LABELS`, plus `g`. Kept as a literal tuple here (rather than
 * derived) because Zod needs a non-empty tuple for `z.enum`; the two are asserted
 * to agree in `catalog-schema.test.ts`.
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
    // The natural serving unit, written as one `catalog_food_portions` row. `g`
    // (or omitted) means grams-only and creates no portion. A household unit must
    // carry a positive grams-per-unit, enforced below.
    unit: z.enum(CUSTOM_FOOD_UNITS).optional(),
    unitGrams: z.coerce.number().positive().finite().optional(),
  })
  .refine((value) => !(value.unit && value.unit !== 'g') || (value.unitGrams ?? 0) > 0, {
    message: 'A household unit needs a positive grams-per-unit value.',
    path: ['unitGrams'],
  });

export type CustomFoodInput = z.infer<typeof customFoodInputSchema>;
