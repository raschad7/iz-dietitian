import { describe, expect, test } from 'bun:test';

import { clinicDishInputSchema, customFoodInputSchema } from './catalog-schema';

const validDish = {
  nameAr: 'دجاج مشوي',
  nameEn: 'Grilled chicken',
  mealTypes: ['lunch'],
  tags: ['quick', 'economical'],
  allergenTags: [],
  baseServingLabel: 'حصة',
  ingredients: [
    { foodId: '11111111-1111-4111-8111-111111111111', quantityGrams: 200 },
  ],
};

describe('clinicDishInputSchema', () => {
  test('accepts a valid dish with one ingredient', () => {
    const parsed = clinicDishInputSchema.parse(validDish);
    expect(parsed.ingredients).toHaveLength(1);
  });

  test('accepts the full practical tag set', () => {
    const parsed = clinicDishInputSchema.parse({
      ...validDish,
      tags: ['economical', 'quick', 'easy_prep', 'no_cook', 'portable', 'filling', 'local', 'vegetarian'],
    });
    expect(parsed.tags).toHaveLength(8);
  });

  test('rejects the removed computed-nutrition tag high_protein', () => {
    expect(() => clinicDishInputSchema.parse({ ...validDish, tags: ['high_protein'] })).toThrow();
  });

  test('rejects the removed medical tag diabetic_friendly', () => {
    expect(() => clinicDishInputSchema.parse({ ...validDish, tags: ['diabetic_friendly'] })).toThrow();
  });

  test('rejects an unknown tag rather than storing it', () => {
    expect(() => clinicDishInputSchema.parse({ ...validDish, tags: ['made_up_tag'] })).toThrow();
  });

  test('requires at least one ingredient', () => {
    expect(() => clinicDishInputSchema.parse({ ...validDish, ingredients: [] })).toThrow();
  });

  test('requires at least one meal type', () => {
    expect(() => clinicDishInputSchema.parse({ ...validDish, mealTypes: [] })).toThrow();
  });

  test('rejects a non-positive ingredient quantity', () => {
    expect(() =>
      clinicDishInputSchema.parse({
        ...validDish,
        ingredients: [{ foodId: validDish.ingredients[0]!.foodId, quantityGrams: 0 }],
      }),
    ).toThrow();
  });

  test('accepts a dish with no English name — Arabic is the only required name', () => {
    const { nameEn: _omit, ...withoutEnglish } = validDish;
    const parsed = clinicDishInputSchema.parse(withoutEnglish);
    // Defaulted to '', which the mutation stores in the NOT NULL column.
    expect(parsed.nameEn).toBe('');
  });

  test('still rejects a dish with no Arabic name', () => {
    const { nameAr: _omit, ...withoutArabic } = validDish;
    expect(() => clinicDishInputSchema.parse(withoutArabic)).toThrow();
  });

  test('carries optional per-ingredient Arabic name and household measure', () => {
    const parsed = clinicDishInputSchema.parse({
      ...validDish,
      ingredients: [
        {
          foodId: validDish.ingredients[0]!.foodId,
          quantityGrams: 45,
          displayNameAr: 'أرز',
          householdLabel: 'ملعقة كبيرة',
          householdGrams: 15,
        },
      ],
    });
    expect(parsed.ingredients[0]!.householdGrams).toBe(15);
  });
});

describe('customFoodInputSchema', () => {
  test('accepts a custom food with the required macros', () => {
    const parsed = customFoodInputSchema.parse({
      description: 'Village white cheese',
      nameAr: 'جبنة بلدية',
      kcal: 260,
      protein: 18,
      carbs: 2,
      fat: 20,
    });
    expect(parsed.kcal).toBe(260);
  });

  test('rejects negative energy', () => {
    expect(() =>
      customFoodInputSchema.parse({ description: 'x', nameAr: 'x', kcal: -1, protein: 0, carbs: 0, fat: 0 }),
    ).toThrow();
  });

  test('accepts a custom food with no English description — it falls back to Arabic', () => {
    const parsed = customFoodInputSchema.parse({ nameAr: 'جميد بلدي', kcal: 250, protein: 20, carbs: 5, fat: 18 });
    expect(parsed.description).toBe('');
    expect(parsed.nameAr).toBe('جميد بلدي');
  });

  test('accepts a household unit with a positive grams-per-unit (spec §10)', () => {
    const parsed = customFoodInputSchema.parse({
      nameAr: 'خبز عربي منزلي',
      kcal: 275,
      protein: 9,
      carbs: 56,
      fat: 1,
      unit: 'loaf',
      unitGrams: 60,
    });
    expect(parsed.unit).toBe('loaf');
    expect(parsed.unitGrams).toBe(60);
  });

  test('grams-only needs no grams-per-unit', () => {
    const parsed = customFoodInputSchema.parse({
      nameAr: 'جميد بلدي',
      kcal: 250,
      protein: 20,
      carbs: 5,
      fat: 18,
      unit: 'g',
    });
    expect(parsed.unit).toBe('g');
  });

  test('a household unit without a positive grams-per-unit is rejected', () => {
    expect(() =>
      customFoodInputSchema.parse({
        nameAr: 'خبز',
        kcal: 275,
        protein: 9,
        carbs: 56,
        fat: 1,
        unit: 'loaf',
      }),
    ).toThrow();
    expect(() =>
      customFoodInputSchema.parse({
        nameAr: 'خبز',
        kcal: 275,
        protein: 9,
        carbs: 56,
        fat: 1,
        unit: 'loaf',
        unitGrams: 0,
      }),
    ).toThrow();
  });
});
