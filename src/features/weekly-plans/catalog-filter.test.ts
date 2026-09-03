import { describe, expect, test } from 'bun:test';

import {
  availableOptions,
  CATALOG_OPTIONS,
  filterCatalog,
  type CatalogContext,
  type CatalogFilters,
} from './catalog-filter';
import type { CatalogEntry } from './queries';
import { EMPTY_AXIS_FILTERS } from './schema';

/** A catalog row with only the fields the filter reads. */
function dish(overrides: Partial<CatalogEntry> & { id: string }): CatalogEntry {
  return {
    clinicId: null,
    slug: overrides.id,
    nameAr: 'طبق',
    nameEn: 'Dish',
    mealTypes: ['lunch'],
    source: 'home',
    effort: 'medium',
    cost: 'normal',
    occasion: 'everyday',
    isSide: false,
    allergenTags: [],
    baseServingLabel: 'صحن',
    isActive: true,
    ingredients: [],
    baseKcal: 400,
    nutritionCategory: 'balanced',
    blockedBy: [],
    ...overrides,
  } as CatalogEntry;
}

const NO_FILTERS: CatalogFilters = {
  needle: '',
  mealType: null,
  axes: EMPTY_AXIS_FILTERS,
  nutrition: [],
  options: [],
};
const NO_CONTEXT: CatalogContext = { usage: {}, budgetKcal: null };

const ids = (rows: readonly CatalogEntry[]) => rows.map((row) => row.id);

describe('filterCatalog search', () => {
  const catalog = [
    dish({ id: 'a', nameAr: 'فتة حمص', nameEn: 'Hummus fatteh' }),
    dish({ id: 'b', nameAr: 'شكشوكة', nameEn: 'Shakshuka' }),
  ];

  test('matches the Arabic name, the English name and the slug', () => {
    expect(ids(filterCatalog(catalog, { ...NO_FILTERS, needle: 'حمص' }, NO_CONTEXT))).toEqual(['a']);
    expect(ids(filterCatalog(catalog, { ...NO_FILTERS, needle: 'shak' }, NO_CONTEXT))).toEqual(['b']);
    expect(ids(filterCatalog(catalog, { ...NO_FILTERS, needle: 'a' }, NO_CONTEXT))).toEqual(['a', 'b']);
  });
});

describe('filterCatalog computed nutrition', () => {
  // The "high protein" filter reads the recipe-derived `nutritionCategory`, never
  // a stored tag — a dish is only kept if its own numbers make it high-protein.
  const catalog = [
    dish({ id: 'protein', nutritionCategory: 'high_protein' }),
    // Carries no manual tag AND is not computed high-protein: must be excluded,
    // proving the filter is not reading a stored label.
    dish({ id: 'carby', nutritionCategory: 'high_carb', cost: 'cheap' }),
    dish({ id: 'balanced', nutritionCategory: 'balanced' }),
  ];

  test('keeps only dishes the recipe computes as high-protein', () => {
    expect(ids(filterCatalog(catalog, { ...NO_FILTERS, nutrition: ['high_protein'] }, NO_CONTEXT))).toEqual([
      'protein',
    ]);
  });

  test('does not treat a manual tag as high-protein', () => {
    // 'carby' has a practical tag but the wrong computed category — a dish cannot
    // be tagged into the nutrition filter.
    const kept = filterCatalog(catalog, { ...NO_FILTERS, nutrition: ['high_protein'] }, NO_CONTEXT);
    expect(ids(kept)).not.toContain('carby');
  });
});

describe('filterCatalog axes', () => {
  const catalog = [
    dish({ id: 'home-quick', source: 'home', effort: 'quick' }),
    dish({ id: 'home-long', source: 'home', effort: 'long' }),
    dish({ id: 'street-quick', source: 'street', effort: 'quick' }),
    dish({ id: 'shop-quick', source: 'shop', effort: 'quick' }),
  ];

  /**
   * OR within an axis is the whole difference between a facet and a bag. `street`
   * and `shop` are two answers to one question, so asking for both means either.
   * The tag bag ANDed everything, which is why a second chip could only ever
   * empty the list.
   */
  test('a second value on the same axis widens', () => {
    const one = filterCatalog(
      catalog,
      { ...NO_FILTERS, axes: { ...EMPTY_AXIS_FILTERS, source: ['street'] } },
      NO_CONTEXT,
    );
    const two = filterCatalog(
      catalog,
      { ...NO_FILTERS, axes: { ...EMPTY_AXIS_FILTERS, source: ['street', 'shop'] } },
      NO_CONTEXT,
    );

    expect(ids(one)).toEqual(['street-quick']);
    expect(ids(two)).toEqual(['street-quick', 'shop-quick']);
  });

  /** Two axes are two questions, and asking both means both. */
  test('a value on a second axis narrows', () => {
    const narrowed = filterCatalog(
      catalog,
      { ...NO_FILTERS, axes: { ...EMPTY_AXIS_FILTERS, source: ['home'], effort: ['quick'] } },
      NO_CONTEXT,
    );

    expect(ids(narrowed)).toEqual(['home-quick']);
  });

  test('an impossible combination returns nothing rather than falling back', () => {
    expect(
      filterCatalog(
        catalog,
        { ...NO_FILTERS, axes: { ...EMPTY_AXIS_FILTERS, source: ['street'], effort: ['long'] } },
        NO_CONTEXT,
      ),
    ).toHaveLength(0);
  });

  test('an empty selection on an axis does not narrow at all', () => {
    expect(filterCatalog(catalog, NO_FILTERS, NO_CONTEXT)).toHaveLength(4);
  });
});

describe('filterCatalog options', () => {
  test('allergenSafe drops the dishes this client is blocked from', () => {
    const catalog = [dish({ id: 'safe' }), dish({ id: 'nuts', blockedBy: ['nuts'] })];

    expect(ids(filterCatalog(catalog, { ...NO_FILTERS, options: ['allergenSafe'] }, NO_CONTEXT))).toEqual(
      ['safe'],
    );
  });

  test('notRecent drops anything inside the usage window, including this plan', () => {
    const catalog = [dish({ id: 'fresh' }), dish({ id: 'thisWeek' }), dish({ id: 'lastWeek' })];
    const context: CatalogContext = {
      usage: { thisWeek: { weeksAgo: 0 }, lastWeek: { weeksAgo: 2 } },
      budgetKcal: null,
    };

    expect(ids(filterCatalog(catalog, { ...NO_FILTERS, options: ['notRecent'] }, context))).toEqual([
      'fresh',
    ]);
  });

  test('fitsBudget measures the portion that would be placed, not one serving', () => {
    // 250 × 2 = 500, exactly the budget. A dish half the target still fits,
    // because the drag would arrive at two servings rather than at one.
    //
    // 3000 does not: `MIN_SERVINGS` is a quarter, so the smallest portion the
    // board can place is 750 — half again over a 500 budget, and outside the
    // 15% `MEAL_TOLERANCE`. A dish is only off budget when *no* legal portion
    // of it lands near the target, which is why 2000 would have passed here at
    // ×0.25 and is the wrong dish to assert against.
    const catalog = [dish({ id: 'half', baseKcal: 250 }), dish({ id: 'huge', baseKcal: 3000 })];
    const context: CatalogContext = { usage: {}, budgetKcal: 500 };

    expect(ids(filterCatalog(catalog, { ...NO_FILTERS, options: ['fitsBudget'] }, context))).toEqual([
      'half',
    ]);
  });

  test('fitsBudget accepts a dish that only fits at a fraction of a serving', () => {
    // 2000 × 0.25 = 500. Scaling down is a real answer, not an edge case: the
    // catalog row and the drag both carry that portion with them.
    const catalog = [dish({ id: 'quarter', baseKcal: 2000 })];
    const context: CatalogContext = { usage: {}, budgetKcal: 500 };

    expect(
      filterCatalog(catalog, { ...NO_FILTERS, options: ['fitsBudget'] }, context),
    ).toHaveLength(1);
  });

  test('fitsBudget keeps everything when there is no budget to measure against', () => {
    const catalog = [dish({ id: 'a' }), dish({ id: 'b', baseKcal: 9000 })];

    expect(
      filterCatalog(catalog, { ...NO_FILTERS, options: ['fitsBudget'] }, NO_CONTEXT),
    ).toHaveLength(2);
  });

  test('options stack with the axes and with each other', () => {
    const catalog = [
      dish({ id: 'keep', effort: 'quick' }),
      dish({ id: 'blocked', effort: 'quick', blockedBy: ['nuts'] }),
      dish({ id: 'recent', effort: 'quick' }),
      dish({ id: 'untagged' }),
    ];
    const context: CatalogContext = { usage: { recent: { weeksAgo: 1 } }, budgetKcal: null };

    expect(
      ids(
        filterCatalog(
          catalog,
          {
            ...NO_FILTERS,
            axes: { ...EMPTY_AXIS_FILTERS, effort: ['quick'] },
            options: ['allergenSafe', 'notRecent'],
          },
          context,
        ),
      ),
    ).toEqual(['keep']);
  });
});

describe('availableOptions', () => {
  test('offers nothing when none of the three can change the list', () => {
    expect(availableOptions([dish({ id: 'a' })], NO_CONTEXT)).toEqual([]);
  });

  test('offers each one only once it has something to act on', () => {
    expect(availableOptions([dish({ id: 'a' })], { usage: {}, budgetKcal: 500 })).toEqual([
      'fitsBudget',
    ]);

    expect(
      availableOptions([dish({ id: 'a' })], { usage: { a: { weeksAgo: 0 } }, budgetKcal: null }),
    ).toEqual(['notRecent']);

    expect(
      availableOptions([dish({ id: 'a', blockedBy: ['nuts'] })], NO_CONTEXT),
    ).toEqual(['allergenSafe']);
  });

  test('a zero budget is not a budget', () => {
    expect(availableOptions([dish({ id: 'a' })], { usage: {}, budgetKcal: 0 })).toEqual([]);
  });

  test('returns them in declaration order, so the popover never reshuffles', () => {
    const all = availableOptions([dish({ id: 'a', blockedBy: ['nuts'] })], {
      usage: { a: { weeksAgo: 0 } },
      budgetKcal: 500,
    });

    expect(all).toEqual([...CATALOG_OPTIONS]);
  });
});
