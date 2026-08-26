/**
 * What one planned meal contains — the single answer, from one of two sources.
 *
 * A meal is normally a dish and a multiplier: `servings` scales every line of the
 * recipe together. That is one number for the whole plate, and a dietitian does
 * not prescribe that way. She raises the chicken, drops the rice by a spoon, and
 * leaves the eggplant, the oil and the pine nuts exactly where the recipe put
 * them. No single multiplier can say that.
 *
 * So a meal may instead carry its own `weekly_plan_meal_ingredients` rows, written
 * the first time an ingredient control is touched. From then on those rows ARE the
 * meal and `servings` is not consulted.
 *
 * ## One rule, in one function
 *
 * {@link mealIngredientLines} is that rule: **own rows if there are any, the
 * scaled recipe otherwise**. Every surface that needs to know what a meal contains
 * — the board, the meal panel, the patient portal, the publish snapshot, the
 * nutrition totals — goes through it, so a meal can never be described one way by
 * its calories and another way by its ingredient list.
 *
 * ## Lines are absolute
 *
 * Everything this module returns is the amount **in this meal**, already scaled.
 * Nothing downstream multiplies again. That is deliberate: the old shape passed a
 * per-serving line and a multiplier side by side to every renderer, and every one
 * of them had to remember to apply it. Resolving once, here, is what makes a
 * forgotten multiplication impossible rather than merely unlikely.
 *
 * ## It is not a second nutrition path
 *
 * Grams remain the only input to the per-100 g arithmetic in `nutrition.ts`, and
 * this module produces grams. A portion count travels beside them as a *display*
 * of the same quantity in the unit it was counted in, exactly as it does on a
 * recipe line.
 */

import { GRAMS_STEP, stepQuantity, unitStep } from './ingredient-units';
import {
  dishGrams,
  dishTotals,
  type DishIngredientDetail,
  type IngredientPortion,
  type NutrientTotals,
} from './nutrition';

/**
 * A recipe line, per ONE base serving, plus whether it carries a control.
 *
 * `DishIngredientDetail` with the dish's own metadata attached — the shape
 * `loadCatalog` and the board queries hand over.
 */
export type RecipeLine = DishIngredientDetail & {
  isPrimary: boolean;
  sortOrder: number;
};

/**
 * One line of a planned meal, at the amount actually prescribed.
 *
 * Structurally a `DishIngredientDetail`, so it drops straight into `dishTotals`
 * and `dishGrams` with no adapter and no second arithmetic.
 */
export type MealIngredientLine = DishIngredientDetail & {
  portion: IngredientPortion | null;
  portionQuantity: number | null;
  /** Whether this line gets a `−/+` control. Copied from the recipe, never re-derived. */
  isPrimary: boolean;
  sortOrder: number;
};

/** A multiplier that could not scale anything is treated as one, never as zero. */
function usableServings(servings: number): number {
  return Number.isFinite(servings) && servings > 0 ? servings : 1;
}

/**
 * The recipe at a serving multiplier — the classic behaviour, made explicit.
 *
 * The portion count scales with the grams so the two keep describing the same
 * amount: one and a half servings of a dish written as `4 ملاعق` is `6 ملاعق`, not
 * four spoons beside a weight that says otherwise.
 */
export function scaleRecipe(
  recipe: readonly RecipeLine[],
  servings: number,
): MealIngredientLine[] {
  const multiplier = usableServings(servings);

  return recipe.map((line) => ({
    ...line,
    quantityGrams: line.quantityGrams * multiplier,
    portion: line.portion ?? null,
    portionQuantity:
      typeof line.portionQuantity === 'number' && line.portionQuantity > 0
        ? line.portionQuantity * multiplier
        : null,
  }));
}

/**
 * What this meal contains.
 *
 * `stored` wins whenever it holds anything. An empty array and a null mean the
 * same thing — this meal was never adjusted by hand — because a meal with zero
 * ingredients is not a state the writer can produce: materialisation copies the
 * whole recipe or nothing at all.
 */
export function mealIngredientLines({
  recipe,
  servings,
  stored,
}: {
  recipe: readonly RecipeLine[];
  servings: number;
  /** The meal's own rows, already absolute. */
  stored?: readonly MealIngredientLine[] | null;
}): MealIngredientLine[] {
  const lines = stored?.length ? [...stored] : scaleRecipe(recipe, servings);
  return lines.sort((a, b) => a.sortOrder - b.sortOrder);
}

/** True once this meal owns its amounts and the dish multiplier no longer applies. */
export function hasOwnAmounts(stored?: readonly unknown[] | null): boolean {
  return Boolean(stored?.length);
}

/**
 * The meal's nutrition, from its resolved lines.
 *
 * Delegates rather than re-implements: `dishTotals` at a multiplier of one is the
 * same arithmetic the feature has always used, and the lines arriving here are
 * already the amounts to sum.
 */
export function mealTotals(lines: readonly MealIngredientLine[]): NutrientTotals {
  return dishTotals(lines, 1);
}

/** The meal's total weight, from the same lines the calories came from. */
export function mealGrams(lines: readonly MealIngredientLine[]): number {
  return dishGrams(lines, 1);
}

/** Just the lines a dietitian adjusts, in recipe order. */
export function primaryLines(lines: readonly MealIngredientLine[]): MealIngredientLine[] {
  return lines.filter((line) => line.isPrimary);
}

/**
 * The largest amount of one food a single meal may carry, in grams.
 *
 * Not a clinical limit — it is a guard on a number that arrives from a form, and
 * the ceiling the `+` stops at. Two kilos of anything on one plate is a typo or a
 * probe, and both are better refused than stored and then rendered as a
 * prescription. Lives here rather than beside the mutation that enforces it so the
 * control in the browser can read it without importing the database.
 */
export const MAX_INGREDIENT_GRAMS = 2000;

/** What one press of `−` or `+` leaves an ingredient at. */
export type IngredientAmountChange = {
  foodId: string;
  quantityGrams: number;
  portionId: string | null;
  portionQuantity: number | null;
};

/**
 * One press of a line's `−` or `+`.
 *
 * Steps **in the line's own unit** and derives grams from it, rather than stepping
 * grams and hoping the count still reads well: a loaf moves to `1½ رغيف` and weighs
 * whatever one and a half of that loaf weigh. A line with no usable unit steps in
 * grams instead, which is what meat, poultry and fish do by product choice.
 *
 * Pure, and here rather than in the control, so "what does + do to six spoons of
 * rice" is a question with a unit test rather than a click.
 */
export function nextIngredientAmount(
  line: MealIngredientLine,
  direction: -1 | 1,
): IngredientAmountChange {
  const { portion, portionQuantity } = line;

  if (
    portion &&
    portion.grams > 0 &&
    typeof portionQuantity === 'number' &&
    Number.isFinite(portionQuantity) &&
    portionQuantity > 0
  ) {
    const count = stepQuantity(portionQuantity, unitStep(portion), direction);

    return {
      foodId: line.food.id,
      quantityGrams: count * portion.grams,
      portionId: portion.id,
      portionQuantity: count,
    };
  }

  return {
    foodId: line.food.id,
    quantityGrams: stepQuantity(line.quantityGrams, GRAMS_STEP, direction),
    portionId: null,
    portionQuantity: null,
  };
}
