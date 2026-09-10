import { describe, expect, test } from 'bun:test';

import {
  defaultStepOf,
  implausibleWeight,
  isPortionKey,
  isReviewed,
  measureOf,
  portionSetProblems,
  PORTION_KEYS,
  requiresReview,
} from './portion-contract';

/**
 * What a portion is, as opposed to what it is called.
 *
 * The catalog shipped twenty-two portions labelled `ملعقة كبيرة` weighing between
 * 2.7 g and 25 g, because identity lived in a prose label and nothing recorded
 * which object the label named. These are the rules that make that a failure
 * instead of a plan.
 */

describe('identity decides behaviour, not the label', () => {
  test('a spoon is two different objects, and the key says which', () => {
    expect(measureOf('level-tablespoon')).toBe('level_spoon');
    expect(measureOf('heaped-spoon')).toBe('heaped_spoon');
  });

  test('the step belongs to the unit', () => {
    // Half a loaf is a real instruction; half an egg is not.
    expect(defaultStepOf('loaf')).toBe(0.5);
    expect(defaultStepOf('piece')).toBe(1);
    expect(defaultStepOf('cup')).toBe(0.25);
    // A unit whose own label already names a fraction steps by whole ones.
    expect(defaultStepOf('half-cup')).toBe(1);
  });

  test('every key is recognised, and nothing else is', () => {
    for (const key of PORTION_KEYS) expect(isPortionKey(key)).toBe(true);
    expect(isPortionKey('Tablespoon')).toBe(false);
    expect(isPortionKey('spoon')).toBe(false);
  });
});

describe('what only a review can establish', () => {
  test('a heaped spoon and a dish serving are local conventions', () => {
    expect(requiresReview('heaped-spoon')).toBe(true);
    expect(requiresReview('serving')).toBe(true);
  });

  /*
    The line is drawn at whether a published source can settle the number, not at
    whether a person has looked. A cup and a medium apple are objects USDA
    measured; leaning on those unreviewed is defensible and their status stays
    visible. There is no table anywhere that says what one kitchen's heaped spoon
    weighs.
  */
  test('a published measure does not need one', () => {
    expect(requiresReview('cup')).toBe(false);
    expect(requiresReview('level-tablespoon')).toBe(false);
    expect(requiresReview('piece')).toBe(false);
    expect(requiresReview('loaf')).toBe(false);
  });

  test('only reviewed counts as reviewed', () => {
    expect(isReviewed('reviewed')).toBe(true);
    expect(isReviewed('needs_review')).toBe(false);
    expect(isReviewed('candidate')).toBe(false);
  });
});

describe('a weight that cannot be what its key claims', () => {
  /**
   * The defect this whole contract exists for.
   *
   * `برغل مطبوخ` ships a `ملعقة كبيرة` of 8.4 g — USDA's levelled 15 ml spoon.
   * That is a fine level spoon and an impossible heaped one, and until the key
   * existed there was no way for the data to say which of the two it was.
   */
  test('8.4 g is a level spoon and cannot be a heaped one', () => {
    expect(implausibleWeight({ key: 'level-tablespoon', grams: 8.4 })).toBeNull();
    expect(implausibleWeight({ key: 'heaped-spoon', grams: 8.4 })).toContain('below');
  });

  test('bounds scale with the fraction the key names', () => {
    // 15 g is a correct half cup of spinach and an impossible whole cup of it.
    expect(implausibleWeight({ key: 'half-cup', grams: 15 })).toBeNull();
    expect(implausibleWeight({ key: 'cup', grams: 15 })).toContain('below');
  });

  /*
    Units naming an object are left unbounded on purpose: a mint leaf is 0.15 g
    and a cabbage leaf 23 g, a radish slice 1 g and a watermelon wedge 286 g. A
    number invented to look strict there would only reject correct data, which is
    exactly what a first draft of this check did.
  */
  test('objects whose real spread is enormous are not bounded', () => {
    expect(implausibleWeight({ key: 'leaf', grams: 0.15 })).toBeNull();
    expect(implausibleWeight({ key: 'leaf', grams: 23 })).toBeNull();
    expect(implausibleWeight({ key: 'slice', grams: 1 })).toBeNull();
    expect(implausibleWeight({ key: 'slice', grams: 286 })).toBeNull();
  });
});

describe('a food whose portions contradict each other', () => {
  test("a heaped spoon must outweigh the same food's level spoon", () => {
    const problems = portionSetProblems([
      { key: 'level-tablespoon', grams: 15 },
      { key: 'heaped-spoon', grams: 15 },
    ]);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('must outweigh');
  });

  test('a heaped spoon that really is heavier passes', () => {
    expect(
      portionSetProblems([
        { key: 'level-tablespoon', grams: 15 },
        { key: 'heaped-spoon', grams: 25 },
      ]),
    ).toEqual([]);
  });

  /* One of the pair corrected and the other forgotten — the failure mode of a
     catalog where related weights are separate rows. */
  test('a half is half of its whole', () => {
    expect(portionSetProblems([{ key: 'loaf', grams: 90 }, { key: 'half-loaf', grams: 30 }]))
      .toEqual(['half loaf (30 g) is not half of loaf (90 g)']);

    expect(portionSetProblems([{ key: 'loaf', grams: 90 }, { key: 'half-loaf', grams: 45 }]))
      .toEqual([]);
  });

  test('a teaspoon is lighter than its tablespoon', () => {
    const problems = portionSetProblems([
      { key: 'level-tablespoon', grams: 13.5 },
      { key: 'teaspoon', grams: 13.5 },
    ]);

    expect(problems.some((problem) => problem.includes('must be lighter'))).toBe(true);
  });

  test('the same identity twice is one row wearing two weights', () => {
    const problems = portionSetProblems([
      { key: 'cup', grams: 158 },
      { key: 'cup', grams: 240 },
    ]);

    expect(problems).toContain('duplicate portion key cup');
  });

  test('the rounding a derived half lands on is not a contradiction', () => {
    // 79 is half of 158 exactly; 39.5 is a quarter. The derivation rounds to a
    // tenth, so the check allows that much slack and no more.
    expect(portionSetProblems([{ key: 'cup', grams: 158 }, { key: 'half-cup', grams: 79 }]))
      .toEqual([]);
  });
});
