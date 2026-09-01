import { describe, expect, test } from 'bun:test';

import { GRAMS_STEP } from './ingredient-units';
import {
  MAX_INGREDIENT_GRAMS,
  hasOwnAmounts,
  mealGrams,
  mealIngredientLines,
  mealTotals,
  nextIngredientAmount,
  nextIngredientAmount as step,
  primaryLines,
  scaleRecipe,
  type MealIngredientLine,
  type RecipeLine,
} from './meal-ingredients';
import type { FoodNutrients } from './nutrition';

/**
 * The rule this module exists for: **a meal's own amounts win over its dish.**
 *
 * Everything else here follows from that. A meal that has never been adjusted is
 * its recipe at a multiplier; a meal that has been adjusted is a list of amounts
 * and no multiplier at all. There is deliberately no third state where some lines
 * scale and others do not — that state is what made "I pinned the chicken, then
 * pressed the dish's +" unanswerable, and it is the reason the writer copies every
 * line at once.
 */

const NUTRIENTS: FoodNutrients = {
  kcal: 100,
  protein: 5,
  carbs: 10,
  fat: 2,
  fiber: null,
  sugar: null,
  saturatedFat: null,
  cholesterol: null,
  sodium: null,
  calcium: null,
  iron: null,
  potassium: null,
};

const loaf = { id: 'loaf', labelAr: 'رغيف', labelEn: 'Loaf', grams: 60 };
const piece = { id: 'piece', labelAr: 'حبة', labelEn: 'Piece', grams: 50 };
const cup = { id: 'cup', labelAr: 'كوب', labelEn: 'Cup', grams: 158 };

function line(
  id: string,
  quantityGrams: number,
  overrides: Partial<MealIngredientLine> = {},
): MealIngredientLine {
  return {
    quantityGrams,
    portion: null,
    portionQuantity: null,
    isPrimary: false,
    sortOrder: 0,
    food: { id, nameAr: id, nameEn: id, ...NUTRIENTS },
    ...overrides,
  };
}

/** Maqluba, reduced to the shape that matters: two adjustable lines and two not. */
const RECIPE: RecipeLine[] = [
  line('rice', 140, {
    sortOrder: 0,
    isPrimary: true,
    portion: cup,
    portionQuantity: 1,
  }),
  line('chicken', 130, { sortOrder: 1, isPrimary: true }),
  line('eggplant', 100, { sortOrder: 2 }),
  line('oil', 12, { sortOrder: 3 }),
];

describe('mealIngredientLines', () => {
  /**
   * The multiplier reaches every line that is food. The last one is not: at this
   * fixture's 100 kcal per 100 g, twelve grams of oil is twelve kilocalories, and
   * `portioning.ts` holds a line that small where the recipe put it — doubling a
   * dish does not double its seasoning. The rule and its threshold belong to that
   * module's tests; what matters here is that this function resolves through it
   * rather than multiplying on its own.
   */
  test('a meal that was never adjusted is its recipe at the multiplier', () => {
    const lines = mealIngredientLines({ recipe: RECIPE, servings: 2, stored: null });

    expect(lines.map((entry) => entry.quantityGrams)).toEqual([280, 260, 200, 12]);
  });

  test('a meal with its own amounts ignores the multiplier entirely', () => {
    // The multiplier is 2, and it must not touch these. They are the amounts.
    const stored = [line('rice', 175, { sortOrder: 0, portion: cup, portionQuantity: 1.25 })];
    const lines = mealIngredientLines({ recipe: RECIPE, servings: 2, stored });

    expect(lines).toHaveLength(1);
    expect(lines[0]!.quantityGrams).toBe(175);
  });

  test('an empty stored array means the same as none — the writer never produces one', () => {
    const lines = mealIngredientLines({ recipe: RECIPE, servings: 1, stored: [] });

    expect(lines.map((entry) => entry.food.id)).toEqual(['rice', 'chicken', 'eggplant', 'oil']);
  });

  test('lines come back in recipe order however they arrived', () => {
    const stored = [line('oil', 12, { sortOrder: 3 }), line('rice', 140, { sortOrder: 0 })];
    const lines = mealIngredientLines({ recipe: RECIPE, servings: 1, stored });

    expect(lines.map((entry) => entry.food.id)).toEqual(['rice', 'oil']);
  });

  test('an empty recipe resolves to nothing rather than throwing', () => {
    expect(mealIngredientLines({ recipe: [], servings: 1, stored: null })).toEqual([]);
  });
});

describe('scaleRecipe', () => {
  test('the portion count scales with the grams, so the two keep agreeing', () => {
    const [rice] = scaleRecipe(RECIPE, 1.5);

    expect(rice!.quantityGrams).toBe(210);
    expect(rice!.portionQuantity).toBe(1.5);
  });

  test('a grams-only line gains no count out of nowhere', () => {
    const chicken = scaleRecipe(RECIPE, 2)[1]!;

    expect(chicken.quantityGrams).toBe(260);
    expect(chicken.portionQuantity).toBeNull();
  });

  /**
   * `servings` is constrained to 0.25–3 at every write. A zero or a NaN reaching
   * here would be a bug elsewhere, and printing the base recipe is a far better
   * failure than printing a plate with nothing on it.
   */
  test('a non-positive or unusable multiplier prints the recipe rather than erasing it', () => {
    for (const servings of [0, -1, Number.NaN]) {
      expect(scaleRecipe(RECIPE, servings)[0]!.quantityGrams).toBe(140);
    }
  });
});

describe('hasOwnAmounts', () => {
  test('only a non-empty set of stored rows counts', () => {
    expect(hasOwnAmounts([line('rice', 140)])).toBe(true);
    expect(hasOwnAmounts([])).toBe(false);
    expect(hasOwnAmounts(null)).toBe(false);
    expect(hasOwnAmounts(undefined)).toBe(false);
  });
});

describe('primaryLines', () => {
  test('only the lines a dietitian adjusts, in recipe order', () => {
    const lines = mealIngredientLines({ recipe: RECIPE, servings: 1, stored: null });

    expect(primaryLines(lines).map((entry) => entry.food.id)).toEqual(['rice', 'chicken']);
  });
});

describe('nextIngredientAmount', () => {
  test('a loaf steps by half, because half a loaf is a real instruction', () => {
    const bread = line('bread', 60, { portion: loaf, portionQuantity: 1 });
    const next = step(bread, 1);

    expect(next.portionQuantity).toBe(1.5);
    expect(next.quantityGrams).toBe(90);
    expect(next.portionId).toBe('loaf');
  });

  test('an egg steps by one, because half an egg is not', () => {
    const egg = line('egg', 100, { portion: piece, portionQuantity: 2 });

    expect(step(egg, 1).portionQuantity).toBe(3);
    expect(step(egg, -1).portionQuantity).toBe(1);
  });

  test('a cup steps by a quarter', () => {
    const rice = line('rice', 158, { portion: cup, portionQuantity: 1 });

    expect(step(rice, 1).portionQuantity).toBe(1.25);
  });

  test('a grams-only line steps in grams and stays unit-less', () => {
    const chicken = line('chicken', 130);
    const next = step(chicken, 1);

    expect(next.quantityGrams).toBe(130 + GRAMS_STEP);
    expect(next.portionId).toBeNull();
    expect(next.portionQuantity).toBeNull();
  });

  test('grams derive from the count, so the weight and the unit never disagree', () => {
    const rice = line('rice', 158, { portion: cup, portionQuantity: 1 });
    const next = step(rice, 1);

    expect(next.quantityGrams).toBe(next.portionQuantity! * cup.grams);
  });

  test('a scaled remainder is snapped onto the unit grid rather than carried forever', () => {
    // 1.35 loaves is what a ×1.35 multiplier leaves behind. Pressing + should
    // land on a countable amount, not on 1.85.
    const bread = line('bread', 81, { portion: loaf, portionQuantity: 1.35 });

    expect(step(bread, 1).portionQuantity).toBe(1.5);
    // And downward, for the same reason: the nearest grid point below, not
    // 1.35 minus half a loaf.
    expect(step(bread, -1).portionQuantity).toBe(1);
  });

  test('a value already on the grid moves exactly one step', () => {
    const bread = line('bread', 90, { portion: loaf, portionQuantity: 1.5 });

    expect(step(bread, 1).portionQuantity).toBe(2);
    expect(step(bread, -1).portionQuantity).toBe(1);
  });

  test('an ingredient never steps down to nothing — that is a removal, not a smaller portion', () => {
    const egg = line('egg', 50, { portion: piece, portionQuantity: 1 });
    expect(step(egg, -1).portionQuantity).toBe(1);

    const trace = line('trace', GRAMS_STEP);
    expect(step(trace, -1).quantityGrams).toBe(GRAMS_STEP);
  });

  test('a portion with no count falls back to stepping grams', () => {
    const orphan = line('orphan', 100, { portion: loaf, portionQuantity: null });

    expect(step(orphan, 1).quantityGrams).toBe(110);
    expect(step(orphan, 1).portionId).toBeNull();
  });

  test('a zero-weight portion is not divided by', () => {
    const broken = line('broken', 100, { portion: { ...loaf, grams: 0 }, portionQuantity: 1 });

    expect(step(broken, 1).quantityGrams).toBe(110);
  });

  test('the cap is reachable, so the control has somewhere to stop', () => {
    const huge = line('huge', MAX_INGREDIENT_GRAMS);

    expect(nextIngredientAmount(huge, 1).quantityGrams).toBeGreaterThan(MAX_INGREDIENT_GRAMS);
  });
});

describe('mealTotals and mealGrams', () => {
  test('both read the resolved lines, so calories and weight describe one meal', () => {
    const lines = mealIngredientLines({ recipe: RECIPE, servings: 1, stored: null });

    // Every food here is 100 kcal per 100 g, so the energy is the weight.
    expect(mealGrams(lines)).toBe(382);
    expect(mealTotals(lines).kcal.value).toBeCloseTo(382, 6);
  });

  test('a hand-set amount moves the totals with it', () => {
    const stored = [line('chicken', 200, { sortOrder: 0 })];
    const lines = mealIngredientLines({ recipe: RECIPE, servings: 3, stored });

    expect(mealGrams(lines)).toBe(200);
    expect(mealTotals(lines).kcal.value).toBeCloseTo(200, 6);
  });

  test('an unmeasured nutrient is counted, not silently zeroed', () => {
    const lines = mealIngredientLines({ recipe: RECIPE, servings: 1, stored: null });

    expect(mealTotals(lines).fiber.unmeasured).toBe(4);
  });
});
