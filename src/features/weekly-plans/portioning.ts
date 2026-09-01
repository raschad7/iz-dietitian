/**
 * Turning a recipe and a multiplier into amounts a person can actually serve.
 *
 * A meal used to be the recipe multiplied straight through: every line times the
 * same number, to whatever decimal came out. The arithmetic was right and the
 * result was unusable — `تمر مجهول 1.88 حبة`, `برتقال 4.13 حبة`, `بيض ني 5½ حبة`,
 * `فراولة 24 حبة`. Nobody serves 1.88 of a date. A dietitian raises the chicken,
 * drops the rice by a spoon, leaves the garlic exactly where the recipe put it,
 * and writes every amount in whole units of the thing being measured.
 *
 * That is what this module does, and it is all it does. It has no opinion about
 * which dish belongs in which slot; it answers one question — *what does this
 * recipe look like at this multiplier* — and answers it the same way every time.
 *
 * ## Three rules, in order
 *
 * **1. A line moves in steps of its own unit.** Bread by half a رغيف, rice by a
 * spoon, an egg by a whole egg, meat by ten grams. The step comes from the unit
 * the amount is written in, because that is the unit the instruction is read in.
 *
 * **2. Steps are counted from the recipe, never from zero.** A dish holding 1.5
 * oranges at one serving still holds 1.5 oranges at one serving — snapping to an
 * absolute grid would quietly rewrite every recipe whose author wrote a half, and
 * a dish whose stated energy no longer matched its own ingredients would poison
 * every ranking built on it. So `portionRecipe(recipe, 1)` returns the recipe,
 * exactly, and every other multiplier is a whole number of steps away from it.
 *
 * **3. A ceiling limits growth and never rewrites the dish.** Three eggs is a
 * breakfast; six is not. But a recipe that already calls for twelve strawberries
 * is a recipe, not an error, so a ceiling can only ever stop a line growing —
 * `max(recipe, ceiling)` — and can never shrink one below what its author wrote.
 *
 * ## What does not scale
 *
 * Herbs, spices, and any small line that carries no meaningful energy. Doubling a
 * dish does not double its garlic, and `ثوم 13.8 غ` is not an instruction anyone
 * follows. They stay where the recipe put them, and because their energy is
 * negligible by the same test that froze them, the totals do not care.
 *
 * ## It is still not a second nutrition path
 *
 * Grams remain the only input to the per-100 g arithmetic. This module decides
 * *what* the grams are; `nutrition.ts` decides what they contain. Because
 * `mealIngredientLines` resolves a meal through here and `mealTotals` sums the
 * lines it returns, a meal's calories are computed from the amounts printed on
 * the page — the two cannot drift apart, because they are the same numbers.
 */

import { GRAMS_STEP } from './ingredient-units';
import type { FoodNutrients } from './nutrition';
import { MAX_SERVINGS, MIN_SERVINGS, SERVING_STEP } from './similar';

/** What portioning needs of a recipe line. A subset of `DishIngredientDetail`. */
export type PortionableLine = {
  /** Grams for ONE base serving. */
  quantityGrams: number;
  food: { category?: string | null } & Pick<FoodNutrients, 'kcal'>;
  portion?: { labelEn: string; grams: number } | null;
  /** How many of that portion one base serving is. */
  portionQuantity?: number | null;
  isPrimary?: boolean;
};

/** One line's amount in a meal, in both the unit it is written in and grams. */
export type PortionedAmount = {
  quantityGrams: number;
  /** Null when the line is measured in grams, or its portion is unusable. */
  portionQuantity: number | null;
};

/**
 * How much one press of a unit is worth, in that unit.
 *
 * The same increments as `unitStep` in `ingredient-units.ts`, which is what the
 * dietitian's `−`/`+` moves by — deliberately, so a generated amount sits on the
 * grid her buttons walk. A unit whose label already names a fraction (`نصف كوب`)
 * moves by whole ones: a quarter of a half cup is arithmetic nobody serves.
 *
 * An egg moves by a whole egg. Half a رغيف is a real instruction and half an egg
 * is not, which is the distinction the table encodes.
 */
const UNIT_STEPS: Record<string, number> = {
  Cup: 0.25,
  Loaf: 0.5,
  Container: 0.5,
};

/**
 * The most of one food a single meal may grow to.
 *
 * Ceilings, not targets: a line only meets one when a multiplier tried to push it
 * past, and a recipe already above its ceiling keeps what it was written with
 * (rule 3). Each is the point past which the amount stops reading as a serving
 * and starts reading as a mistake — three eggs, three pieces of fruit, two tins,
 * 200 g of cooked meat on a plate.
 *
 * Keyed by unit and then by the food's category, because the unit alone cannot
 * tell an egg from an orange and the two have different answers.
 */
const PIECE_CEILINGS: Record<string, number> = {
  dairy_eggs: 3,
  fruits: 3,
  vegetables: 3,
};

/**
 * Weight ceilings by category, in grams.
 *
 * They bind on a counted line as well as a weighed one, because a count says
 * nothing about size: one "piece" of watermelon is 286 g, so three of them is
 * 858 g of watermelon and the piece ceiling alone would wave it through.
 */
const GRAM_CEILINGS: Record<string, number> = {
  meat: 200,
  poultry: 200,
  fish: 200,
  fruits: 400,
  vegetables: 500,
  dairy_eggs: 400,
};

const CONTAINER_CEILING = 2;

/**
 * How many grams a weighed line moves by, where ten is too coarse to be useful.
 *
 * Ten grams of olive oil is ninety kilocalories — a step that size turns "a bit
 * more oil" into a quarter of a snack. Five grams is a teaspoon, which is both
 * finer and a thing a person can measure. Nuts and honey are dense in the same
 * way and get the same treatment.
 */
const GRAM_STEPS: Record<string, number> = {
  fats_oils: 5,
  nuts_seeds: 5,
  sweets: 5,
};

/**
 * Below this, a line is seasoning rather than food, and is left alone.
 *
 * Fifteen kilocalories at one serving: garlic, parsley, lemon juice, dried thyme.
 * Olive oil at eight grams is seventy-one and scales like the food it is. The
 * test is energy rather than weight because that is what makes freezing a line
 * safe — a frozen line cannot move a total it never contributed to.
 */
const SEASONING_KCAL = 15;

/** Categories that are seasoning whatever their energy. */
const SEASONING_CATEGORIES = new Set(['herbs_spices']);

/** Quarter and half steps are exact in binary, but the arithmetic around them is not. */
function clean(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** The step a line's amount moves on, in whatever unit it is written in. */
export function lineStep(line: PortionableLine): number {
  if (!line.portion) return GRAM_STEPS[line.food.category ?? ''] ?? GRAMS_STEP;
  return UNIT_STEPS[line.portion.labelEn] ?? 1;
}

/**
 * The ceiling for one line, or null where it has none.
 *
 * Returns the ceiling in the line's own unit — pieces for a countable food, grams
 * for a weighed one — so the caller never has to convert.
 */
export function lineCeiling(line: PortionableLine): number | null {
  const category = line.food.category ?? '';
  const grams = GRAM_CEILINGS[category];

  if (!line.portion) return grams ?? null;

  const counted: number[] = [];

  if (line.portion.labelEn === 'Piece' && PIECE_CEILINGS[category] !== undefined) {
    counted.push(PIECE_CEILINGS[category]!);
  }
  if (line.portion.labelEn === 'Container') counted.push(CONTAINER_CEILING);

  // A weight ceiling becomes a count ceiling through the line's own
  // grams-per-count, which is the stored relationship rather than the portion's
  // nominal weight — the same figure the scaling uses.
  if (grams !== undefined && line.portionQuantity) {
    counted.push((grams * line.portionQuantity) / line.quantityGrams);
  }

  return counted.length ? Math.min(...counted) : null;
}

/** Whether a line is seasoning: present for taste, negligible for energy. */
export function isSeasoning(line: PortionableLine): boolean {
  if (SEASONING_CATEGORIES.has(line.food.category ?? '')) return true;
  if (line.isPrimary) return false;

  return (line.food.kcal * line.quantityGrams) / 100 < SEASONING_KCAL;
}

/**
 * A whole number of steps away from the recipe, and no further than the ceiling.
 *
 * `base` is what the recipe holds and is the origin of the grid, which is what
 * makes a multiplier of one an identity. The floor is one step, or the recipe's
 * own amount when that is smaller than a step — an ingredient at zero has been
 * removed, and removing one is a different decision from making it smaller.
 */
export function stepFromBase(base: number, target: number, step: number, ceiling: number | null): number {
  const steps = Math.round((target - base) / step);
  const moved = clean(base + steps * step);

  const floor = Math.min(base, step);

  if (ceiling === null) return Math.max(floor, moved);

  // A ceiling rarely lands on the grid — 400 g of a 286 g piece is 1.4 of them —
  // so the last legal amount is the last step at or below it, not the ceiling
  // itself. Never below the recipe, which a ceiling may not rewrite.
  const roof = Math.max(base, clean(base + Math.floor((ceiling - base) / step + 1e-9) * step));

  return Math.min(roof, Math.max(floor, moved));
}

/** Whether a line's portion can carry its amount. */
function usablePortion(
  line: PortionableLine,
): line is PortionableLine & { portion: { labelEn: string; grams: number }; portionQuantity: number } {
  return Boolean(
    line.portion &&
      line.portion.grams > 0 &&
      typeof line.portionQuantity === 'number' &&
      line.portionQuantity > 0,
  );
}

/** What one recipe line becomes at a multiplier. */
export function portionLine(line: PortionableLine, multiplier: number): PortionedAmount {
  const base = {
    quantityGrams: line.quantityGrams,
    portionQuantity: line.portionQuantity ?? null,
  };

  if (!(multiplier > 0) || multiplier === 1 || isSeasoning(line)) return base;

  const ceiling = lineCeiling(line);

  if (usablePortion(line)) {
    const count = stepFromBase(
      line.portionQuantity,
      line.portionQuantity * multiplier,
      lineStep(line),
      ceiling,
    );

    // Grams move by the ratio the count moved by, never by `count × portion.grams`.
    //
    // `quantity_grams` is the authoritative amount and the portion is a record of
    // how it was typed; the two can legitimately disagree — a line entered as
    // 140 g and labelled "cup" against a 158 g cup is one the dietitian wrote that
    // way. Recomputing grams from the label would quietly restate her amount, and
    // restating an amount is how a nutrition figure stops describing the food.
    // The ratio preserves whatever relationship was stored, and is identical to
    // the multiplication wherever the two already agree.
    return {
      quantityGrams: clean((line.quantityGrams * count) / line.portionQuantity),
      portionQuantity: count,
    };
  }

  return {
    quantityGrams: stepFromBase(
      line.quantityGrams,
      line.quantityGrams * multiplier,
      lineStep(line),
      ceiling,
    ),
    portionQuantity: null,
  };
}

/** Energy of a portioned recipe, for choosing between multipliers. */
export function portionedKcal(recipe: readonly PortionableLine[], multiplier: number): number {
  return recipe.reduce(
    (sum, line) => sum + (line.food.kcal * portionLine(line, multiplier).quantityGrams) / 100,
    0,
  );
}

/**
 * The multiplier whose *portioned* result lands closest to a budget.
 *
 * Searched rather than divided, because rounding happens after the multiplication
 * and the two do not commute: 2.75 servings of a dish is not 2.75 times its
 * energy once every line has been snapped to its own grid and held under its own
 * ceiling. Twelve candidates is a trivial loop and the only way to know what a
 * multiplier actually produces is to produce it.
 *
 * Ties go to the multiplier nearest one. They are common once ceilings bind: a
 * dish whose every line is capped produces the same plate at 1.5 servings as at
 * 3, and the stored number should then be the one that describes it honestly —
 * `×0.25` beside a plate holding a whole recipe is a lie about the same food.
 *
 * Returns null for a recipe with no energy, where no multiplier means anything.
 */
export function chooseServings(
  recipe: readonly PortionableLine[],
  budgetKcal: number,
): number | null {
  if (!recipe.length || !(budgetKcal > 0)) return null;
  if (!(portionedKcal(recipe, 1) > 0)) return null;

  let best: number | null = null;
  let bestGap = Infinity;

  for (
    let multiplier = MIN_SERVINGS;
    multiplier <= MAX_SERVINGS + 1e-9;
    multiplier = clean(multiplier + SERVING_STEP)
  ) {
    const gap = Math.abs(portionedKcal(recipe, multiplier) - budgetKcal);
    const tied = Math.abs(gap - bestGap) <= 1e-9;

    if (gap < bestGap - 1e-9) {
      best = multiplier;
      bestGap = gap;
    } else if (tied && best !== null && Math.abs(multiplier - 1) < Math.abs(best - 1)) {
      best = multiplier;
    }
  }

  return best;
}

/**
 * The multiplier one step up or down from `servings` that actually changes the
 * meal, or null when nothing moves.
 *
 * Every line may be at a ceiling, or every step may round back to where it was —
 * in which case a day-level pass has nothing to gain here and should say so
 * rather than storing a number that does nothing.
 */
export function nextServings(
  recipe: readonly PortionableLine[],
  servings: number,
  direction: -1 | 1,
): number | null {
  const from = portionedKcal(recipe, servings);

  for (
    let candidate = clean(servings + direction * SERVING_STEP);
    candidate >= MIN_SERVINGS && candidate <= MAX_SERVINGS;
    candidate = clean(candidate + direction * SERVING_STEP)
  ) {
    if (Math.abs(portionedKcal(recipe, candidate) - from) > 1) return candidate;
  }

  return null;
}
