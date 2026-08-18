import { describe, expect, test } from 'bun:test';

import { applyEdit, nextSlotKey } from './editor-state';
import { emptyTotals, type DishDetail } from './nutrition';
import type { Board, BoardMeal } from './queries';

/**
 * A dish making 300 kcal per base serving, so every total below is checkable by
 * hand: 100 g of a food listing 300 kcal per 100 g.
 */
function dish(id: string): DishDetail {
  return {
    id,
    clinicId: null,
    slug: id,
    nameAr: id,
    nameEn: id,
    mealTypes: ['lunch'],
    tags: [],
    allergenTags: [],
    baseServingLabel: 'حصة',
    isActive: true,
    ingredients: [
      {
        quantityGrams: 100,
        food: {
          id: `food-${id}`,
          nameAr: 'طعام تجريبي',
          nameEn: 'test food',
          kcal: 300,
          protein: 10,
          carbs: 20,
          fat: 5,
          fiber: null,
          sugar: null,
          saturatedFat: null,
          sodium: null,
          cholesterol: null,
          calcium: null,
          iron: null,
          potassium: null,
        },
      },
    ],
  };
}

function meal(id: string, overrides: Partial<BoardMeal> = {}): BoardMeal {
  return {
    id,
    slotKey: 'lunch',
    label: 'غداء',
    timeOfDay: '14:00',
    dish: null,
    rationaleAr: null,
    totals: emptyTotals(),
    grams: 0,
    nutritionFrozen: false,
    budgetKcal: 600,
    options: [],
    ...overrides,
  };
}

/** A board whose Sunday carries `meals` and whose other six days are empty. */
function board(meals: BoardMeal[]): Board {
  return {
    id: 'plan-1',
    clientId: 'client-1',
    clientName: 'Test Client',
    weekStartDate: '2026-08-02',
    status: 'draft',
    publishedAt: null,
    weekInstructions: null,
    kcalTargetSnapshot: 1800,
    proteinTargetSnapshot: null,
    goalSnapshot: null,
    generatedBy: 'manual',
    model: null,
    updatedAt: new Date('2026-08-02T00:00:00Z'),
    days: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      dayOfWeek,
      meals: dayOfWeek === 0 ? meals : [],
      totals: emptyTotals(),
      // Counted rather than hardcoded, so the fixture agrees with what the reducer
      // would derive. A fixture that disagrees turns every no-op assertion into a
      // false failure.
      unfilled: dayOfWeek === 0 ? meals.filter((entry) => entry.dish === null).length : 0,
    })),
    totals: emptyTotals(),
    unfilled: meals.filter((entry) => entry.dish === null).length,
  };
}

/** Places a dish, which most of the tests below need as their starting point. */
function filled(meals: BoardMeal[], mealId: string, servings = 1, dishId = 'd1'): Board {
  return applyEdit(board(meals), { kind: 'place', mealId, dish: dish(dishId), servings });
}

describe('nextSlotKey', () => {
  test('starts at extra_1 on a day with no added slots', () => {
    expect(nextSlotKey(['breakfast', 'lunch'])).toBe('extra_1');
  });

  test('takes the next free index alongside an existing one', () => {
    expect(nextSlotKey(['breakfast', 'extra_1'])).toBe('extra_2');
  });

  test('reuses a freed index rather than counting', () => {
    // extra_1 was removed. Counting the added slots would give extra_2 and keep
    // walking the keys upward across an afternoon of edits.
    expect(nextSlotKey(['breakfast', 'extra_2'])).toBe('extra_1');
  });

  test('ignores keys that merely look like added slots', () => {
    expect(nextSlotKey(['extra_snack', 'extras', 'extra_'])).toBe('extra_1');
  });

  test.each([
    ['breakfast', 'breakfast_extra_1'],
    ['snack', 'snack_extra_1'],
    ['lunch', 'extra_1'],
    ['dinner', 'dinner_extra_1'],
  ] as const)('classifies a new %s row through its slot key', (type, expected) => {
    expect(nextSlotKey([], type)).toBe(expected);
  });

  test('allocates each meal type independently', () => {
    expect(nextSlotKey(['snack_extra_1', 'extra_1'], 'snack')).toBe('snack_extra_2');
    expect(nextSlotKey(['snack_extra_1', 'extra_1'], 'dinner')).toBe('dinner_extra_1');
  });

  test('keeps a selected visual icon in the added slot key', () => {
    expect(nextSlotKey(['lunch_chef_1'], 'lunch', 'lunch_chef')).toBe('lunch_chef_2');
  });
});

describe('applyEdit', () => {
  test('place fills an empty slot and recomputes every total above it', () => {
    const next = filled([meal('m1')], 'm1', 2);
    const placed = next.days[0]!.meals[0]!;

    expect(placed.dish?.id).toBe('d1');
    expect(placed.dish?.servings).toBe(2);
    expect(placed.totals.kcal.value).toBeCloseTo(600, 6);
    expect(next.days[0]!.totals.kcal.value).toBeCloseTo(600, 6);
    expect(next.totals.kcal.value).toBeCloseTo(600, 6);
    expect(next.unfilled).toBe(0);
  });

  test('place onto a filled slot replaces the dish', () => {
    const next = applyEdit(filled([meal('m1')], 'm1'), {
      kind: 'place',
      mealId: 'm1',
      dish: dish('d2'),
      servings: 1,
    });

    expect(next.days[0]!.meals[0]!.dish?.id).toBe('d2');
  });

  test("place onto a filled slot drops the previous dish's rationale", () => {
    const start = filled([meal('m1', { rationaleAr: 'لأنها غنية بالبروتين' })], 'm1');

    const next = applyEdit(start, { kind: 'place', mealId: 'm1', dish: dish('d2'), servings: 1 });

    expect(next.days[0]!.meals[0]!.rationaleAr).toBeNull();
  });

  test('servings rescales the totals', () => {
    const next = applyEdit(filled([meal('m1')], 'm1'), {
      kind: 'servings',
      mealId: 'm1',
      servings: 1.5,
    });

    expect(next.days[0]!.meals[0]!.totals.kcal.value).toBeCloseTo(450, 6);
  });

  test('servings keeps the rationale, because the dish has not changed', () => {
    const start = applyEdit(
      filled([meal('m1')], 'm1'),
      { kind: 'place', mealId: 'm1', dish: dish('d1'), servings: 1 },
    );
    const withRationale = {
      ...start,
      days: start.days.map((day) => ({
        ...day,
        meals: day.meals.map((entry) => ({ ...entry, rationaleAr: 'سبب' })),
      })),
    };

    const next = applyEdit(withRationale, { kind: 'servings', mealId: 'm1', servings: 2 });

    expect(next.days[0]!.meals[0]!.rationaleAr).toBe('سبب');
  });

  test('clear empties the slot but keeps it', () => {
    const next = applyEdit(filled([meal('m1')], 'm1'), { kind: 'clear', mealId: 'm1' });

    expect(next.days[0]!.meals).toHaveLength(1);
    expect(next.days[0]!.meals[0]!.dish).toBeNull();
    expect(next.unfilled).toBe(1);
    expect(next.totals.kcal.value).toBe(0);
  });

  test('remove deletes the slot entirely', () => {
    const next = applyEdit(board([meal('m1'), meal('m2', { slotKey: 'dinner' })]), {
      kind: 'remove',
      mealId: 'm1',
    });

    expect(next.days[0]!.meals.map((entry) => entry.id)).toEqual(['m2']);
    // One slot left, still empty — the removed one is gone rather than counted.
    expect(next.unfilled).toBe(1);
  });

  test('add appends an unbudgeted slot to one day only', () => {
    const next = applyEdit(board([meal('m1')]), {
      kind: 'add',
      dayOfWeek: 0,
      label: 'سناك',
      timeOfDay: '17:00',
      slotKey: 'extra_1',
    });

    const added = next.days[0]!.meals.at(-1)!;

    expect(added.slotKey).toBe('extra_1');
    expect(added.budgetKcal).toBe(0);
    expect(added.dish).toBeNull();
    expect(next.days[1]!.meals).toHaveLength(0);
  });

  test('move carries the dish and portion, and empties the source', () => {
    const start = filled([meal('m1'), meal('m2', { slotKey: 'dinner', budgetKcal: 400 })], 'm1', 2);

    const next = applyEdit(start, { kind: 'move', fromMealId: 'm1', toMealId: 'm2', mode: 'move' });

    expect(next.days[0]!.meals[0]!.dish).toBeNull();
    expect(next.days[0]!.meals[1]!.dish?.id).toBe('d1');
    expect(next.days[0]!.meals[1]!.dish?.servings).toBe(2);
  });

  test('moving onto a filled slot swaps both dishes and their portions', () => {
    const first = filled([meal('m1'), meal('m2', { slotKey: 'dinner' })], 'm1', 1.5, 'd1');
    const start = applyEdit(first, {
      kind: 'place',
      mealId: 'm2',
      dish: dish('d2'),
      servings: 2,
    });

    const next = applyEdit(start, {
      kind: 'move',
      fromMealId: 'm1',
      toMealId: 'm2',
      mode: 'move',
    });

    expect(next.days[0]!.meals[0]!.dish?.id).toBe('d2');
    expect(next.days[0]!.meals[0]!.dish?.servings).toBe(2);
    expect(next.days[0]!.meals[1]!.dish?.id).toBe('d1');
    expect(next.days[0]!.meals[1]!.dish?.servings).toBe(1.5);
  });

  test("move leaves the target's own budget alone", () => {
    const start = filled([meal('m1'), meal('m2', { slotKey: 'dinner', budgetKcal: 400 })], 'm1');

    const next = applyEdit(start, { kind: 'move', fromMealId: 'm1', toMealId: 'm2', mode: 'move' });

    // Moving a 600-budget lunch onto a 400-budget dinner must not re-budget dinner.
    expect(next.days[0]!.meals[1]!.budgetKcal).toBe(400);
    expect(next.days[0]!.meals[1]!.slotKey).toBe('dinner');
    expect(next.days[0]!.meals[1]!.label).toBe('غداء');
  });

  test('copy leaves the source in place', () => {
    const start = filled([meal('m1'), meal('m2', { slotKey: 'dinner' })], 'm1');

    const next = applyEdit(start, { kind: 'move', fromMealId: 'm1', toMealId: 'm2', mode: 'copy' });

    expect(next.days[0]!.meals[0]!.dish?.id).toBe('d1');
    expect(next.days[0]!.meals[1]!.dish?.id).toBe('d1');
    expect(next.totals.kcal.value).toBeCloseTo(600, 6);
  });

  test('moving from an empty slot changes nothing', () => {
    const start = board([meal('m1'), meal('m2', { slotKey: 'dinner' })]);

    expect(applyEdit(start, { kind: 'move', fromMealId: 'm1', toMealId: 'm2', mode: 'move' })).toBe(
      start,
    );
  });

  test('an edit naming a meal that is not on the board changes nothing', () => {
    const start = board([meal('m1')]);

    expect(applyEdit(start, { kind: 'clear', mealId: 'nope' })).toEqual(start);
  });
});
