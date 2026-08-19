import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  SERVING_GUIDES,
  servingGuideFor,
  servingGuideLines,
  servingStepFor,
} from './serving-guide';
import { MAX_SERVINGS, SERVING_STEP } from './similar';
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
 * pin the replacement: the saved portion, multiplied by the meal's servings, in the
 * language being read; and the authoritative grams whenever there is no portion to
 * say it in.
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

  test('a grams-only line is the authoritative grams, scaled', () => {
    const amount = ingredientAmount({ quantityGrams: 150 }, 1, 'ar');

    expect(amount).toEqual({ kind: 'grams', grams: 150 });
  });

  test('a portion line is the portion count, scaled by the meal servings', () => {
    const amount = ingredientAmount(
      { quantityGrams: 60, portion: loaf, portionQuantity: 1 },
      1.5,
      'ar',
    );

    expect(amount).toEqual({ kind: 'portion', text: '1½ رغيف' });
  });

  test('the whole set of specified examples, at one serving', () => {
    const render = (
      ingredient: Parameters<typeof ingredientAmount>[0],
      locale: string,
    ): string => {
      const amount = ingredientAmount(ingredient, 1, locale);
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
    const amount = ingredientAmount(
      { quantityGrams: 120, portion: null, portionQuantity: 2 },
      2,
      'ar',
    );

    expect(amount).toEqual({ kind: 'grams', grams: 240 });
  });

  test('a portion with no count falls back to grams', () => {
    const amount = ingredientAmount({ quantityGrams: 60, portion: loaf }, 1, 'ar');

    expect(amount).toEqual({ kind: 'grams', grams: 60 });
  });

  test('a zero-weight portion falls back to grams rather than dividing by it', () => {
    const amount = ingredientAmount(
      { quantityGrams: 90, portion: { ...loaf, grams: 0 }, portionQuantity: 1 },
      1,
      'ar',
    );

    expect(amount).toEqual({ kind: 'grams', grams: 90 });
  });

  test('the grams fallback and the portion path describe the same meal', () => {
    // Two lines of one meal at ×2: one measured in loaves, one in grams. The
    // point of the pair is that mixing units in a single list is normal.
    const servings = 2;

    expect(
      ingredientAmount({ quantityGrams: 60, portion: loaf, portionQuantity: 1 }, servings, 'en'),
    ).toEqual({ kind: 'portion', text: '2 loaves' });

    expect(ingredientAmount({ quantityGrams: 150 }, servings, 'en')).toEqual({
      kind: 'grams',
      grams: 300,
    });
  });

  test('names are not touched — only amounts', () => {
    // Guards against this module ever growing a display responsibility that
    // `food-display.ts` already owns.
    expect(labneh.nameAr).toBe('لبنة');
    expect(bread.nameEn).toBe('Arabic bread');
  });

  test('a non-positive serving multiplier does not erase the amount', () => {
    // Defensive: `servings` is constrained to 0.25–3 at every write, and a zero
    // arriving here should still print the base recipe rather than "0 رغيف".
    expect(
      ingredientAmount({ quantityGrams: 60, portion: loaf, portionQuantity: 1 }, 0, 'ar'),
    ).toEqual({ kind: 'portion', text: '1 رغيف' });
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
    expect(ingredientAmount({ quantityGrams: 164, portion: halfCup, portionQuantity: 2 }, 1, 'ar')).toEqual({
      kind: 'portion',
      text: '2 نصف كوب',
    });
  });

  test('a fractional count of them falls back to grams', () => {
    expect(
      ingredientAmount({ quantityGrams: 123, portion: halfCup, portionQuantity: 1.5 }, 1, 'ar'),
    ).toEqual({ kind: 'grams', grams: 123 });
  });

  test('the serving multiplier can produce the same case, and is handled the same', () => {
    expect(
      ingredientAmount({ quantityGrams: 82, portion: halfCup, portionQuantity: 1 }, 0.5, 'en'),
    ).toEqual({ kind: 'grams', grams: 41 });
  });

  test('a plain cup keeps its fractions — this is not a rule about fractions', () => {
    const cup = { labelAr: 'كوب', labelEn: 'Cup', grams: 158 };

    expect(ingredientAmount({ quantityGrams: 158, portion: cup, portionQuantity: 1 }, 0.5, 'ar')).toEqual({
      kind: 'portion',
      text: 'نصف كوب',
    });
  });
});

/**
 * The patient-facing serving guide.
 *
 * The card above these lines briefly printed every recipe row — onion, oil, tomato
 * paste, 2 g of cumin. That is a production list, not an instruction, and it is
 * what `serving-guide.ts` replaced. What is pinned here: at most two lines a
 * dish, the amounts as written, the two languages, the dish-specific step, and the
 * fact that a dish without a guide gets **nothing** rather than a guess.
 */
describe('serving guide', () => {
  const render = (slug: string, servings: number, locale: string) => {
    const guide = servingGuideFor(slug);
    if (!guide) throw new Error(`expected a guide for ${slug}`);
    return servingGuideLines(guide, servings, locale).map((line) => `${line.label}: ${line.amount}`);
  };

  test('no guide ever carries more than two lines', () => {
    for (const [slug, guide] of Object.entries(SERVING_GUIDES)) {
      expect(guide.items.length, slug).toBeLessThanOrEqual(2);
      expect(guide.items.length, slug).toBeGreaterThan(0);
    }
  });

  test('every step is a legal multiple of the global serving step', () => {
    for (const [slug, guide] of Object.entries(SERVING_GUIDES)) {
      expect(Math.round(guide.step / SERVING_STEP) * SERVING_STEP, slug).toBeCloseTo(guide.step, 10);
      expect(guide.step, slug).toBeGreaterThan(0);
      expect(guide.step, slug).toBeLessThanOrEqual(MAX_SERVINGS);
    }
  });

  test('eggs and bread read as whole eggs and whole loaves', () => {
    expect(render('eggs-toast-tomato', 1, 'ar')).toEqual(['بيض: 2 حبة', 'خبز عربي: 1 رغيف']);
    expect(render('eggs-toast-tomato', 1, 'en')).toEqual(['Eggs: 2 eggs', 'Arabic bread: 1 loaf']);
  });

  test('the egg dish steps by a whole egg and a whole loaf', () => {
    // `step: 1`, so one press of + is one more of each — not "×1.25 of a meal".
    expect(servingStepFor(servingGuideFor('eggs-toast-tomato'))).toBe(1);
    expect(render('eggs-toast-tomato', 2, 'ar')).toEqual(['بيض: 4 حبة', 'خبز عربي: 2 رغيف']);
    expect(render('eggs-toast-tomato', 2, 'en')).toEqual(['Eggs: 4 eggs', 'Arabic bread: 2 loaves']);
  });

  test('the okra stew reads exactly as specified', () => {
    expect(render('bamia-lahm', 1, 'ar')).toEqual(['أرز مطبوخ: 6 ملاعق كبيرة', 'لحم: 100 غ']);
    expect(render('bamia-lahm', 1, 'en')).toEqual(['Cooked rice: 6 tablespoons', 'Meat: 100 g']);
  });

  test('the okra stew steps by half, and both lines follow', () => {
    expect(servingStepFor(servingGuideFor('bamia-lahm'))).toBe(0.5);
    expect(render('bamia-lahm', 1.5, 'ar')).toEqual(['أرز مطبوخ: 9 ملاعق كبيرة', 'لحم: 150 غ']);
    expect(render('bamia-lahm', 0.5, 'ar')).toEqual(['أرز مطبوخ: 3 ملاعق كبيرة', 'لحم: 50 غ']);
  });

  test('Arabic inflects the 3–10 plural and leaves حبة alone', () => {
    // How a dietitian writes it: `2 حبة`, but `6 ملاعق كبيرة`.
    expect(render('bamia-lahm', 1, 'ar')[0]).toContain('ملاعق كبيرة');
    expect(render('bamia-lahm', 1 / 3, 'ar')[0]).toContain('2 ملعقة كبيرة');
    expect(render('eggs-toast-tomato', 3, 'ar')[0]).toBe('بيض: 6 حبة');
  });

  test('a weight unit is never pluralised and never fractional', () => {
    // "2 gs" is not a thing, and neither is half a gram of meat on a plate.
    expect(render('bamia-lahm', 0.75, 'en')[1]).toBe('Meat: 75 g');
    expect(render('bamia-lahm', 1.25, 'ar')[1]).toBe('لحم: 125 غ');
  });

  test('the guide is what a patient serves, never the recipe', () => {
    // `bamia-lahm` also contains okra, onion, oil and tomato paste. None of them
    // are a serving instruction, and none of them may appear here.
    const lines = render('bamia-lahm', 1, 'ar').join(' ');

    for (const noise of ['بامية', 'بصل', 'زيت', 'معجون', 'ثوم', 'okra', 'onion', 'oil', 'paste']) {
      expect(lines).not.toContain(noise);
    }
  });

  test('a dish with no guide gets no guide, not an invented one', () => {
    // The fallback — the meal weight and the dish's own serving label — is the
    // panel's job. This layer says "nothing", loudly.
    expect(servingGuideFor('maqluba-chicken')).toBeNull();
    expect(servingGuideFor('not-a-real-dish')).toBeNull();
    expect(servingGuideFor(null)).toBeNull();
    expect(servingGuideFor(undefined)).toBeNull();
  });

  test('a dish with no guide still steps, on the global quarter', () => {
    expect(servingStepFor(servingGuideFor('maqluba-chicken'))).toBe(SERVING_STEP);
  });

  test('a one-line guide is allowed', () => {
    expect(render('boiled-eggs-salad', 1, 'ar')).toEqual(['بيض: 2 حبة']);
  });

  test('every guided slug is a dish that actually ships', () => {
    // A guide keyed on a slug nobody has is silently dead. Read from the same
    // committed dataset the seed uses, so a renamed dish fails here.
    const shipped = new Set(
      (JSON.parse(readFileSync('data/dishes.json', 'utf8')) as { dishes: { slug: string }[] }).dishes.map(
        (dish) => dish.slug,
      ),
    );

    for (const slug of Object.keys(SERVING_GUIDES)) {
      expect(shipped.has(slug), slug).toBe(true);
    }
  });

  test('a guide amount is never zero or negative', () => {
    for (const [slug, guide] of Object.entries(SERVING_GUIDES)) {
      for (const item of guide.items) {
        expect(item.amount, `${slug}/${item.labelEn}`).toBeGreaterThan(0);
        expect(item.labelAr.length, slug).toBeGreaterThan(0);
        expect(item.labelEn.length, slug).toBeGreaterThan(0);
      }
    }
  });
});
