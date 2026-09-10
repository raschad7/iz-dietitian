import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import type { PortionKey } from './portion-contract';
import { countLimit, exceedsCountLimit, LIMITED_FOODS } from './portion-limits';

const datasetFoods = (
  JSON.parse(readFileSync('data/catalog-foods.json', 'utf8')) as {
    foods: { slug: string; portions?: { key: PortionKey }[] }[];
  }
).foods;

/**
 * The two directions the old rules were wrong in, held here so neither comes back.
 *
 * Portioning capped counted foods by category and left nuts, olives and pulses
 * with only a weight ceiling — forty grams of pistachio is fifty-seven kernels.
 * `review.ts` meanwhile flagged anything above three pieces, which made a mistake
 * of the twelve grapes a real dietitian writes by hand.
 */
describe('countLimit', () => {
  test('a nut is counted small', () => {
    expect(countLimit('almonds')).toBe(12);
    expect(countLimit('walnuts')).toBe(6);
    expect(countLimit('pistachios')).toBe(20);
  });

  test('fruit eaten by the dozen and fruit eaten by the one are not the same limit', () => {
    expect(countLimit('grapes-raw')).toBe(20);
    expect(countLimit('dates-medjool')).toBe(3);
    expect(countLimit('banana-raw')).toBe(2);
  });

  test('olives have a limit at all — their category never gave them one', () => {
    expect(countLimit('olives-green')).toBe(12);
  });

  test('a measured food is capped in the unit it is written in', () => {
    // Nine spoons, not "convert it to cups": one serving of cooked rice is a
    // third of a cup or five to six tablespoons, and the spoon is how every plan
    // in the region is written.
    expect(countLimit('rice-white-cooked', 'heaped-spoon')).toBe(9);
    expect(countLimit('labaneh', 'level-tablespoon')).toBe(4);
  });

  /*
    The check that would have caught the whole class of bug this table shipped
    with: five of its keys named foods that do not exist — `grapes` for
    `grapes-raw`, `labneh` for `labaneh` — and four capped a spoon on a food
    measured only by the cup. Every one of them failed silently, because a limit
    that matches nothing simply never applies.

    `seed-catalog-foods.ts` asserts the same thing on every seed. This asserts it
    without a database, which is where it gets caught first.
  */
  test('every limit names a food that exists, in a unit that food has', () => {
    const bySlug = new Map(datasetFoods.map((food) => [food.slug, food]));

    for (const { slug, unit } of LIMITED_FOODS) {
      const food = bySlug.get(slug);
      expect(food, `portion-limits.ts caps "${slug}", which is not a food`).toBeDefined();

      if (unit) {
        const keys = (food?.portions ?? []).map((portion) => portion.key);
        expect(keys, `"${slug}" has no ${unit} portion`).toContain(unit);
      }
    }
  });

  test('a food nobody has decided about is not judged', () => {
    expect(countLimit('some-clinic-food')).toBeNull();
    expect(countLimit(null)).toBeNull();
  });
});

describe('exceedsCountLimit', () => {
  test('fifty-seven pistachios is too many and twelve grapes is not', () => {
    expect(exceedsCountLimit('pistachios', 57)).toBe(true);
    expect(exceedsCountLimit('grapes', 12)).toBe(false);
    expect(exceedsCountLimit('almonds', 25)).toBe(true);
    expect(exceedsCountLimit('almonds', 3)).toBe(false);
  });

  test('nine olives is an ordinary breakfast', () => {
    expect(exceedsCountLimit('olives-green', 9)).toBe(false);
    expect(exceedsCountLimit('olives-green', 30)).toBe(true);
  });

  test('silence where no limit is set', () => {
    expect(exceedsCountLimit('unknown-food', 400)).toBe(false);
  });
});
