import { describe, expect, test } from 'bun:test';

import type { MealScheduleInput } from './schema';
import { planSkeleton, slotFillKey } from './skeleton';

const schedule: MealScheduleInput = [
  { slotKey: 'breakfast', label: 'فطور', timeOfDay: '07:30', kcalShare: 0.3 },
  { slotKey: 'lunch', label: 'غداء', timeOfDay: '14:00', kcalShare: 0.7 },
];

describe('planSkeleton', () => {
  test('lays out every slot on every day of the week', () => {
    const meals = planSkeleton({ schedule, dailyKcal: 1000 });

    expect(meals).toHaveLength(14);
    expect(new Set(meals.map((meal) => meal.dayOfWeek))).toEqual(new Set([0, 1, 2, 3, 4, 5, 6]));
  });

  test('budgets each slot by its share of the day', () => {
    const [breakfast, lunch] = planSkeleton({ schedule, dailyKcal: 1000 });

    expect(breakfast?.budgetKcal).toBe(300);
    expect(lunch?.budgetKcal).toBe(700);
  });

  test('orders slots within a day by their position in the schedule', () => {
    const sunday = planSkeleton({ schedule, dailyKcal: 1000 }).filter((meal) => meal.dayOfWeek === 0);

    expect(sunday.map((meal) => meal.slotKey)).toEqual(['breakfast', 'lunch']);
    expect(sunday.map((meal) => meal.sortOrder)).toEqual([0, 1]);
  });

  test('leaves every slot empty when nothing fills it', () => {
    const meals = planSkeleton({ schedule, dailyKcal: 1000 });

    expect(meals.every((meal) => meal.dishId === null)).toBe(true);
    expect(meals.every((meal) => meal.servings === 1)).toBe(true);
  });

  test('fills the slots it has a dish for and leaves the rest empty', () => {
    const meals = planSkeleton({
      schedule,
      dailyKcal: 1000,
      fill: new Map([[slotFillKey(2, 'lunch'), { dishId: 'dish-1', servings: 1.5 }]]),
    });

    const filled = meals.filter((meal) => meal.dishId !== null);

    expect(filled).toHaveLength(1);
    expect(filled[0]).toMatchObject({ dayOfWeek: 2, slotKey: 'lunch', dishId: 'dish-1', servings: 1.5 });
  });

  test('ignores a fill entry whose slot is no longer in the schedule', () => {
    const meals = planSkeleton({
      schedule,
      dailyKcal: 1000,
      fill: new Map([[slotFillKey(0, 'snack_1'), { dishId: 'dish-9', servings: 1 }]]),
    });

    expect(meals).toHaveLength(14);
    expect(meals.every((meal) => meal.dishId === null)).toBe(true);
  });
});
