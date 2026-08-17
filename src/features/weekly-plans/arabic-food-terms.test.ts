import { describe, expect, test } from 'bun:test';

import { deriveArabicFoodName, queryMatchesBase } from './arabic-food-terms';

/**
 * The Arabic bridge, checked against the exact SR Legacy strings the picker
 * hands over. The point is that a dietitian who searches `عدس` sees "عدس مطبوخ",
 * not "Lentils, mature seeds, cooked, boiled, without salt".
 */
describe('deriveArabicFoodName', () => {
  test('cooked lentils become "عدس مطبوخ", provenance dropped', () => {
    const derived = deriveArabicFoodName('Lentils, mature seeds, cooked, boiled, without salt');
    expect(derived?.name).toBe('عدس مطبوخ');
    expect(derived?.base).toBe('عدس');
    expect(derived?.groupKey).toBe('عدس||cooked');
  });

  test('raw lentils and cooked lentils are different foods (different group keys)', () => {
    const raw = deriveArabicFoodName('Lentils, raw');
    const cooked = deriveArabicFoodName('Lentils, mature seeds, cooked, boiled, with salt');
    expect(raw?.name).toBe('عدس نيء');
    expect(raw?.groupKey).not.toBe(cooked?.groupKey);
  });

  test('salt variants of the same food share a group key', () => {
    const withSalt = deriveArabicFoodName('Lentils, mature seeds, cooked, boiled, with salt');
    const withoutSalt = deriveArabicFoodName('Lentils, mature seeds, cooked, boiled, without salt');
    expect(withSalt?.groupKey).toBe(withoutSalt?.groupKey);
  });

  test('colour is kept as an identity axis: red lentils are their own food', () => {
    const red = deriveArabicFoodName('Lentils, pink or red, raw');
    expect(red?.base).toBe('عدس');
    expect(red?.name).toBe('عدس أحمر نيء');
    expect(red?.groupKey).toBe('عدس|red|raw');
  });

  test('pita bread resolves to خبز عربي and offers the loaf unit', () => {
    const pita = deriveArabicFoodName('Bread, pita, white, enriched');
    expect(pita?.base).toBe('خبز عربي');
    expect(pita?.unit).toBe('loaf');
  });

  test('roasted chicken becomes "دجاج مشوي" and is a grams food', () => {
    const chicken = deriveArabicFoodName(
      'Chicken, broilers or fryers, breast, meat only, cooked, roasted',
    );
    expect(chicken?.name).toBe('دجاج مشوي');
    expect(chicken?.unit).toBe('grams');
  });

  test('olive oil resolves ahead of a bare oil and offers the spoon unit', () => {
    const oil = deriveArabicFoodName('Oil, olive, salad or cooking');
    expect(oil?.base).toBe('زيت زيتون');
    expect(oil?.unit).toBe('spoon');
  });

  test('an unrecognised food returns null rather than a wrong Arabic guess', () => {
    expect(deriveArabicFoodName('Crackers, flavored')).toBeNull();
    expect(deriveArabicFoodName('Leavening agents, baking powder')).toBeNull();
  });
});

describe('queryMatchesBase', () => {
  test('an exact Arabic base match', () => {
    expect(queryMatchesBase('عدس', 'عدس')).toBe('exact');
  });

  test('a prefix match', () => {
    expect(queryMatchesBase('عد', 'عدس')).toBe('prefix');
  });

  test('normalization bridges alef forms, so "ارز" matches "أرز"', () => {
    expect(queryMatchesBase('ارز', 'أرز')).toBe('exact');
  });

  test('an unrelated query does not match', () => {
    expect(queryMatchesBase('دجاج', 'عدس')).toBeNull();
  });
});
