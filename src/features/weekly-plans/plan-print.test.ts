import { describe, expect, test } from 'bun:test';

import { emptyTotals, type NutrientTotals } from './nutrition';
import { printFileName, printPlan } from './plan-print';
import type { Board, BoardDay, BoardMeal, BoardOption, SwapCandidate } from './queries';

function totals(values: { kcal?: number; protein?: number }): NutrientTotals {
  const base = emptyTotals();

  for (const [key, value] of Object.entries(values)) {
    base[key as keyof NutrientTotals] = { value, unmeasured: 0 };
  }

  return base;
}

function option(name: string, kcal: number): BoardOption {
  return {
    id: `option-${name}`,
    dishId: `dish-${name}`,
    slug: name,
    nameAr: `${name} بالعربية`,
    nameEn: name,
    servings: 1,
    kcal,
    isSimilar: true,
  };
}

function candidate(name: string, kcal: number): SwapCandidate {
  return {
    candidate: {
      id: `candidate-${name}`,
      slug: name,
      nameAr: `${name} بالعربية`,
      nameEn: name,
      mealTypes: [],
      allergenTags: [],
      baseKcal: kcal,
    },
    servings: 1,
    kcal,
    deviation: 0,
  };
}

function meal(
  slotKey: string,
  dishName: string | null,
  { kcal = 320.4, options = [] as BoardOption[] } = {},
): BoardMeal {
  return {
    id: `meal-${slotKey}`,
    slotKey,
    label: slotKey === 'breakfast' ? 'فطور' : 'غداء',
    timeOfDay: slotKey === 'breakfast' ? '07:30' : '14:00',
    dish: dishName
      ? {
          id: `dish-${slotKey}`,
          clinicId: null,
          slug: slotKey,
          nameAr: `${dishName} بالعربية`,
          nameEn: dishName,
          mealTypes: [],
          tags: [],
          allergenTags: [],
          baseServingLabel: 'حصة',
          isActive: true,
          ingredients: [],
          servings: 1,
        }
      : null,
    lines: [],
    hasOwnAmounts: false,
    rationaleAr: null,
    totals: totals({ kcal }),
    grams: 0,
    nutritionFrozen: false,
    budgetKcal: kcal,
    options,
  };
}

function day(dayOfWeek: number, meals: BoardMeal[]): BoardDay {
  return {
    dayOfWeek,
    meals,
    totals: totals({ kcal: 1234.6, protein: 88.25 }),
    unfilled: meals.filter((entry) => entry.dish === null).length,
  };
}

function board(overrides: Partial<Board> = {}): Board {
  return {
    id: 'plan-1',
    clientId: 'client-1',
    clientName: 'سارة',
    weekStartDate: '2026-08-30',
    status: 'draft',
    publishedAt: null,
    weekInstructions: null,
    kcalTargetSnapshot: 1800,
    proteinTargetSnapshot: null,
    goalSnapshot: null,
    generatedBy: 'ai',
    model: null,
    updatedAt: new Date('2026-08-30T10:00:00Z'),
    days: [day(0, [meal('breakfast', 'Labneh plate')])],
    totals: totals({ kcal: 1234.6 }),
    unfilled: 0,
    ...overrides,
  };
}

describe('printPlan', () => {
  test('days come out in the order the week is lived, not Sunday first', () => {
    // A plan starting on a Wednesday. The board carries the days out of order.
    const plan = printPlan(
      board({
        weekStartDate: '2026-09-02',
        days: [day(0, []), day(3, []), day(5, [])],
      }),
      'ar',
    );

    expect(plan.days.map((entry) => entry.dayOfWeek)).toEqual([3, 5, 0]);
  });

  test('each day carries its own calendar date', () => {
    const plan = printPlan(board({ days: [day(0, []), day(1, [])] }), 'ar');

    expect(plan.days.map((entry) => entry.date)).toEqual(['2026-08-30', '2026-08-31']);
  });

  test('an unreadable week start leaves the dates null rather than guessing', () => {
    const plan = printPlan(board({ weekStartDate: '2026-02-31', days: [day(0, [])] }), 'ar');

    expect(plan.days).toHaveLength(1);
    expect(plan.days[0]?.date).toBeNull();
  });

  test('a weekday the board has no day for is dropped, not printed blank', () => {
    const plan = printPlan(board({ days: [day(0, []), day(4, [])] }), 'ar');

    expect(plan.days.map((entry) => entry.dayOfWeek)).toEqual([0, 4]);
  });

  test('the dish name follows the reader, and an unfilled slot has none', () => {
    const days = [day(0, [meal('breakfast', 'Labneh plate'), meal('lunch', null)])];

    expect(printPlan(board({ days }), 'en').days[0]?.meals[0]?.dishName).toBe('Labneh plate');
    expect(printPlan(board({ days }), 'ar').days[0]?.meals[0]?.dishName).toBe(
      'Labneh plate بالعربية',
    );
    expect(printPlan(board({ days }), 'ar').days[0]?.meals[1]?.dishName).toBeNull();
  });

  test('figures are rounded the way every on-screen surface rounds them', () => {
    const plan = printPlan(board(), 'ar');

    // kcal to the whole number, macros to one decimal.
    expect(plan.days[0]?.kcal).toBe(1235);
    expect(plan.days[0]?.macros.protein).toBe(88.3);
    expect(plan.days[0]?.meals[0]?.kcal).toBe(320);
  });

  test("the header repeats the plan's own snapshot, not a live target", () => {
    const plan = printPlan(
      board({ kcalTargetSnapshot: 2100, status: 'published', unfilled: 3 }),
      'ar',
    );

    expect(plan.kcalTarget).toBe(2100);
    expect(plan.published).toBe(true);
    expect(plan.unfilled).toBe(3);
    expect(plan.clientName).toBe('سارة');
  });
});

describe('printPlan alternatives', () => {
  test("the AI's own alternatives lead when the meal has them", () => {
    const days = [
      day(0, [
        meal('breakfast', 'Labneh plate', {
          options: [option('Eggs', 300.4), option('Fatteh', 280)],
        }),
      ]),
    ];

    const alternatives = printPlan(board({ days }), 'en').days[0]?.meals[0]?.alternatives;

    expect(alternatives).toEqual([
      { id: 'option-Eggs', name: 'Eggs', kcal: 300 },
      { id: 'option-Fatteh', name: 'Fatteh', kcal: 280 },
    ]);
  });

  test('the swap candidates stand in when the meal has no alternatives of its own', () => {
    const days = [day(0, [meal('breakfast', 'Labneh plate')])];
    const candidates = { 'meal-breakfast': [candidate('Hummus', 310.6)] };

    const alternatives = printPlan(board({ days }), 'en', candidates).days[0]?.meals[0]
      ?.alternatives;

    expect(alternatives).toEqual([{ id: 'candidate-Hummus', name: 'Hummus', kcal: 311 }]);
  });

  test('a meal with its own alternatives never falls through to the candidates', () => {
    const days = [
      day(0, [meal('breakfast', 'Labneh plate', { options: [option('Eggs', 300)] })]),
    ];
    const candidates = { 'meal-breakfast': [candidate('Hummus', 310)] };

    const alternatives = printPlan(board({ days }), 'en', candidates).days[0]?.meals[0]
      ?.alternatives;

    expect(alternatives?.map((entry) => entry.name)).toEqual(['Eggs']);
  });

  test('at most three, the same number the meal panel shows on screen', () => {
    const days = [
      day(0, [
        meal('breakfast', 'Labneh plate', {
          options: ['a', 'b', 'c', 'd', 'e'].map((name) => option(name, 300)),
        }),
      ]),
    ];

    expect(printPlan(board({ days }), 'en').days[0]?.meals[0]?.alternatives).toHaveLength(3);
  });

  test('an unfilled slot offers none — there is no meal to replace', () => {
    const days = [day(0, [meal('breakfast', null)])];
    const candidates = { 'meal-breakfast': [candidate('Hummus', 310)] };

    expect(printPlan(board({ days }), 'en', candidates).days[0]?.meals[0]?.alternatives).toEqual(
      [],
    );
  });

  test('the alternative names follow the reader too', () => {
    const days = [
      day(0, [meal('breakfast', 'Labneh plate', { options: [option('Eggs', 300)] })]),
    ];

    expect(printPlan(board({ days }), 'ar').days[0]?.meals[0]?.alternatives[0]?.name).toBe(
      'Eggs بالعربية',
    );
  });
});

describe('printFileName', () => {
  test('clinic, client and week, in the order a folder of them groups by', () => {
    expect(
      printFileName({ clinicName: 'عيادة النور', clientName: 'سارة', weekStartDate: '2026-08-30' }),
    ).toBe('عيادة النور - سارة - 2026-08-30');
  });

  test('a clinic with no name recorded is left out, not printed empty', () => {
    expect(
      printFileName({ clinicName: null, clientName: 'Sara', weekStartDate: '2026-08-30' }),
    ).toBe('Sara - 2026-08-30');
    expect(printFileName({ clientName: 'Sara', weekStartDate: '2026-08-30' })).toBe(
      'Sara - 2026-08-30',
    );
  });

  test('characters a file name cannot carry are replaced, not passed through', () => {
    expect(printFileName({ clientName: 'A/B: "C" <D>', weekStartDate: '2026-08-30' })).toBe(
      'A B C D - 2026-08-30',
    );
  });
});
