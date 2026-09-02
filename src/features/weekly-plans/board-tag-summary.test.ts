import { describe, expect, test } from 'bun:test';

import { summariseTagColors, type TaggedDays } from './board-tag-summary';

/** A board day, from a list of sources — `null` for an unfilled slot. */
function day(...dishes: (string | null)[]): TaggedDays[number] {
  return {
    meals: dishes.map((source) => (source === null ? { dish: null } : { dish: { source } })),
  };
}

describe('board source summary', () => {
  test('counts each filled meal under the source its card rule is painted with', () => {
    const summary = summariseTagColors([day('home', 'street', 'home'), day('home', null)]);

    expect(summary.rows).toEqual([
      { tag: 'home', count: 3 },
      { tag: 'street', count: 1 },
    ]);
    expect(summary.untagged).toBe(0);
  });

  /*
   * The old summary counted a dish's "primary tag", picked out of a bag by
   * catalog order, and needed a test to pin which of several won. A dish has
   * exactly one source, so there is nothing to resolve and nothing to get wrong.
   */
  test('a dish contributes exactly one count, with no priority rule to apply', () => {
    const summary = summariseTagColors([day('restaurant', 'restaurant')]);

    expect(summary.rows).toEqual([{ tag: 'restaurant', count: 2 }]);
  });

  test('rows follow offer order, whatever order the board met them in', () => {
    const summary = summariseTagColors([day('shop', 'street', 'home')]);

    expect(summary.rows.map((row) => row.tag)).toEqual(['home', 'street', 'shop']);
  });

  test('unfilled slots have no mark; unrecognised sources are counted apart', () => {
    const summary = summariseTagColors([day(null, '', 'takeaway', 'home'), day(null)]);

    expect(summary.rows).toEqual([{ tag: 'home', count: 1 }]);
    // The two dishes with no recognised source — they draw the neutral rule.
    expect(summary.untagged).toBe(2);
  });

  test('an empty week summarises to nothing at all', () => {
    expect(summariseTagColors([])).toEqual({ rows: [], untagged: 0 });
  });

  /**
   * The reading the summary exists to give, now that the axis means something:
   * how much of this week the client is cooking and how much they are buying.
   */
  test('answers how much of the week is cooked and how much is bought', () => {
    const summary = summariseTagColors([
      day('home', 'home', 'home', 'street', 'shop'),
      day('home', 'home', 'restaurant', 'home', 'home'),
    ]);

    const home = summary.rows.find((row) => row.tag === 'home')?.count ?? 0;
    const away = summary.rows
      .filter((row) => row.tag !== 'home')
      .reduce((total, row) => total + row.count, 0);

    expect(home).toBe(7);
    expect(away).toBe(3);
  });
});
