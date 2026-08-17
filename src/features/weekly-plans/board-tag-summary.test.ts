import { describe, expect, test } from 'bun:test';

import { summariseTagColors, type TaggedDays } from './board-tag-summary';

/** A board day, from a list of dishes — `null` for an unfilled slot. */
function day(...dishes: (string[] | null)[]): TaggedDays[number] {
  return { meals: dishes.map((tags) => (tags === null ? { dish: null } : { dish: { tags } })) };
}

describe('board tag summary', () => {
  test('counts each filled meal under the tag its card rule is painted with', () => {
    const summary = summariseTagColors([
      day(['quick'], ['economical'], ['quick']),
      day(['quick'], null),
    ]);

    expect(summary.rows).toEqual([
      { tag: 'economical', count: 1 },
      { tag: 'quick', count: 3 },
    ]);
    expect(summary.untagged).toBe(0);
  });

  /*
   * A dish with several tags draws exactly one rule, so it contributes exactly
   * one count — under the tag that rule is coloured for, which is catalog order
   * and not storage order. See `primaryDishTag`.
   */
  test('a multi-tag dish is counted once, under its primary tag', () => {
    const summary = summariseTagColors([day(['local', 'filling'], ['filling', 'local'])]);

    expect(summary.rows).toEqual([{ tag: 'filling', count: 2 }]);
  });

  test('rows follow catalog order, whatever order the board met them in', () => {
    const summary = summariseTagColors([day(['vegetarian'], ['economical'], ['no_cook'])]);

    expect(summary.rows.map((row) => row.tag)).toEqual(['economical', 'no_cook', 'vegetarian']);
  });

  test('unfilled slots have no mark; untagged dishes are counted apart', () => {
    const summary = summariseTagColors([day(null, [], ['legacy'], ['quick']), day(null)]);

    expect(summary.rows).toEqual([{ tag: 'quick', count: 1 }]);
    // The two dishes with no recognised tag — they draw the neutral rule.
    expect(summary.untagged).toBe(2);
  });

  test('an empty week summarises to nothing at all', () => {
    expect(summariseTagColors([])).toEqual({ rows: [], untagged: 0 });
    expect(summariseTagColors([day(null, null)])).toEqual({ rows: [], untagged: 0 });
  });
});
