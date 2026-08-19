import { describe, expect, test } from 'bun:test';

import { validateDishRecords, type DishRecord } from '../../../scripts/seed-dishes';

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
