import { describe, expect, test } from 'bun:test';

import {
  formatQuantity,
  ingredientAmount,
  pluralizeEnglishUnit,
  portionText,
} from './meal-quantity';
import type { FoodNutrients } from './nutrition';

/**
 * What a meal's ingredient quantities read as.
 *
 * The panel used to print the raw serving multiplier — `×2.25 portion` — which is
 * the number the arithmetic uses and not a quantity anyone can act on. These tests
 * pin the replacement: the amount this meal actually holds, in the unit it is
 * counted in and the language being read; and the authoritative grams whenever
 * there is no portion to say it in.
 *
 * Amounts arrive here already resolved — see `meal-ingredients.test.ts` for the
 * scaling and for the choice between a recipe and a hand-set amount.
 */

const NUTRIENTS: FoodNutrients = {
  kcal: 100,
  protein: 5,
  carbs: 10,
  fat: 2,
  fiber: null,
  sugar: null,
  saturatedFat: null,
  cholesterol: null,
  sodium: null,
  calcium: null,
  iron: null,
  potassium: null,
};

const food = (id: string, nameAr: string, nameEn: string) => ({ id, nameAr, nameEn, ...NUTRIENTS });

const loaf = { labelAr: 'رغيف', labelEn: 'Loaf', grams: 60 };
const piece = { labelAr: 'حبة', labelEn: 'Piece', grams: 50 };
const cup = { labelAr: 'كوب', labelEn: 'Cup', grams: 158 };
const teaspoon = { labelAr: 'ملعقة صغيرة', labelEn: 'Teaspoon', grams: 4.5 };

describe('formatQuantity', () => {
  test('a whole number is written plainly', () => {
    expect(formatQuantity(1, 'ar')).toBe('1');
    expect(formatQuantity(2, 'en')).toBe('2');
  });

  test('Arabic names a bare fraction, English draws it', () => {
    expect(formatQuantity(0.5, 'ar')).toBe('نصف');
    expect(formatQuantity(0.5, 'en')).toBe('½');
    expect(formatQuantity(0.25, 'ar')).toBe('ربع');
    expect(formatQuantity(0.25, 'en')).toBe('¼');
  });

  test('a mixed number uses the glyph in both languages', () => {
    // "واحد ونصف رغيف" is prose; beside a column of figures it stops being a
    // quantity you can scan.
    expect(formatQuantity(1.5, 'ar')).toBe('1½');
    expect(formatQuantity(1.5, 'en')).toBe('1½');
    expect(formatQuantity(2.25, 'ar')).toBe('2¼');
    expect(formatQuantity(2.75, 'en')).toBe('2¾');
  });

  test('thirds survive the float arithmetic they arrive with', () => {
    expect(formatQuantity(1 / 3, 'en')).toBe('⅓');
    expect(formatQuantity(1 + 2 / 3, 'en')).toBe('1⅔');
  });

  test('a quantity with no natural fraction stays a decimal rather than being rounded onto one', () => {
    // 0.7 is not three quarters, and printing ¾ would be a rounding the reader
    // cannot see.
    expect(formatQuantity(0.7, 'en')).toBe('0.7');
    expect(formatQuantity(1.2, 'ar')).toBe('1.2');
  });
});

describe('pluralizeEnglishUnit', () => {
  test('singular at one and below', () => {
    expect(pluralizeEnglishUnit('Loaf', 1)).toBe('loaf');
    expect(pluralizeEnglishUnit('Loaf', 0.5)).toBe('loaf');
  });

  test('f becomes ves, not s', () => {
    expect(pluralizeEnglishUnit('Loaf', 1.5)).toBe('loaves');
    expect(pluralizeEnglishUnit('Leaf', 2)).toBe('leaves');
  });

  test('sibilants take es', () => {
    expect(pluralizeEnglishUnit('Dish', 2)).toBe('dishes');
  });

  test('only the last word is inflected', () => {
    expect(pluralizeEnglishUnit('Half cup', 2)).toBe('half cups');
  });
});

describe('portionText', () => {
  test('the examples the panel is specified by', () => {
    expect(portionText(loaf, 1, 'ar')).toBe('1 رغيف');
    expect(portionText(loaf, 0.5, 'ar')).toBe('نصف رغيف');
    expect(portionText(loaf, 1.5, 'ar')).toBe('1½ رغيف');
    expect(portionText(loaf, 2.25, 'ar')).toBe('2¼ رغيف');

    expect(portionText(loaf, 0.5, 'en')).toBe('½ loaf');
    expect(portionText(loaf, 1.5, 'en')).toBe('1½ loaves');
    expect(portionText(loaf, 2.25, 'en')).toBe('2¼ loaves');
  });

  test('Arabic units are not pluralised', () => {
    expect(portionText(piece, 2, 'ar')).toBe('2 حبة');
    expect(portionText(piece, 2, 'en')).toBe('2 pieces');
  });
});
describe('ingredientAmount', () => {
  const labneh = food('labneh', 'لبنة', 'Labneh');
  const bread = food('bread', 'خبز عربي', 'Arabic bread');

  test('a grams-only line is the authoritative grams', () => {
    expect(ingredientAmount({ quantityGrams: 150 }, 'ar')).toEqual({ kind: 'grams', grams: 150 });
  });

  test('a portion line is its own count, in the language being read', () => {
    expect(
      ingredientAmount({ quantityGrams: 90, portion: loaf, portionQuantity: 1.5 }, 'ar'),
    ).toEqual({ kind: 'portion', text: '1½ رغيف' });
  });

  test('the whole set of specified examples', () => {
    const render = (
      ingredient: Parameters<typeof ingredientAmount>[0],
      locale: string,
    ): string => {
      const amount = ingredientAmount(ingredient, locale);
      return amount.kind === 'grams' ? `${amount.grams} g` : amount.text;
    };

    expect(render({ quantityGrams: 150 }, 'ar')).toBe('150 g');
    expect(render({ quantityGrams: 60, portion: loaf, portionQuantity: 1 }, 'ar')).toBe('1 رغيف');
    expect(render({ quantityGrams: 100, portion: piece, portionQuantity: 2 }, 'ar')).toBe('2 حبة');
    expect(render({ quantityGrams: 158, portion: cup, portionQuantity: 1 }, 'ar')).toBe('1 كوب');
    expect(render({ quantityGrams: 4.5, portion: teaspoon, portionQuantity: 1 }, 'ar')).toBe(
      '1 ملعقة صغيرة',
    );
  });

  test('a retired portion falls back to the authoritative grams, not to a guess', () => {
    // `portion_id` is `on delete set null`, so the join finds nothing and the
    // amount has no unit left to be stated in. The grams were never in doubt.
    expect(
      ingredientAmount({ quantityGrams: 240, portion: null, portionQuantity: 2 }, 'ar'),
    ).toEqual({ kind: 'grams', grams: 240 });
  });

  test('a portion with no count falls back to grams', () => {
    expect(ingredientAmount({ quantityGrams: 60, portion: loaf }, 'ar')).toEqual({
      kind: 'grams',
      grams: 60,
    });
  });

  test('a zero-weight portion falls back to grams rather than dividing by it', () => {
    expect(
      ingredientAmount({ quantityGrams: 90, portion: { ...loaf, grams: 0 }, portionQuantity: 1 }, 'ar'),
    ).toEqual({ kind: 'grams', grams: 90 });
  });

  test('the grams fallback and the portion path describe the same meal', () => {
    // Two lines of one meal: one counted in loaves, one weighed. The point of the
    // pair is that mixing units in a single list is normal.
    expect(
      ingredientAmount({ quantityGrams: 120, portion: loaf, portionQuantity: 2 }, 'en'),
    ).toEqual({ kind: 'portion', text: '2 loaves' });

    expect(ingredientAmount({ quantityGrams: 300 }, 'en')).toEqual({ kind: 'grams', grams: 300 });
  });

  test('names are not touched — only amounts', () => {
    // Guards against this module ever growing a display responsibility that
    // `food-display.ts` already owns.
    expect(labneh.nameAr).toBe('لبنة');
    expect(bread.nameEn).toBe('Arabic bread');
  });
});

/**
 * The catalog derives `نصف كوب` and `ربع كوب` from a measured cup, and they are
 * good units to *enter* an amount in. Stating a fractional count of one is a
 * different matter: "three quarters of a half cup" is exact and unreadable.
 */
describe('a fraction of an already-fractional portion', () => {
  const halfCup = { labelAr: 'نصف كوب', labelEn: 'Half cup', grams: 82 };

  test('a whole number of half cups still reads as half cups', () => {
    expect(
      ingredientAmount({ quantityGrams: 164, portion: halfCup, portionQuantity: 2 }, 'ar'),
    ).toEqual({ kind: 'portion', text: '2 نصف كوب' });
  });

  test('a fractional count of them falls back to grams', () => {
    expect(
      ingredientAmount({ quantityGrams: 123, portion: halfCup, portionQuantity: 1.5 }, 'ar'),
    ).toEqual({ kind: 'grams', grams: 123 });
  });

  test('a plain cup keeps its fractions — this is not a rule about fractions', () => {
    const cup2 = { labelAr: 'كوب', labelEn: 'Cup', grams: 158 };

    expect(
      ingredientAmount({ quantityGrams: 79, portion: cup2, portionQuantity: 0.5 }, 'ar'),
    ).toEqual({ kind: 'portion', text: 'نصف كوب' });
  });
});
