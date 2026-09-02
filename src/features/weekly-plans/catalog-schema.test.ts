import { describe, expect, test } from 'bun:test';

import { clinicDishInputSchema, customFoodInputSchema } from './catalog-schema';

const validDish = {
  nameAr: 'دجاج مشوي',
  nameEn: 'Grilled chicken',
  mealTypes: ['lunch'],
  tags: ['quick', 'economical'],
  source: 'home',
  effort: 'medium',
  cost: 'normal',
  occasion: 'everyday',
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

  /**
   * A clinic dish answers all four axes or it does not save. The tag bag it
   * replaced allowed a dish to carry nothing at all, which is how the catalog
   * ended up with labels that filtered nothing.
   */
  test('every axis is required', () => {
    for (const axis of ['source', 'effort', 'cost', 'occasion']) {
      const { [axis]: _dropped, ...without } = validDish as Record<string, unknown>;
      expect(() => clinicDishInputSchema.parse(without)).toThrow();
    }
  });

  test('rejects a value outside an axis', () => {
    expect(() => clinicDishInputSchema.parse({ ...validDish, source: 'takeaway' })).toThrow();
    expect(() => clinicDishInputSchema.parse({ ...validDish, effort: 'instant' })).toThrow();
  });

  /** Nutrition is computed from the recipe and can never be typed onto a dish. */
  test('has nowhere to put a nutrition label', () => {
    const parsed = clinicDishInputSchema.parse({ ...validDish, tags: ['high_protein'] });
    expect(parsed).not.toHaveProperty('tags');
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

  test('carries the portion an amount was entered in, beside the authoritative grams', () => {
    const parsed = clinicDishInputSchema.parse({
      ...validDish,
      ingredients: [
        {
          foodId: validDish.ingredients[0]!.foodId,
          quantityGrams: 100,
          portionId: '3f2a1b4c-5d6e-4f70-8192-a3b4c5d6e7f8',
          portionQuantity: 2,
        },
      ],
    });

    expect(parsed.ingredients[0]!.quantityGrams).toBe(100);
    expect(parsed.ingredients[0]!.portionQuantity).toBe(2);
  });

  /*
   * Half a record of how an amount was entered is not a record of anything: a
   * portion with no count cannot be rendered, and a count with no portion has no
   * unit. Both, or neither.
   */
  test('rejects a portion without its quantity', () => {
    const result = clinicDishInputSchema.safeParse({
      ...validDish,
      ingredients: [
        {
          foodId: validDish.ingredients[0]!.foodId,
          quantityGrams: 100,
          portionId: '3f2a1b4c-5d6e-4f70-8192-a3b4c5d6e7f8',
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  test('rejects a quantity without its portion', () => {
    const result = clinicDishInputSchema.safeParse({
      ...validDish,
      ingredients: [
        { foodId: validDish.ingredients[0]!.foodId, quantityGrams: 100, portionQuantity: 2 },
      ],
    });

    expect(result.success).toBe(false);
  });

  test('rejects a non-finite quantity, which coercion would otherwise let through', () => {
    const result = clinicDishInputSchema.safeParse({
      ...validDish,
      ingredients: [{ foodId: validDish.ingredients[0]!.foodId, quantityGrams: 'Infinity' }],
    });

    expect(result.success).toBe(false);
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
