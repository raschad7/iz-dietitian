import { describe, expect, test } from 'bun:test';

import { summariseTagColors, type TaggedDays } from './board-tag-summary';
import type { DishIngredientDetail } from './nutrition';

/** One recipe line, carrying just enough for `proteinSource` to read it. */
function line(category: string, protein: number, grams: number): DishIngredientDetail {
  return {
    quantityGrams: grams,
    food: {
      id: `${category}-${grams}`,
      nameAr: category,
      nameEn: category,
      category,
      kcal: 100,
      protein,
      carbs: 0,
      fat: 0,
    },
    portion: null,
    portionQuantity: null,
    isPrimary: true,
    sortOrder: 0,
  } as DishIngredientDetail;
}

/** Recipes whose biggest protein contributor is the named source. */
const RECIPE: Record<string, DishIngredientDetail[]> = {
  poultry: [line('poultry', 31, 150), line('grains', 2.7, 200)],
  red_meat: [line('meat', 26, 120)],
  fish: [line('fish', 22, 130)],
  legume: [line('legumes', 9, 200)],
  dairy: [line('dairy', 10, 200)],
  // A salad: vegetables only, and no protein worth naming.
  none: [line('vegetables', 0.9, 200)],
};

/** A board day, from a list of protein sources — `null` for an unfilled slot. */
function day(...sources: (string | null)[]): TaggedDays[number] {
  return {
    meals: sources.map((source) =>
      source === null ? { dish: null } : { dish: { ingredients: RECIPE[source] ?? [] } },
    ),
  };
}

describe('board protein summary', () => {
  test('counts each filled meal under the source its card rule is painted with', () => {
    const summary = summariseTagColors([day('poultry', 'fish', 'poultry'), day('poultry', null)]);

    expect(summary.rows).toEqual([
      { tag: 'poultry', count: 3 },
      { tag: 'fish', count: 1 },
    ]);
    expect(summary.untagged).toBe(0);
  });

  /*
   * The old summary counted a dish's "primary tag", picked out of a bag by
   * catalog order, and needed a test to pin which of several won. A dish's
   * protein source is computed and singular, so there is nothing to resolve.
   */
  test('a dish contributes exactly one count, with no priority rule to apply', () => {
    const summary = summariseTagColors([day('red_meat', 'red_meat')]);

    expect(summary.rows).toEqual([{ tag: 'red_meat', count: 2 }]);
  });

  test('rows follow legend order, whatever order the board met them in', () => {
    const summary = summariseTagColors([day('legume', 'fish', 'red_meat')]);

    expect(summary.rows.map((row) => row.tag)).toEqual(['red_meat', 'fish', 'legume']);
  });

  /*
   * `none` is a row like any other, and this is the difference from the old
   * `source` summary: a salad is not an untagged meal, it is a meal with no main
   * protein, and three of them in a row is its own kind of monotony.
   */
  test('a meal with no main protein is counted, not left out', () => {
    const summary = summariseTagColors([day('none', 'none', 'poultry'), day(null)]);

    expect(summary.rows).toEqual([
      { tag: 'poultry', count: 1 },
      { tag: 'none', count: 2 },
    ]);
    expect(summary.untagged).toBe(0);
  });

  test('an empty week summarises to nothing at all', () => {
    expect(summariseTagColors([])).toEqual({ rows: [], untagged: 0 });
  });

  /**
   * The reading the summary exists to give: how varied this week's protein is.
   * Chicken seven times out of ten is the thing thirty-five cards make hard to
   * see, and it is what a dietitian opens the key to find out.
   */
  test('answers how varied the week is, which is what it is read for', () => {
    const summary = summariseTagColors([
      day('poultry', 'poultry', 'poultry', 'fish', 'legume'),
      day('poultry', 'poultry', 'dairy', 'poultry', 'poultry'),
    ]);

    const top = summary.rows.reduce((best, row) => (row.count > best.count ? row : best));

    expect(top).toEqual({ tag: 'poultry', count: 7 });
    expect(summary.rows).toHaveLength(4);
  });
});
