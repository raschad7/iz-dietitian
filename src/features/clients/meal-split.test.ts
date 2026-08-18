import { describe, expect, test } from 'bun:test';

import { balanceToHundred } from './meal-split';

describe('balanceToHundred', () => {
  test('leaves a set that already sums to 100 unchanged', () => {
    expect(balanceToHundred([30, 40, 30])).toEqual([30, 40, 30]);
  });

  test('scales an over-100 set down proportionally', () => {
    // Five equal meals at 25 each sum to 125; scaled to 20 each.
    expect(balanceToHundred([25, 25, 25, 25, 25])).toEqual([20, 20, 20, 20, 20]);
  });

  test('scales an under-100 set up proportionally', () => {
    // 10/10/10 sums to 30; each becomes 33, drift of +1 lands on the first.
    expect(balanceToHundred([10, 10, 10])).toEqual([34, 33, 33]);
  });

  test('splits evenly when every share is zero', () => {
    // 100/3 = 33 each, drift of +1 on the first.
    expect(balanceToHundred([0, 0, 0])).toEqual([34, 33, 33]);
  });

  test('always sums to exactly 100', () => {
    for (const input of [[33, 33, 33], [1, 2, 3], [80, 80], [0, 0, 0, 0]]) {
      const sum = balanceToHundred(input).reduce((a, b) => a + b, 0);
      expect(sum).toBe(100);
    }
  });

  test('puts the rounding remainder on the largest entry', () => {
    // 20/30/49 sums to 99; the +1 drift goes to the 49, not the others.
    expect(balanceToHundred([20, 30, 49])).toEqual([20, 30, 50]);
  });

  test('treats negative shares as zero', () => {
    expect(balanceToHundred([-5, 50, 50])).toEqual([0, 50, 50]);
  });

  test('returns an empty array for empty input', () => {
    expect(balanceToHundred([])).toEqual([]);
  });
});
