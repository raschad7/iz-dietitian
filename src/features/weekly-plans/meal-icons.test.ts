import { describe, expect, test } from 'bun:test';

import { mealIconForSlot } from './meal-icons';

describe('mealIconForSlot', () => {
  test('uses the food-first defaults for existing schedule rows', () => {
    expect(mealIconForSlot('breakfast')).toBe('plannerMealBreakfast');
    expect(mealIconForSlot('lunch')).toBe('plannerMealLunch');
    expect(mealIconForSlot('dinner')).toBe('plannerMealDinner');
  });

  test('restores the exact icon selected for an added row', () => {
    expect(mealIconForSlot('breakfast_hot_drink_1')).toBe('plannerMealHotDrink');
    expect(mealIconForSlot('lunch_heart_2')).toBe('plannerMealChefHeart');
    expect(mealIconForSlot('dinner_chef_1')).toBe('plannerMealChefMinimal');
  });
});
