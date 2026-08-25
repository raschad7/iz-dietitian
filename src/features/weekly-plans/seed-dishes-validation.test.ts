import { describe, expect, test } from 'bun:test';

import {
  MAX_PRIMARY_INGREDIENTS,
  readDishDataset,
  validateDishRecords,
  type DishRecord,
} from '../../../scripts/seed-dishes';

/**
 * The seed import is the last gate before curated dishes reach the database, so
 * it has to refuse the tags the taxonomy cleanup removed. Otherwise a stale
 * `data/dishes.json` would quietly reintroduce `high_protein` or
 * `diabetic_friendly` that every other layer now rejects.
 */

const base: DishRecord = {
  slug: 'grilled-chicken',
  nameAr: 'دجاج مشوي',
  nameEn: 'Grilled chicken',
  mealTypes: ['lunch'],
  tags: ['economical', 'quick'],
  allergenTags: [],
  baseServingLabel: 'حصة',
  ingredients: [{ fdcId: 171077, grams: 150, note: 'Chicken' }],
};

describe('validateDishRecords tag hygiene', () => {
  test('a clean record with only practical tags has no problems', () => {
    expect(validateDishRecords([base])).toEqual([]);
  });

  test('rejects the removed computed-nutrition tag high_protein', () => {
    const problems = validateDishRecords([{ ...base, tags: ['high_protein'] }]);
    expect(problems.some((p) => p.includes('high_protein'))).toBe(true);
  });

  test('rejects the removed medical tag diabetic_friendly', () => {
    const problems = validateDishRecords([{ ...base, tags: ['diabetic_friendly'] }]);
    expect(problems.some((p) => p.includes('diabetic_friendly'))).toBe(true);
  });

  test('rejects an unknown tag rather than importing it', () => {
    expect(validateDishRecords([{ ...base, tags: ['made_up'] }]).length).toBeGreaterThan(0);
  });

  test('rejects an unknown meal type', () => {
    expect(validateDishRecords([{ ...base, mealTypes: ['brunch'] }]).length).toBeGreaterThan(0);
  });
});

/**
 * The rules that keep a `−/+` on the two lines that carry a meal, and off the
 * nine that do not.
 */
describe('validateDishRecords primary ingredients', () => {
  const withPrimary = (count: number): DishRecord => ({
    ...base,
    ingredients: Array.from({ length: count }, (_, index) => ({
      fdcId: 171077 + index,
      grams: 100,
      note: 'Chicken',
      primary: true,
    })),
  });

  test('a dish with no marked ingredients is valid — controls are optional', () => {
    expect(validateDishRecords([base])).toEqual([]);
  });

  test(`up to ${MAX_PRIMARY_INGREDIENTS} marked ingredients is fine`, () => {
    expect(validateDishRecords([withPrimary(MAX_PRIMARY_INGREDIENTS)])).toEqual([]);
  });

  test('marking every line is refused — that is the problem marking exists to solve', () => {
    const problems = validateDishRecords([withPrimary(MAX_PRIMARY_INGREDIENTS + 1)]);

    expect(problems.some((problem) => problem.includes('primary ingredients'))).toBe(true);
  });

  test('a unit without a count is refused, and so is the reverse', () => {
    const unitOnly = validateDishRecords([
      { ...base, ingredients: [{ fdcId: 171077, grams: 60, note: 'Bread', unit: 'Loaf' }] },
    ]);
    const countOnly = validateDishRecords([
      { ...base, ingredients: [{ fdcId: 171077, grams: 60, note: 'Bread', count: 1 }] },
    ]);

    expect(unitOnly.length).toBeGreaterThan(0);
    expect(countOnly.length).toBeGreaterThan(0);
  });

  test('a non-positive count is refused', () => {
    const problems = validateDishRecords([
      {
        ...base,
        ingredients: [{ fdcId: 171077, grams: 60, note: 'Bread', unit: 'Loaf', count: 0 }],
      },
    ]);

    expect(problems.some((problem) => problem.includes('count'))).toBe(true);
  });
});

/**
 * The shipped catalog itself, not just the validator.
 *
 * These are the invariants a later edit to `data/dishes.json` would break
 * silently: a dish that quietly loses its controls, or one that grows a control
 * on every line. The counts are read from the file rather than written down, so
 * adding a dish does not fail the suite.
 */
describe('the shipped dish catalog', () => {
  const dishes = readDishDataset();

  test('every dish is inside the primary-ingredient limit', () => {
    for (const dish of dishes) {
      const primary = dish.ingredients.filter((ingredient) => ingredient.primary).length;
      expect(primary).toBeLessThanOrEqual(MAX_PRIMARY_INGREDIENTS);
    }
  });

  test('almost every dish has something a dietitian can adjust', () => {
    // Not all: a plate of cucumber and radish has nothing anyone steps up or
    // down, and inventing a control for it would be worse than leaving it plain.
    const withControls = dishes.filter((dish) =>
      dish.ingredients.some((ingredient) => ingredient.primary),
    );

    expect(withControls.length / dishes.length).toBeGreaterThan(0.95);
  });

  test('a line counted in a unit states both the unit and the count', () => {
    for (const dish of dishes) {
      for (const ingredient of dish.ingredients) {
        expect(ingredient.unit === undefined).toBe(ingredient.count === undefined);
      }
    }
  });

  test('no recipe still measures a staple in its uncooked state', () => {
    // A dietitian counts spoons of cooked rice. Raw rice is a shopping weight,
    // and no household unit can be attached to a food nobody eats in that state.
    // rice-white-dry, bulgur-dry, couscous-dry, pasta-dry, lentils-dry.
    const raw = new Set([168877, 170688, 169699, 168903, 172420]);

    for (const dish of dishes) {
      for (const ingredient of dish.ingredients) {
        expect(raw.has(ingredient.fdcId)).toBe(false);
      }
    }
  });
});
