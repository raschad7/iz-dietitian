import { describe, expect, test } from 'bun:test';

import type { MealIngredientLine } from './meal-ingredients';
import type { DishDetail, FoodNutrients } from './nutrition';
import { validatePlanData } from './plan-validation';

const nutrients: FoodNutrients = {
  kcal: 300,
  protein: 10,
  carbs: 40,
  fat: 10,
  fiber: null,
  sugar: null,
  saturatedFat: null,
  sodium: null,
  cholesterol: null,
  calcium: null,
  iron: null,
  potassium: null,
};

function dish(overrides: Partial<DishDetail> = {}): DishDetail {
  return {
    id: 'dish-a',
    clinicId: null,
    slug: 'dish-a',
    nameAr: 'طبق',
    nameEn: 'Dish',
    mealTypes: ['lunch'],
    source: 'home',
    effort: 'easy',
    cost: 'normal',
    occasion: 'everyday',
    isSide: false,
    allergenTags: [],
    baseServingLabel: 'حصة',
    isActive: true,
    ingredients: [
      {
        quantityGrams: 200,
        food: {
          id: 'food-a',
          nameAr: 'عدس',
          nameEn: 'Lentils',
          category: 'legumes',
          ...nutrients,
        },
        portion: null,
        portionQuantity: null,
        isPrimary: true,
        isFree: false,
        sortOrder: 0,
      },
    ],
    ...overrides,
  };
}

const meal = {
  id: 'meal-a',
  slotKey: 'lunch',
  budgetKcal: 600,
  dishId: 'dish-a',
  servings: 1,
};

function validate(overrides: Partial<Parameters<typeof validatePlanData>[0]> = {}) {
  const dishes = overrides.dishes ?? [dish()];
  return validatePlanData({
    meals: [meal],
    options: [],
    sides: [],
    dishes,
    visibleDishIds: new Set(dishes.map((entry) => entry.id)),
    constraints: { allergens: [], dietPattern: null },
    ownAmounts: new Map<string, MealIngredientLine[]>(),
    ...overrides,
  });
}

describe('final plan validation', () => {
  test('accepts a visible, compatible meal at a legal serving', () => {
    expect(validate()).toEqual([]);
  });

  test('checks obvious ingredient allergens even when the dish tag is missing', () => {
    const bread = dish({
      ingredients: [
        {
          ...dish().ingredients[0]!,
          food: { ...dish().ingredients[0]!.food, nameAr: 'خبز عربي', nameEn: 'Arabic bread' },
        },
      ],
    });
    expect(validate({ dishes: [bread], constraints: { allergens: ['gluten'], dietPattern: null } }))
      .toContainEqual({ kind: 'constraint_violation', mealId: 'meal-a', dishId: 'dish-a' });
  });

  test('blocks an unsupported therapeutic pattern', () => {
    expect(validate({ constraints: { allergens: [], dietPattern: 'renal' } }))
      .toContainEqual({ kind: 'unsupported_pattern' });
  });

  test('blocks publication when a typed exclusion has no reviewed catalog mapping', () => {
    expect(
      validate({
        constraints: {
          allergens: [],
          dietPattern: null,
          unmappedExclusions: ['كيوي'],
        },
      }),
    ).toContainEqual({ kind: 'unmapped_exclusions' });
  });

  test('validates side roles and the actual energy of alternatives', () => {
    const sideUsedAsMain = dish({ id: 'side-a', slug: 'side-a', isSide: true });
    const lightOption = dish({
      id: 'option-a',
      slug: 'option-a',
      ingredients: [{ ...dish().ingredients[0]!, quantityGrams: 50 }],
    });
    const issues = validate({
      dishes: [dish(), sideUsedAsMain, lightOption],
      sides: [{ mealId: 'meal-a', dishId: 'dish-a' }],
      options: [{ mealId: 'meal-a', dishId: 'option-a', servings: 1 }],
      visibleDishIds: new Set(['dish-a', 'side-a', 'option-a']),
    });

    expect(issues).toContainEqual({ kind: 'wrong_dish_role', mealId: 'meal-a', dishId: 'dish-a' });
    expect(issues).toContainEqual({ kind: 'option_not_similar', mealId: 'meal-a', dishId: 'option-a' });
  });

  test('does not publish a named dish with no recipe as a zero-calorie meal', () => {
    expect(validate({ dishes: [dish({ ingredients: [] })] })).toContainEqual({
      kind: 'dish_without_ingredients',
      mealId: 'meal-a',
      dishId: 'dish-a',
    });
  });
});
