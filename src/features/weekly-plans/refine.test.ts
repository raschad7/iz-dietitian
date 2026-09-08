import { describe, expect, test } from 'bun:test';

import type { CatalogDish, ReconciledMeal } from './generate';
import type { DishIngredientDetail, FoodNutrients } from './nutrition';
import { draftFromMeals } from './refine';
import type { SlotBudget } from './targets';

/**
 * The second pass is only worth its call if it is shown the right week. These
 * check the two ways that can go wrong: numbers that disagree with the page, and
 * findings that tell the model something it cannot act on.
 */

const NUTRIENTS: FoodNutrients = {
  kcal: 200,
  protein: 20,
  carbs: 10,
  fat: 8,
  fiber: null,
  sugar: null,
  saturatedFat: null,
  cholesterol: null,
  sodium: null,
  calcium: null,
  iron: null,
  potassium: null,
};

function recipeOf(kcalPer100: number, proteinPer100: number, grams: number): DishIngredientDetail[] {
  return [
    {
      quantityGrams: grams,
      food: {
        id: 'food',
        nameAr: 'food',
        nameEn: 'food',
        category: 'poultry',
        ...NUTRIENTS,
        kcal: kcalPer100,
        protein: proteinPer100,
      },
      isPrimary: true,
      sortOrder: 0,
    },
  ];
}

function dish(id: string, kcalPer100 = 200, proteinPer100 = 20, grams = 100): CatalogDish {
  return {
    id,
    slug: id,
    nameAr: id,
    mealTypes: ['lunch', 'dinner', 'breakfast', 'snack'],
    source: 'home',
    effort: 'medium',
    cost: 'normal',
    occasion: 'everyday',
    allergenTags: [],
    baseKcal: (kcalPer100 * grams) / 100,
    baseProtein: (proteinPer100 * grams) / 100,
    baseCarbs: 10,
    baseSodium: 100,
    nutritionCategory: 'balanced',
    proteinSource: 'poultry',
    carbBase: 'none',
    recipe: recipeOf(kcalPer100, proteinPer100, grams),
  };
}

const BUDGETS: SlotBudget[] = [
  { slotKey: 'lunch', label: 'غداء', timeOfDay: '14:00', kcal: 200 },
  { slotKey: 'dinner', label: 'عشاء', timeOfDay: '20:00', kcal: 200 },
];

function meal(dayOfWeek: number, slotKey: string, dishId: string | null): ReconciledMeal {
  return {
    dayOfWeek,
    slotKey,
    label: slotKey,
    timeOfDay: '14:00',
    budgetKcal: 200,
    sortOrder: 0,
    dishId,
    servings: 1,
    rationaleAr: null,
    options: [],
    sideDishIds: [],
  };
}

const CATALOG = [dish('chicken'), dish('fish'), dish('lentils')];

describe('draftFromMeals', () => {
  test('reports each meal against its own budget, and the day against the target', () => {
    const draft = draftFromMeals({
      meals: [meal(0, 'lunch', 'chicken'), meal(0, 'dinner', 'fish')],
      budgets: BUDGETS,
      catalog: CATALOG,
      sides: [],
      days: [0],
      kcalTarget: 400,
      proteinTargetGrams: 40,
    });

    expect(draft.days).toHaveLength(1);
    expect(draft.days[0]!.kcal).toBe(400);
    expect(draft.days[0]!.protein).toBe(40);
    expect(draft.days[0]!.meals.map((one) => one.slug)).toEqual(['chicken', 'fish']);
    expect(draft.days[0]!.meals[0]!.budgetKcal).toBe(200);
    // A week that hits both targets has nothing for the second pass to correct.
    expect(draft.findings).toEqual([]);
  });

  test('a side counts, because the client eats it', () => {
    const withSide: ReconciledMeal = { ...meal(0, 'lunch', 'chicken'), sideDishIds: ['salad'] };

    const draft = draftFromMeals({
      meals: [withSide],
      budgets: [BUDGETS[0]!],
      catalog: CATALOG,
      sides: [dish('salad', 50, 2, 100)],
      days: [0],
      kcalTarget: 200,
      proteinTargetGrams: 20,
    });

    expect(draft.days[0]!.kcal).toBe(250);
  });

  test('a short day is named, with both numbers', () => {
    const draft = draftFromMeals({
      meals: [meal(0, 'lunch', 'chicken')],
      budgets: BUDGETS,
      catalog: CATALOG,
      sides: [],
      days: [0],
      kcalTarget: 400,
      proteinTargetGrams: 40,
    });

    expect(draft.findings.some((one) => one.includes('200 kcal against a 400 kcal target'))).toBe(
      true,
    );
    expect(draft.findings.some((one) => one.includes('20 g protein against a 40 g target'))).toBe(
      true,
    );
  });

  test('an empty slot is named rather than left as a gap', () => {
    const draft = draftFromMeals({
      meals: [meal(0, 'lunch', null)],
      budgets: [BUDGETS[0]!],
      catalog: CATALOG,
      sides: [],
      days: [0],
      kcalTarget: 200,
      proteinTargetGrams: null,
    });

    expect(draft.days[0]!.meals[0]!.slug).toBe('');
    expect(draft.findings.some((one) => one.includes('empty'))).toBe(true);
  });

  test('a dish carrying more than two meals of the week is reported', () => {
    const meals = [0, 1, 2].flatMap((day) => [
      meal(day, 'lunch', 'chicken'),
      meal(day, 'dinner', 'fish'),
    ]);

    const draft = draftFromMeals({
      meals,
      budgets: BUDGETS,
      catalog: CATALOG,
      sides: [],
      days: [0, 1, 2],
      kcalTarget: 400,
      proteinTargetGrams: 40,
    });

    expect(draft.findings.some((one) => one.includes('"chicken" appears 3 times'))).toBe(true);
  });

  /*
    The finding this pass exists for. A diabetic week can land on its calorie
    target every single day and still swing from 104 g of carbohydrate to 256 g,
    and no per-day check can see it.
  */
  test('a carbohydrate swing across the week is stated once', () => {
    const light = dish('light', 200, 20, 100);
    const heavy = { ...dish('heavy', 200, 20, 100), recipe: recipeOf(200, 20, 100) };
    heavy.recipe[0]!.food.carbs = 200;

    const draft = draftFromMeals({
      meals: [meal(0, 'lunch', 'light'), meal(1, 'lunch', 'heavy')],
      budgets: [BUDGETS[0]!],
      catalog: [light, heavy],
      sides: [],
      days: [0, 1],
      kcalTarget: 200,
      proteinTargetGrams: 20,
    });

    expect(draft.findings.some((one) => one.includes('Carbohydrate swings'))).toBe(true);
  });
});
