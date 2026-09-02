import { describe, expect, test } from 'bun:test';

import {
  coverage,
  deadAxisValues,
  formatCoverage,
  MIN_AWAY_FROM_HOME,
  MIN_PER_CELL,
  MIN_PER_PROTEIN,
  type CoverageDish,
} from './coverage';
import type { DishIngredientDetail, FoodNutrients } from './nutrition';
import { coverageFromDatasets } from '../../../scripts/check-catalog-readiness';

const EMPTY: FoodNutrients = {
  kcal: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: null,
  sugar: null,
  saturatedFat: null,
  cholesterol: null,
  sodium: null,
  calcium: null,
  iron: null,
  potassium: null,
};

function food(category: string, nutrients: Partial<FoodNutrients> = {}): DishIngredientDetail {
  return {
    quantityGrams: 100,
    food: { id: category, nameAr: category, nameEn: category, category, ...EMPTY, ...nutrients },
    isPrimary: true,
    sortOrder: 0,
  };
}

function dish(overrides: Partial<CoverageDish> = {}): CoverageDish {
  return {
    slug: 'dish',
    mealTypes: ['lunch'],
    source: 'home',
    effort: 'medium',
    cost: 'normal',
    occasion: 'everyday',
    isSide: false,
    baseKcal: 500,
    recipe: [food('poultry', { protein: 30 })],
    ...overrides,
  };
}

/** `n` copies of a dish, so a cell can be filled without writing twelve fixtures. */
function many(n: number, overrides: Partial<CoverageDish> = {}): CoverageDish[] {
  return Array.from({ length: n }, (_, index) => dish({ slug: `dish-${index}`, ...overrides }));
}

describe('coverage', () => {
  /**
   * The measured failure this whole module exists for: a client prescribed a
   * guava as a 218 kcal snack, because the 200–300 band held nothing else.
   */
  test('an empty band is a gap, whatever the total dish count is', () => {
    const report = coverage(many(60, { mealTypes: ['lunch'], baseKcal: 500 }));

    expect(report.dishes).toBe(60);
    const snackGap = report.gaps.find((cell) => cell.slot === 'snack' && cell.band[0] === 200);
    expect(snackGap?.count).toBe(0);
    expect(snackGap?.short).toBe(MIN_PER_CELL);
  });

  test('a dish counts in every slot it claims', () => {
    const report = coverage(many(12, { mealTypes: ['lunch', 'dinner'], baseKcal: 500 }));
    const lunch = report.cells.find((cell) => cell.slot === 'lunch' && cell.band[0] === 450);
    const dinner = report.cells.find((cell) => cell.slot === 'dinner' && cell.band[0] === 450);

    expect(lunch?.count).toBe(12);
    expect(dinner?.count).toBe(12);
  });

  test('a side is never counted toward a slot — it is not a meal', () => {
    const report = coverage([
      ...many(12, { mealTypes: ['lunch'], baseKcal: 500 }),
      dish({ slug: 'salad', isSide: true, mealTypes: ['lunch'], baseKcal: 500 }),
    ]);

    expect(report.dishes).toBe(12);
    expect(report.sides).toBe(1);
    expect(report.cells.find((cell) => cell.slot === 'lunch' && cell.band[0] === 450)?.count).toBe(12);
  });

  test('bands touch rather than overlap, so a dish lands in exactly one', () => {
    const report = coverage([dish({ mealTypes: ['lunch'], baseKcal: 650 })]);
    const counted = report.cells.filter((cell) => cell.slot === 'lunch' && cell.count > 0);

    expect(counted).toHaveLength(1);
    expect(counted[0]!.band[0]).toBe(650);
  });

  test('a slot with nothing a client could buy is reported', () => {
    const report = coverage(many(12, { mealTypes: ['lunch'], baseKcal: 500, source: 'home' }));
    expect(report.awayGaps.find((gap) => gap.slot === 'lunch')?.count).toBe(0);
  });

  test('street and restaurant both count as away from home', () => {
    const report = coverage([
      ...many(MIN_AWAY_FROM_HOME - 1, { mealTypes: ['lunch'], source: 'street' }),
      dish({ slug: 'pizza', mealTypes: ['lunch'], source: 'restaurant' }),
    ]);

    expect(report.awayGaps.find((gap) => gap.slot === 'lunch')).toBeUndefined();
  });

  /** Protein source is read off the recipe, never off a label someone typed. */
  test('a slot thin on a protein is reported from the recipe', () => {
    const report = coverage(many(20, { mealTypes: ['lunch'], baseKcal: 500 }));
    const gaps = report.proteinGaps.filter((gap) => gap.slot === 'lunch');

    expect(gaps.find((gap) => gap.proteinSource === 'poultry')).toBeUndefined();
    expect(gaps.find((gap) => gap.proteinSource === 'fish')?.count).toBe(0);
  });

  test('snacks are never asked for a protein — an apple is a snack', () => {
    const report = coverage(many(12, { mealTypes: ['snack'], baseKcal: 150 }));
    expect(report.proteinGaps.some((gap) => gap.slot === 'snack')).toBe(false);
  });

  test('complete means every cell and every floor, not a dish count', () => {
    expect(coverage(many(400, { mealTypes: ['lunch'] })).complete).toBe(false);
  });

  test('an empty catalog reports gaps rather than throwing', () => {
    const report = coverage([]);

    expect(report.dishes).toBe(0);
    expect(report.gaps).toHaveLength(report.cells.length);
    expect(report.deadValues).toEqual([]);
  });
});

describe('deadAxisValues', () => {
  /**
   * `local` sat on 16 of 113 dishes in a catalog written for Palestine, and
   * `vegetarian` on 64. One said nothing because it was rare, the other because
   * it was the majority, and both passed every check that existed.
   */
  test('a value on almost everything filters nothing', () => {
    const spread = deadAxisValues(many(20, { source: 'home' }));
    expect(spread.find((one) => one.axis === 'source' && one.value === 'home')?.share).toBe(1);
  });

  test('a value on almost nothing filters nothing either', () => {
    // One in twenty-five is 4%, under the floor. One in twenty is exactly 5% and
    // survives, which is the boundary being a floor rather than a suggestion.
    const catalog = [...many(24, { source: 'home' }), dish({ slug: 'odd', source: 'street' })];
    const spread = deadAxisValues(catalog);

    expect(spread.find((one) => one.value === 'street')?.count).toBe(1);
  });

  test('a value carrying a usable share of the catalog is not reported', () => {
    const catalog = [...many(12, { cost: 'cheap' }), ...many(8, { cost: 'expensive' })];
    const spread = deadAxisValues(catalog);

    expect(spread.some((one) => one.axis === 'cost' && one.value === 'cheap')).toBe(false);
    expect(spread.some((one) => one.axis === 'cost' && one.value === 'expensive')).toBe(false);
  });

  /**
   * Most food is cooked at home on an ordinary day, and a majority is not a
   * defect. The ceiling catches an axis that is *nearly constant*, not one with a
   * dominant value — the earlier 60% would have failed the true catalog.
   */
  test('a large majority is allowed; near-constant is not', () => {
    const majority = [...many(17, { source: 'home' }), ...many(3, { source: 'street' })];
    expect(deadAxisValues(majority).some((one) => one.value === 'home')).toBe(false);

    const constant = [...many(19, { source: 'home' }), dish({ slug: 'odd', source: 'street' })];
    expect(deadAxisValues(constant).some((one) => one.value === 'home')).toBe(true);
  });
});

describe('formatCoverage', () => {
  test('marks short cells and names what is missing', () => {
    const text = formatCoverage(coverage(many(3, { mealTypes: ['lunch'], baseKcal: 500 })));

    expect(text).toContain('3 mains');
    expect(text).toContain('*');
    expect(text).toContain(`wants ${MIN_PER_PROTEIN} each`);
  });
});

/**
 * The point of the grid, asserted against the catalog that ships.
 *
 * It went green on 2026-09-02 at 273 mains. Pinning it here is what stops a later
 * edit quietly reopening a hole — the failure mode this module exists for is
 * invisible from inside a plan.
 */
describe('the shipped catalog', () => {
  test('fills every cell of the grid', () => {
    const report = coverageFromDatasets();

    expect(report.gaps).toEqual([]);
    expect(report.proteinGaps).toEqual([]);
    expect(report.awayGaps).toEqual([]);
    expect(report.complete).toBe(true);
  });

  test('has no axis value too rare or too universal to filter on', () => {
    expect(coverageFromDatasets().deadValues).toEqual([]);
  });
});
