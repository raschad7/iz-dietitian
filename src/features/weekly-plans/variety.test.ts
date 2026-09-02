import { describe, expect, test } from 'bun:test';

import { carbBase, proteinSource } from './dish-composition';
import type { CatalogDish } from './generate';
import type { DishIngredientDetail, FoodNutrients } from './nutrition';
import { repairVariety, varietyProfile, type VarietyMeal } from './variety';

/**
 * The week these rules were written against had chickpeas in eight meals of
 * thirty-five and served chicken salad for lunch and again for dinner on the same
 * Monday — while breaking none of the rules it had been given, because those were
 * about dishes and the repetition was in the ingredients.
 */

const NUTRIENTS: FoodNutrients = {
  kcal: 150,
  protein: 20,
  carbs: 5,
  fat: 5,
  fiber: null,
  sugar: null,
  saturatedFat: null,
  cholesterol: null,
  sodium: null,
  calcium: null,
  iron: null,
  potassium: null,
};

function line(
  id: string,
  category: string,
  grams: number,
  overrides: Partial<FoodNutrients> = {},
): DishIngredientDetail {
  return {
    quantityGrams: grams,
    food: { id, nameAr: id, nameEn: id, category, ...NUTRIENTS, ...overrides },
    isPrimary: true,
    sortOrder: 0,
  };
}

/** A dish of one protein food and one starch, at roughly `kcal` per serving. */
function dish(id: string, category: string, nameEn: string, kcal = 300): CatalogDish {
  const recipe: DishIngredientDetail[] = [
    { ...line(nameEn, category, 100), food: { ...line(nameEn, category, 100).food, nameEn } },
    line(`${id}-rice`, 'grains', ((kcal - 150) / 150) * 100, { protein: 2, carbs: 30 }),
  ];

  return {
    id,
    slug: id,
    nameAr: id,
    mealTypes: ['lunch', 'dinner'],
    tags: [],
    source: 'home',
    effort: 'medium',
    cost: 'normal',
    occasion: 'everyday',
    allergenTags: [],
    baseKcal: kcal,
    baseProtein: 22,
    nutritionCategory: 'balanced',
    proteinSource: proteinSource(recipe),
    carbBase: carbBase(recipe),
    recipe,
  };
}

const CATALOG: CatalogDish[] = [
  dish('chicken-a', 'poultry', 'chicken breast'),
  dish('chicken-b', 'poultry', 'chicken thigh'),
  dish('fish-a', 'fish', 'tilapia'),
  dish('beef-a', 'meat', 'ground beef'),
  dish('lentil-a', 'legumes', 'lentils'),
  dish('egg-a', 'dairy_eggs', 'egg'),
];

function meal(dayOfWeek: number, slotKey: string, dishId: string): VarietyMeal {
  return { dayOfWeek, slotKey, budgetKcal: 300, dishId, servings: 1 };
}

describe('repairVariety', () => {
  test('a protein source twice in one day is replaced, and the first use is kept', () => {
    const meals = [meal(0, 'lunch', 'chicken-a'), meal(0, 'dinner', 'chicken-b')];

    const report = repairVariety({ meals, catalog: CATALOG, allergens: [] });

    expect(report.repaired).toBe(1);
    expect(meals[0]!.dishId).toBe('chicken-a');
    expect(meals[1]!.dishId).not.toBe('chicken-b');

    const replacement = CATALOG.find((entry) => entry.id === meals[1]!.dishId)!;
    expect(proteinSource(replacement.recipe)).not.toBe('poultry');
  });

  test('the same dish twice in one day is replaced even where the source is fine', () => {
    const meals = [meal(0, 'lunch', 'fish-a'), meal(0, 'dinner', 'fish-a')];

    repairVariety({ meals, catalog: CATALOG, allergens: [] });

    expect(meals[1]!.dishId).not.toBe('fish-a');
  });

  test('a fourth week-long use of one source is replaced', () => {
    // Three chicken meals on separate days are allowed; the fourth is not.
    const meals = [
      meal(0, 'lunch', 'chicken-a'),
      meal(1, 'lunch', 'chicken-b'),
      meal(2, 'lunch', 'chicken-a'),
      meal(3, 'lunch', 'chicken-b'),
    ];

    const report = repairVariety({ meals, catalog: CATALOG, allergens: [] });

    expect(report.repaired).toBe(1);
    expect(meals.slice(0, 3).map((entry) => entry.dishId)).toEqual([
      'chicken-a',
      'chicken-b',
      'chicken-a',
    ]);
    expect(meals[3]!.dishId).not.toBe('chicken-b');
  });

  test('a varied week is left alone', () => {
    const meals = [
      meal(0, 'lunch', 'chicken-a'),
      meal(0, 'dinner', 'lentil-a'),
      meal(1, 'lunch', 'fish-a'),
      meal(1, 'dinner', 'beef-a'),
    ];
    const before = meals.map((entry) => entry.dishId);

    const report = repairVariety({ meals, catalog: CATALOG, allergens: [] });

    expect(report).toEqual({ repaired: 0, unresolved: 0 });
    expect(meals.map((entry) => entry.dishId)).toEqual(before);
  });

  /**
   * A repeat that cannot be fixed is left in place and counted. Swapping in a
   * dish that misses the slot by a third would trade a monotony problem for a
   * nutrition one, and the catalog being too thin is the real finding.
   */
  test('a violation with no replacement in budget is reported, not forced', () => {
    const thin = [CATALOG[0]!, CATALOG[1]!];
    const meals = [meal(0, 'lunch', 'chicken-a'), meal(0, 'dinner', 'chicken-b')];

    const report = repairVariety({ meals, catalog: thin, allergens: [] });

    expect(report).toEqual({ repaired: 0, unresolved: 1 });
    expect(meals[1]!.dishId).toBe('chicken-b');
  });

  test("a replacement carrying the client's allergen is never chosen", () => {
    const meals = [meal(0, 'lunch', 'chicken-a'), meal(0, 'dinner', 'chicken-b')];
    const catalog = CATALOG.map((entry) =>
      entry.id === 'fish-a' ? { ...entry, allergenTags: ['fish'] } : entry,
    );

    repairVariety({ meals, catalog, allergens: ['fish'] });

    expect(meals[1]!.dishId).not.toBe('fish-a');
  });

  test('an empty slot is skipped rather than counted as a repeat', () => {
    const meals: VarietyMeal[] = [
      { dayOfWeek: 0, slotKey: 'lunch', budgetKcal: 300, dishId: null, servings: 1 },
      meal(0, 'dinner', 'chicken-a'),
    ];

    expect(repairVariety({ meals, catalog: CATALOG, allergens: [] })).toEqual({
      repaired: 0,
      unresolved: 0,
    });
  });
});

describe('varietyProfile', () => {
  test('counts what the week is actually made of', () => {
    const meals = [
      meal(0, 'lunch', 'chicken-a'),
      meal(1, 'lunch', 'chicken-b'),
      meal(2, 'lunch', 'fish-a'),
    ];

    expect(varietyProfile(meals, CATALOG).proteinSources).toEqual({ poultry: 2, fish: 1 });
  });
});
