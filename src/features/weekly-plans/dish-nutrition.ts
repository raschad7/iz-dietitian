/**
 * Nutrition for a dish, at a serving multiplier.
 *
 * A thin layer over `src/features/meal-plans/nutrition.ts` rather than a second
 * implementation. V1 and V2 must never be able to disagree about what 120 g of
 * chickpeas contains, so there is exactly one place that unwinds the per-100 g
 * basis and exactly one place that decides a null nutrient is "not measured"
 * rather than zero.
 *
 * All pure. No database, no React.
 */

import {
  combineTotals,
  emptyTotals,
  sumNutrients,
  type FoodNutrients,
  type NutrientSource,
  type NutrientTotals,
} from '@/features/meal-plans/nutrition';

/** A recipe line, as the queries hand it over. */
export type DishIngredientDetail = {
  /** Grams for ONE base serving. */
  quantityGrams: number;
  food: { id: string; description: string } & FoodNutrients;
};

export type DishDetail = {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  mealTypes: string[];
  tags: string[];
  allergenTags: string[];
  baseServingLabel: string;
  ingredients: DishIngredientDetail[];
};

/**
 * Scales a recipe to `servings` and sums it.
 *
 * The multiplier is applied to the grams, not to the totals: multiplying a total
 * would give the same answer for the macros but would also multiply
 * `unmeasured`, turning "one ingredient's fibre is unknown" into "one and a half
 * ingredients' fibre is unknown".
 */
export function dishTotals(
  ingredients: readonly DishIngredientDetail[],
  servings: number,
): NutrientTotals {
  const sources: NutrientSource[] = ingredients.map((ingredient) => ({
    quantityGrams: ingredient.quantityGrams * servings,
    food: ingredient.food,
  }));

  return sumNutrients(sources);
}

/**
 * Energy for one base serving of a dish.
 *
 * Used to size a dish against a slot budget before any plan exists — which is how
 * `similar.ts` ranks candidates and how the prompt tells the model what it is
 * choosing between.
 */
export function baseServingKcal(ingredients: readonly DishIngredientDetail[]): number {
  return dishTotals(ingredients, 1).kcal.value;
}

/** Rolls meals up into a day, and days into a week. Re-exported so callers need one import. */
export { combineTotals, emptyTotals };
