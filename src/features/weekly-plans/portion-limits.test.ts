import { describe, expect, test } from 'bun:test';

import { countLimit, exceedsCountLimit } from './portion-limits';

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
    expect(countLimit('walnuts')).toBe(4);
    expect(countLimit('pistachios')).toBe(20);
  });

  test('fruit eaten by the dozen and fruit eaten by the one are not the same limit', () => {
    expect(countLimit('grapes')).toBe(20);
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
    expect(countLimit('rice-white-cooked', 'Tablespoon')).toBe(9);
    expect(countLimit('labneh', 'Tablespoon')).toBe(4);
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
