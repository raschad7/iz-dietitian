import { describe, expect, test } from 'bun:test';

import type { FoodNutrients } from './nutrition';
import {
  chooseServings,
  isSeasoning,
  lineCeiling,
  nextServings,
  portionLine,
  portionedKcal,
  stepFromBase,
  type PortionableLine,
} from './portioning';

/**
 * Every case here is one this module was written to answer, taken from a plan a
 * dietitian actually received: `تمر مجهول 1.88 حبة`, `برتقال 4.13 حبة`,
 * `بيض ني 5½ حبة`, `فراولة 24 حبة`. The numbers in the expectations are what
 * those lines should have said.
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

function food(category: string, kcal = 100) {
  return { ...NUTRIENTS, category, kcal };
}

const PIECE = { labelEn: 'Piece', grams: 50 };
const LOAF = { labelEn: 'Loaf', grams: 60 };
const CUP = { labelEn: 'Cup', grams: 158 };
const SPOON = { labelEn: 'Tablespoon', grams: 25 };

describe('a multiplier of one is the recipe', () => {
  /**
   * The invariant everything else rests on. A dish's stated energy is computed
   * from its ingredients at one serving, and every ranking, filter and budget
   * check in the feature is built on that figure — so a meal holding one serving
   * has to hold the recipe, to the gram, whatever the grid would otherwise say
   * about a half orange.
   */
  test('an amount off the grid survives it', () => {
    const line: PortionableLine = {
      quantityGrams: 196.5,
      food: food('fruits'),
      portion: PIECE,
      portionQuantity: 1.5,
      isPrimary: true,
    };

    expect(portionLine(line, 1)).toEqual({ quantityGrams: 196.5, portionQuantity: 1.5 });
  });
});

describe('counts move in whole steps of their own unit', () => {
  test('dates go to a half, not to 1.88', () => {
    const dates: PortionableLine = {
      quantityGrams: 36,
      food: food('fruits', 277),
      portion: PIECE,
      portionQuantity: 1.5,
      isPrimary: true,
    };

    // The multiplier that produced `1.88 حبة` in the plan this module was written
    // against. One step of a piece is a whole piece, and 1.25 servings is not one.
    expect(portionLine(dates, 1.25).portionQuantity).toBe(1.5);
  });

  test('bread moves by half a loaf, because half a loaf is an instruction', () => {
    const pita: PortionableLine = {
      quantityGrams: 60,
      food: food('grains', 275),
      portion: LOAF,
      portionQuantity: 1,
      isPrimary: true,
    };

    expect(portionLine(pita, 1.5).portionQuantity).toBe(1.5);
  });

  test('rice moves by a spoon', () => {
    const rice: PortionableLine = {
      quantityGrams: 200,
      food: food('grains', 130),
      portion: SPOON,
      portionQuantity: 8,
      isPrimary: true,
    };

    expect(portionLine(rice, 1.5).portionQuantity).toBe(12);
  });

  test('a cup moves by a quarter', () => {
    const yogurt: PortionableLine = {
      quantityGrams: 158,
      food: food('dairy_eggs', 61),
      portion: CUP,
      portionQuantity: 1,
      isPrimary: true,
    };

    expect(portionLine(yogurt, 1.3).portionQuantity).toBe(1.25);
  });

  test('a weighed line moves by ten grams', () => {
    const chicken: PortionableLine = {
      quantityGrams: 130,
      food: food('poultry', 165),
      isPrimary: true,
    };

    expect(portionLine(chicken, 1.2).quantityGrams).toBe(160);
  });
});

describe('ceilings stop growth and never rewrite a recipe', () => {
  test('a breakfast cannot reach five and a half eggs', () => {
    const eggs: PortionableLine = {
      quantityGrams: 100,
      food: food('dairy_eggs', 143),
      portion: PIECE,
      portionQuantity: 2,
      isPrimary: true,
    };

    expect(portionLine(eggs, 2.75).portionQuantity).toBe(3);
  });

  test('a snack cannot reach four oranges', () => {
    const oranges: PortionableLine = {
      quantityGrams: 196.5,
      food: food('fruits', 47),
      portion: PIECE,
      portionQuantity: 1.5,
      isPrimary: true,
    };

    // Two and a half, not four: the ceiling is three, and the grid runs in whole
    // pieces from the recipe's own one-and-a-half, so the last legal step below
    // the ceiling is 2.5. A ceiling is never rounded up to reach it.
    expect(portionLine(oranges, 2.75).portionQuantity).toBe(2.5);
  });

  /**
   * Twelve strawberries is what the recipe says, and a recipe is not a mistake.
   * The ceiling refuses the growth to twenty-four without touching the twelve.
   */
  test('a recipe already above its ceiling keeps what its author wrote', () => {
    const strawberries: PortionableLine = {
      quantityGrams: 144,
      food: food('fruits', 32),
      portion: PIECE,
      portionQuantity: 12,
      isPrimary: true,
    };

    expect(portionLine(strawberries, 2).portionQuantity).toBe(12);
  });

  test('cooked meat stops at two hundred grams on a plate', () => {
    const chicken: PortionableLine = {
      quantityGrams: 130,
      food: food('poultry', 165),
      isPrimary: true,
    };

    expect(portionLine(chicken, 3).quantityGrams).toBe(200);
    expect(lineCeiling(chicken)).toBe(200);
  });

  test('a food with no ceiling grows freely', () => {
    const bulgur: PortionableLine = {
      quantityGrams: 100,
      food: food('grains', 83),
      isPrimary: true,
    };

    expect(lineCeiling(bulgur)).toBeNull();
    expect(portionLine(bulgur, 3).quantityGrams).toBe(300);
  });
});

describe('seasoning stays where the recipe put it', () => {
  test('garlic does not triple because the dish did', () => {
    const garlic: PortionableLine = {
      quantityGrams: 5,
      food: food('vegetables', 149),
      isPrimary: false,
    };

    expect(isSeasoning(garlic)).toBe(true);
    expect(portionLine(garlic, 3).quantityGrams).toBe(5);
  });

  test('a herb is seasoning whatever its energy', () => {
    expect(isSeasoning({ quantityGrams: 30, food: food('herbs_spices', 276) })).toBe(true);
  });

  test('olive oil is food and scales like it', () => {
    const oil: PortionableLine = { quantityGrams: 12, food: food('fats_oils', 884) };

    expect(isSeasoning(oil)).toBe(false);
    // Oil steps by five grams — a teaspoon — rather than by the default ten,
    // which at 884 kcal per 100 g would move a quarter of a snack per press.
    expect(portionLine(oil, 2).quantityGrams).toBe(22);
  });

  /**
   * A line the recipe marked adjustable is food by that fact alone. The dietitian
   * gets a `−`/`+` for it, and an amount she can press must be an amount that
   * moves.
   */
  test('a primary line is never seasoning, however little it carries', () => {
    expect(isSeasoning({ quantityGrams: 5, food: food('vegetables', 20), isPrimary: true })).toBe(
      false,
    );
  });
});

describe('grams keep whatever relationship to the count was stored', () => {
  /**
   * 140 g labelled as one 158 g cup is a line a dietitian wrote that way, and
   * `quantity_grams` is the authoritative half of it. Recomputing the weight from
   * the label would restate her amount by 18 g and move the meal's calories with
   * it.
   */
  test('a count and a weight that disagree stay in proportion', () => {
    const rice: PortionableLine = {
      quantityGrams: 140,
      food: food('grains', 130),
      portion: CUP,
      portionQuantity: 1,
      isPrimary: true,
    };

    expect(portionLine(rice, 1.5)).toEqual({ quantityGrams: 210, portionQuantity: 1.5 });
  });
});

describe('stepFromBase', () => {
  test('counts steps from the recipe rather than from zero', () => {
    expect(stepFromBase(1.5, 3, 1, null)).toBe(3.5);
    expect(stepFromBase(1.5, 1.5, 1, null)).toBe(1.5);
  });

  test('never falls to nothing', () => {
    expect(stepFromBase(2, 0.1, 1, null)).toBe(1);
    // Smaller than one step to begin with: it cannot shrink, only hold.
    expect(stepFromBase(0.5, 0.1, 1, null)).toBe(0.5);
  });

  test('a ceiling below the recipe is the recipe', () => {
    expect(stepFromBase(12, 24, 1, 3)).toBe(12);
  });
});

describe('chooseServings', () => {
  const dish: PortionableLine[] = [
    { quantityGrams: 100, food: food('poultry', 165), isPrimary: true },
    { quantityGrams: 100, food: food('grains', 130), portion: SPOON, portionQuantity: 4, isPrimary: true },
  ];

  /**
   * The multiplier is searched, not divided into the budget: rounding happens
   * after the multiplication and under ceilings, so `budget / baseKcal` names a
   * multiplier whose actual output can be some way from the budget.
   */
  test('picks the multiplier whose portioned result is closest to the budget', () => {
    const servings = chooseServings(dish, 600)!;
    const gap = Math.abs(portionedKcal(dish, servings) - 600);

    for (const other of [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3]) {
      expect(gap).toBeLessThanOrEqual(Math.abs(portionedKcal(dish, other) - 600) + 1e-9);
    }
  });

  test('ties go to the multiplier nearest one', () => {
    // 190 g of meat reaches its 200 g ceiling at 1.25, and no multiplier above
    // that produces anything different. A budget nothing can reach therefore ties
    // across most of the range, and the one that describes the plate is the
    // closest to a single serving of it.
    const capped: PortionableLine[] = [{ quantityGrams: 190, food: food('meat', 200), isPrimary: true }];

    expect(chooseServings(capped, 10_000)).toBe(1.25);
  });

  test('a recipe with no energy has no answer', () => {
    expect(chooseServings([{ quantityGrams: 100, food: food('vegetables', 0) }], 600)).toBeNull();
    expect(chooseServings([], 600)).toBeNull();
  });

  /**
   * A shawarma sandwich is a thing, not a weight. The budget does not get to ask
   * for three quarters of one, and missing the budget is the honest answer — the
   * alternative is a number nobody can serve.
   */
  test('a dish sold whole never lands on a fraction', () => {
    const sandwich: PortionableLine[] = [
      { quantityGrams: 200, food: food('grains', 250), isPrimary: true },
    ];

    expect(chooseServings(sandwich, 700, { wholeOnly: true })).toBe(1);
    expect(chooseServings(sandwich, 900, { wholeOnly: true })).toBe(2);
    // The same budget, divisible: it can and does use a quarter step.
    expect(chooseServings(sandwich, 700)).toBe(1.5);
  });

  test('a whole-only dish steps a serving at a time, or not at all', () => {
    const sandwich: PortionableLine[] = [
      { quantityGrams: 200, food: food('grains', 250), isPrimary: true },
    ];

    expect(nextServings(sandwich, 1, 1, { wholeOnly: true })).toBe(2);
    // Nothing below one whole sandwich exists to step down to.
    expect(nextServings(sandwich, 1, -1, { wholeOnly: true })).toBeNull();
  });
});
