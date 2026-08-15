import { describe, expect, test } from 'bun:test';

import { clinicDishInputSchema, customFoodInputSchema } from './catalog-schema';

const validDish = {
  nameAr: 'دجاج مشوي',
  nameEn: 'Grilled chicken',
  mealTypes: ['lunch'],
  tags: ['high_protein_manual_placeholder'],
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
        ingredients: [{ foodId: validDish.ingredients[0].foodId, quantityGrams: 0 }],
      }),
    ).toThrow();
  });

  test('carries optional per-ingredient Arabic name and household measure', () => {
    const parsed = clinicDishInputSchema.parse({
      ...validDish,
      ingredients: [
        {
          foodId: validDish.ingredients[0].foodId,
          quantityGrams: 45,
          displayNameAr: 'أرز',
          householdLabel: 'ملعقة كبيرة',
          householdGrams: 15,
        },
      ],
    });
    expect(parsed.ingredients[0].householdGrams).toBe(15);
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
});
