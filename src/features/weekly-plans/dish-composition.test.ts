import { describe, expect, test } from 'bun:test';

import { carbBase, proteinSource } from './dish-composition';
import type { DishIngredientDetail, FoodNutrients } from './nutrition';

const EMPTY: FoodNutrients = {
  kcal: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
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
  nameEn: string,
  category: string,
  grams: number,
  nutrients: Partial<FoodNutrients>,
): DishIngredientDetail {
  return {
    quantityGrams: grams,
    food: { id: nameEn, nameAr: nameEn, nameEn, category, ...EMPTY, ...nutrients },
    isPrimary: false,
    sortOrder: 0,
  };
}

describe('proteinSource', () => {
  /**
   * مجدرة is lentils to anyone eating it, even though the rice outweighs them.
   * Protein is what settles it, which is why the rule is written on protein.
   */
  test('the food contributing the most protein wins, not the heaviest one', () => {
    const mujaddara = [
      line('White rice, cooked', 'grains', 200, { protein: 2.7, carbs: 28 }),
      line('Lentils, cooked', 'legumes', 100, { protein: 9, carbs: 20 }),
    ];

    expect(proteinSource(mujaddara)).toBe('legume');
  });

  test('eggs and yogurt share a category and are never the same meal', () => {
    expect(proteinSource([line('Egg, whole, raw, fresh', 'dairy_eggs', 100, { protein: 12.6 })])).toBe(
      'egg',
    );
    expect(
      proteinSource([line('Yogurt, Greek, plain, lowfat', 'dairy_eggs', 200, { protein: 10 })]),
    ).toBe('dairy');
  });

  test('meat, poultry and fish are told apart', () => {
    expect(proteinSource([line('Beef, ground', 'meat', 100, { protein: 21 })])).toBe('red_meat');
    expect(proteinSource([line('Chicken, breast', 'poultry', 100, { protein: 31 })])).toBe('poultry');
    expect(proteinSource([line('Fish, tilapia', 'fish', 100, { protein: 26 })])).toBe('fish');
  });

  /** A fruit snack has no protein source, and that is an answer rather than a gap. */
  test('a dish with no protein food is none', () => {
    expect(proteinSource([line('Oranges, raw', 'fruits', 200, { protein: 0.9 })])).toBe('none');
    expect(proteinSource([])).toBe('none');
  });
});

describe('carbBase', () => {
  test('names the starch a person would name', () => {
    expect(carbBase([line('White rice, cooked', 'grains', 200, { carbs: 28 })])).toBe('rice');
    expect(carbBase([line('Bread, pita, white', 'grains', 60, { carbs: 55 })])).toBe('bread');
    expect(carbBase([line('Bulgur, cooked', 'grains', 180, { carbs: 19 })])).toBe('bulgur');
    expect(carbBase([line('Macaroni, cooked', 'grains', 180, { carbs: 25 })])).toBe('pasta');
  });

  /** A vegetable to the catalog and a starch on the plate. */
  test('potato counts, and other vegetables do not', () => {
    expect(carbBase([line('Potatoes, raw', 'vegetables', 200, { carbs: 17 })])).toBe('potato');
    expect(carbBase([line('Tomatoes, raw', 'vegetables', 200, { carbs: 4 })])).toBe('none');
  });

  test('the biggest carbohydrate contributor wins', () => {
    const maqluba = [
      line('White rice, cooked', 'grains', 200, { carbs: 28 }),
      line('Bread, pita, white', 'grains', 20, { carbs: 55 }),
    ];

    expect(carbBase(maqluba)).toBe('rice');
  });
});
