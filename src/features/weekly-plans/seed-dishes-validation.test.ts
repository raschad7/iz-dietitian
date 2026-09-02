import { describe, expect, test } from 'bun:test';

import {
  MAX_PRIMARY_INGREDIENTS,
  readDishDataset,
  validateCountingUnits,
  validateDishRecords,
  type DishRecord,
} from '../../../scripts/seed-dishes';
import { readCatalogDataset } from '../../../scripts/seed-catalog-foods';
import { isMember } from '@/lib/enum';

import {
  DISH_COSTS,
  DISH_EFFORTS,
  DISH_OCCASIONS,
  DISH_SOURCES,
  isFixedPortion,
} from './schema';

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
  source: 'home',
  effort: 'medium',
  cost: 'normal',
  occasion: 'everyday',
  isSide: false,
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

/**
 * The axes are the reason `tags` stopped being enough: a bag can describe
 * nothing, and a dish that describes nothing cannot be filtered, planned around,
 * or told apart from any other. The seed is where "exactly one value, always" is
 * actually enforced.
 */
describe('validateDishRecords declared axes', () => {
  test('rejects a value outside the closed set', () => {
    const problems = validateDishRecords([{ ...base, source: 'takeaway' }]);
    expect(problems.some((p) => p.includes('unknown source "takeaway"'))).toBe(true);
  });

  test('a missing axis is a problem, not a default', () => {
    const { effort: _effort, ...withoutEffort } = base;
    const problems = validateDishRecords([withoutEffort as DishRecord]);

    expect(problems).toEqual(['grilled-chicken: no effort']);
  });

  test('isSide has to be stated — a dish is a meal or it is not', () => {
    const { isSide: _isSide, ...withoutSide } = base;
    const problems = validateDishRecords([withoutSide as DishRecord]);

    expect(problems).toEqual(['grilled-chicken: no isSide']);
  });

  test('every shipped dish carries all four axes and says whether it is a side', () => {
    for (const dish of readDishDataset()) {
      expect(isMember(DISH_SOURCES, dish.source)).toBe(true);
      expect(isMember(DISH_EFFORTS, dish.effort)).toBe(true);
      expect(isMember(DISH_COSTS, dish.cost)).toBe(true);
      expect(isMember(DISH_OCCASIONS, dish.occasion)).toBe(true);
      expect(typeof dish.isSide).toBe('boolean');
    }
  });

  test('only what a person eats beside a meal is a side', () => {
    const sides = readDishDataset().filter((dish) => dish.isSide);

    // Few by nature. A catalog where a third of the dishes are sides has stopped
    // meaning anything by the word.
    expect(sides.length).toBeGreaterThan(0);
    expect(sides.length / readDishDataset().length).toBeLessThan(0.1);
  });
});

describe('isFixedPortion', () => {
  test('what you buy ready-made comes whole; what you cook does not', () => {
    expect(isFixedPortion('street')).toBe(true);
    expect(isFixedPortion('restaurant')).toBe(true);
    expect(isFixedPortion('home')).toBe(false);
    // A packet is opened, not portioned by the shop — a client can eat half a
    // tub of yogurt, but not half a sandwich the shop already assembled.
    expect(isFixedPortion('shop')).toBe(false);
  });
});

/**
 * A food owns its unit; a recipe obeys it. Before this rule the same egg was
 * "1 حبة" in one dish and "50 غ" in another, and nothing in the system could tell
 * a reader those were the same thing.
 */
describe('validateCountingUnits', () => {
  const egg = { sourceRef: '171287', slug: 'egg-raw', countedAs: 'Piece' };
  const oil = { sourceRef: '171413', slug: 'olive-oil' };

  function dishWith(ingredient: Record<string, unknown>): DishRecord {
    return { ...base, ingredients: [{ fdcId: 171287, grams: 50, note: 'Egg', ...ingredient }] };
  }

  test('accepts a line written in the unit its food declares', () => {
    const problems = validateCountingUnits([dishWith({ unit: 'Piece', count: 1 })], [egg]);
    expect(problems).toEqual([]);
  });

  test('rejects grams where the food is always counted', () => {
    const problems = validateCountingUnits([dishWith({})], [egg]);
    expect(problems).toEqual([
      'grilled-chicken: egg-raw is always counted in "Piece", but this line says 50 g',
    ]);
  });

  test('rejects a different unit', () => {
    const problems = validateCountingUnits([dishWith({ unit: 'Cup', count: 0.2 })], [egg]);
    expect(problems[0]).toContain('but this line says "Cup"');
  });

  /** "There is no one right unit for this" is a real answer, and grams are it. */
  test('a food that declares nothing may be written either way', () => {
    const dish = { ...base, ingredients: [{ fdcId: 171413, grams: 10, note: 'Oil' }] };
    expect(validateCountingUnits([dish], [oil])).toEqual([]);
  });

  test('the shipped catalog obeys its own declarations', () => {
    expect(validateCountingUnits(readDishDataset(), readCatalogDataset())).toEqual([]);
  });
});
