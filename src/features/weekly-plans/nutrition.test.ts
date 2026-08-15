import { describe, expect, test } from 'bun:test';

import {
  combineTotals,
  emptyTotals,
  energySplit,
  nutritionCategory,
  roundForDisplay,
  scaleNutrients,
  sumNutrients,
  type FoodNutrients,
  type NutrientSource,
  type NutrientTotals,
} from './nutrition';

/** USDA fdc_id 171287, "Egg, whole, raw, fresh" — real per-100 g figures. */
const EGG: FoodNutrients = {
  kcal: 143,
  protein: 12.56,
  carbs: 0.72,
  fat: 9.51,
  fiber: 0,
  sugar: 0.37,
  saturatedFat: 3.13,
  sodium: 142,
  cholesterol: 372,
  calcium: 56,
  iron: 1.75,
  potassium: 138,
};

/** A food with gaps, to pin down how "not measured" propagates. */
const UNMEASURED: FoodNutrients = {
  kcal: 100,
  protein: 10,
  carbs: 10,
  fat: 10,
  fiber: null,
  sugar: null,
  saturatedFat: null,
  sodium: null,
  cholesterol: null,
  calcium: null,
  iron: null,
  potassium: null,
};

const source = (food: FoodNutrients, quantityGrams: number): NutrientSource => ({ food, quantityGrams });

describe('scaleNutrients', () => {
  test('converts the per-100 g basis to the quantity given', () => {
    const scaled = scaleNutrients(source(EGG, 50));

    expect(scaled.kcal).toBeCloseTo(71.5, 5);
    expect(scaled.protein).toBeCloseTo(6.28, 5);
    expect(scaled.cholesterol).toBeCloseTo(186, 5);
  });

  test('is the identity at 100 g', () => {
    const scaled = scaleNutrients(source(EGG, 100));

    expect(scaled.kcal).toBe(143);
    expect(scaled.fat).toBe(9.51);
  });

  test('scales above 100 g', () => {
    expect(scaleNutrients(source(EGG, 250)).kcal).toBeCloseTo(357.5, 5);
  });

  test('keeps an unmeasured nutrient null instead of turning it into zero', () => {
    const scaled = scaleNutrients(source(UNMEASURED, 200));

    expect(scaled.fiber).toBeNull();
    expect(scaled.sodium).toBeNull();
    expect(scaled.protein).toBe(20);
  });

  test('a zero quantity contributes nothing', () => {
    expect(scaleNutrients(source(EGG, 0)).kcal).toBe(0);
  });
});

describe('sumNutrients', () => {
  test('adds every item', () => {
    const totals = sumNutrients([source(EGG, 100), source(EGG, 50)]);

    expect(totals.kcal.value).toBeCloseTo(214.5, 5);
    expect(totals.protein.value).toBeCloseTo(18.84, 5);
  });

  test('an empty meal totals zero, not NaN', () => {
    const totals = sumNutrients([]);

    expect(totals.kcal.value).toBe(0);
    expect(totals.kcal.unmeasured).toBe(0);
  });

  test('skips unmeasured values rather than adding them as zero, and counts them', () => {
    const totals = sumNutrients([source(EGG, 100), source(UNMEASURED, 100)]);

    // 142 mg from the egg alone — the second food's sodium is unknown, not 0.
    expect(totals.sodium.value).toBeCloseTo(142, 5);
    expect(totals.sodium.unmeasured).toBe(1);
  });

  test('reports no gaps when every item measured the nutrient', () => {
    const totals = sumNutrients([source(EGG, 100), source(EGG, 30)]);

    expect(totals.sodium.unmeasured).toBe(0);
  });

  test('a measured zero still counts as measured', () => {
    // The egg's fibre is a measured 0, so it must not be reported as a gap.
    const totals = sumNutrients([source(EGG, 100)]);

    expect(totals.fiber.value).toBe(0);
    expect(totals.fiber.unmeasured).toBe(0);
  });
});

describe('combineTotals', () => {
  test('rolls meals up into a day', () => {
    const breakfast = sumNutrients([source(EGG, 100)]);
    const lunch = sumNutrients([source(EGG, 50)]);

    const day = combineTotals([breakfast, lunch]);

    expect(day.kcal.value).toBeCloseTo(214.5, 5);
  });

  test('carries the unmeasured counts up with the values', () => {
    const day = combineTotals([sumNutrients([source(UNMEASURED, 100)]), sumNutrients([source(UNMEASURED, 100)])]);

    expect(day.fiber.unmeasured).toBe(2);
  });

  test('combining nothing gives the empty totals', () => {
    expect(combineTotals([])).toEqual(emptyTotals());
  });
});

describe('energySplit', () => {
  test('divides energy by the Atwater factors', () => {
    // 10 g protein (40 kcal) + 10 g carbs (40) + 10 g fat (90) = 170 kcal.
    const split = energySplit(sumNutrients([source(UNMEASURED, 100)]));

    expect(split.protein.kcal).toBeCloseTo(40, 5);
    expect(split.fat.kcal).toBeCloseTo(90, 5);
    expect(split.protein.percent).toBeCloseTo(40 / 170, 5);
    expect(split.fat.percent).toBeCloseTo(90 / 170, 5);
  });

  test('the three percentages total one', () => {
    const split = energySplit(sumNutrients([source(EGG, 175)]));
    const total = split.protein.percent + split.carbs.percent + split.fat.percent;

    expect(total).toBeCloseTo(1, 10);
  });

  test('carries the gram amounts through', () => {
    const split = energySplit(sumNutrients([source(EGG, 100)]));

    expect(split.protein.grams).toBeCloseTo(12.56, 5);
  });

  test('an empty plan splits to zero rather than dividing by zero', () => {
    const split = energySplit(emptyTotals());

    expect(split.protein.percent).toBe(0);
    expect(Number.isNaN(split.fat.percent)).toBe(false);
  });
});

describe('roundForDisplay', () => {
  test('gives grams one decimal', () => {
    expect(roundForDisplay('protein', 12.56)).toBe(12.6);
    expect(roundForDisplay('fat', 9.51)).toBe(9.5);
  });

  test('gives energy and milligrams whole numbers', () => {
    expect(roundForDisplay('kcal', 214.5)).toBe(215);
    expect(roundForDisplay('sodium', 142.4)).toBe(142);
  });
});

describe('nutritionCategory', () => {
  // Builds a totals object with only the three energy macros set — the only
  // fields energySplit reads. Grams in, category out.
  function totalsOf(protein: number, carbs: number, fat: number): NutrientTotals {
    const totals = emptyTotals();
    totals.protein.value = protein;
    totals.carbs.value = carbs;
    totals.fat.value = fat;
    return totals;
  }

  test('labels a protein-dominant dish high_protein', () => {
    expect(nutritionCategory(totalsOf(40, 40, 5))).toBe('high_protein');
  });

  test('labels a carb-dominant dish high_carb', () => {
    expect(nutritionCategory(totalsOf(10, 80, 5))).toBe('high_carb');
  });

  test('labels a fat-dominant dish high_fat', () => {
    expect(nutritionCategory(totalsOf(5, 5, 30))).toBe('high_fat');
  });

  test('labels a spread-out dish balanced when nothing crosses a threshold', () => {
    expect(nutritionCategory(totalsOf(20, 45, 15))).toBe('balanced');
  });

  test('when two thresholds are crossed, picks the one crossed by the largest margin', () => {
    expect(nutritionCategory(totalsOf(30, 5, 25))).toBe('high_fat');
  });

  test('an empty dish is balanced rather than dividing by zero', () => {
    expect(nutritionCategory(emptyTotals())).toBe('balanced');
  });
});
