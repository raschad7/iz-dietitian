import { describe, expect, test } from 'bun:test';

import { reconcile, type CatalogDish } from './generate';
import type { DishIngredientDetail } from './nutrition';
import { parseGeneratedPlan } from './schema';

/**
 * A recipe of one weighed line worth `kcal` at one serving.
 *
 * `reconcile` portions a recipe to decide what a multiplier produces, so a
 * catalog entry needs one. A single grams-measured line is the simplest thing
 * that behaves: it steps in tens and meets no ceiling, so the portion these tests
 * assert on is the multiplier and nothing else.
 */
function recipeOf(kcal: number): DishIngredientDetail[] {
  return [
    {
      quantityGrams: kcal,
      food: {
        id: `food-${kcal}`,
        nameAr: 'مكوّن',
        nameEn: 'Ingredient',
        category: 'grains',
        kcal: 100,
        protein: 5,
        carbs: 10,
        fat: 1,
        fiber: null,
        sugar: null,
        saturatedFat: null,
        sodium: null,
        cholesterol: null,
        calcium: null,
        iron: null,
        potassium: null,
      },
      isPrimary: true,
      sortOrder: 0,
    },
  ];
}

/**
 * A catalog small enough to reason about, shaped like the real one.
 *
 * `nuts-dish` exists specifically so the allergen path has something to reject,
 * and `breakfast-only` so the meal-type path does.
 */
const CATALOG: CatalogDish[] = [
  {
    id: 'dish-mujaddara',
    slug: 'mujaddara',
    nameAr: 'مجدرة',
    mealTypes: ['lunch', 'dinner'],
    tags: ['economical'],
    allergenTags: [],
    baseKcal: 620,
    baseProtein: 22,
    nutritionCategory: 'balanced',
    proteinSource: 'legume',
    carbBase: 'rice',
    recipe: recipeOf(620),
  },
  {
    id: 'dish-fasolia',
    slug: 'fasolia',
    nameAr: 'فاصولياء',
    mealTypes: ['lunch', 'dinner'],
    tags: ['economical'],
    allergenTags: [],
    baseKcal: 600,
    baseProtein: 20,
    nutritionCategory: 'balanced',
    proteinSource: 'legume',
    carbBase: 'rice',
    recipe: recipeOf(600),
  },
  {
    id: 'dish-nuts',
    slug: 'nuts-dish',
    nameAr: 'طبق مكسرات',
    mealTypes: ['lunch'],
    tags: [],
    allergenTags: ['nuts'],
    baseKcal: 610,
    baseProtein: 18,
    nutritionCategory: 'balanced',
    proteinSource: 'legume',
    carbBase: 'rice',
    recipe: recipeOf(610),
  },
  {
    id: 'dish-labaneh',
    slug: 'breakfast-only',
    nameAr: 'لبنة',
    mealTypes: ['breakfast'],
    tags: [],
    allergenTags: ['lactose'],
    baseKcal: 380,
    baseProtein: 18,
    nutritionCategory: 'balanced',
    proteinSource: 'legume',
    carbBase: 'rice',
    recipe: recipeOf(380),
  },
  {
    id: 'dish-tiny',
    slug: 'tiny-lunch',
    nameAr: 'طبق صغير',
    mealTypes: ['lunch'],
    tags: [],
    allergenTags: [],
    baseKcal: 120,
    baseProtein: 4,
    nutritionCategory: 'balanced',
    proteinSource: 'legume',
    carbBase: 'rice',
    recipe: recipeOf(120),
  },
];

const BUDGETS = [{ slotKey: 'lunch', label: 'غداء', timeOfDay: '14:00', kcal: 620 }];

/** A meal body, without a slot key — the response keys meals by slot. */
function meal(overrides: Record<string, unknown> = {}) {
  return {
    dish: 'mujaddara',
    servings: 1,
    rationaleAr: 'طبق محلي رخيص وغني بالبروتين.',
    alternatives: [{ dish: 'fasolia', servings: 1 }],
    ...overrides,
  };
}

/**
 * One day, with the given meal in the single `lunch` slot these suites use.
 *
 * `null` means the slot is absent — not `undefined`, which JavaScript would resolve
 * to the default parameter and silently give you a filled slot instead.
 */
function day(dayOfWeek: number, lunch: Record<string, unknown> | null = meal()) {
  return lunch === null ? { dayOfWeek } : { dayOfWeek, lunch };
}

function run(
  days: Record<string, unknown>[],
  options: { allergens?: string[]; requestDays?: number[]; catalog?: CatalogDish[] } = {},
) {
  return reconcile({
    plan: parseGeneratedPlan({ days }, ['lunch']),
    days: options.requestDays ?? [0],
    budgets: BUDGETS,
    catalog: options.catalog ?? CATALOG,
    allergens: options.allergens ?? [],
  });
}

/**
 * A catalog wide enough for the substitute pool to have somewhere to rotate.
 *
 * The fixture above holds three lunch dishes, which is exactly the number a meal
 * offers — so every meal is offered all three and rotation has nothing to do.
 * That is correct behaviour and worth its own assertion; this is for the case
 * where a real catalog gives the pool a choice.
 */
const WIDE_CATALOG: CatalogDish[] = [
  ...CATALOG,
  ...Array.from({ length: 6 }, (_, index) => ({
    id: `dish-extra-${index}`,
    slug: `extra-${index}`,
    nameAr: `طبق ${index}`,
    mealTypes: ['lunch'],
    tags: [],
    allergenTags: [],
    baseKcal: 600 + index,
    baseProtein: 20,
    nutritionCategory: 'balanced',
    proteinSource: 'legume',
    carbBase: 'rice',
    recipe: recipeOf(600 + index),
  })),
];

describe('reconcile — the happy path', () => {
  test('resolves a valid meal to a dish id', () => {
    const result = run([day(0)]);

    expect(result.warnings).toEqual([]);
    expect(result.unfilled).toBe(0);
    expect(result.meals).toHaveLength(1);
    expect(result.meals[0]).toMatchObject({
      dayOfWeek: 0,
      slotKey: 'lunch',
      label: 'غداء',
      timeOfDay: '14:00',
      budgetKcal: 620,
      dishId: 'dish-mujaddara',
      servings: 1,
      rationaleAr: 'طبق محلي رخيص وغني بالبروتين.',
    });
  });

  /**
   * Alternatives are computed from the catalog, not read from the response.
   * The model used to return them, spent a third of its output doing it, and
   * offered the same three dishes under every lunch of the week.
   */
  test('offers substitutes drawn from the slot catalog, never the chosen dish', () => {
    const result = run([day(0, meal())]);

    const options = result.meals[0]!.options;

    expect(options.length).toBeGreaterThan(0);
    expect(options.map((option) => option.slug)).not.toContain('mujaddara');
    // Every option is a lunch dish, and none is offered twice.
    expect(new Set(options.map((option) => option.slug)).size).toBe(options.length);
    expect(options.every((option) => option.slug !== 'breakfast-only')).toBe(true);
  });

  test('marks whether each substitute actually fits the budget', () => {
    const result = run([day(0, meal())]);

    const options = result.meals[0]!.options;
    // fasolia at its computed 1× is 600 against 620 — within 15%.
    expect(options.find((option) => option.slug === 'fasolia')?.isSimilar).toBe(true);
    // tiny-lunch cannot reach 620 even at the ceiling, so it is offered where the
    // pool is thin but never as a like-for-like swap.
    expect(options.find((option) => option.slug === 'tiny-lunch')?.isSimilar ?? false).toBe(false);
  });

  test('a catalog with no room to rotate offers every dish that fits the slot', () => {
    // Four lunch dishes, one of them chosen: the three that remain are the pool
    // and the offer, and rotation has nothing to choose between.
    const result = run([day(0, meal())]);

    expect(result.meals[0]!.options).toHaveLength(3);
  });

  test('the same slot on different days is not offered the same three', () => {
    const result = run([day(0, meal()), day(1, meal())], {
      requestDays: [0, 1],
      catalog: WIDE_CATALOG,
    });

    const first = result.meals[0]!.options.map((option) => option.slug).join(',');
    const second = result.meals[1]!.options.map((option) => option.slug).join(',');

    expect(first).not.toBe(second);
  });

  test('computes the portion rather than trusting the model', () => {
    // The dish is 620 kcal a serving against a 620 budget, so one serving is right —
    // whatever the model asked for. gpt-4o-mini reliably under-portions lunch, which
    // turned a 1,577 kcal target into a 1,292 kcal day before this.
    const result = run([day(0, meal({ servings: 0.75 }))]);

    expect(result.meals[0]!.servings).toBe(1);
  });

  test('scales a small dish up to reach the budget', () => {
    // tiny-lunch is 120 kcal a serving; 620 / 120 = 5.17, clamped to the 3× ceiling.
    const result = run([day(0, meal({ dish: 'tiny-lunch', servings: 1, alternatives: [] }))]);

    expect(result.meals[0]!.servings).toBe(3);
  });

  test('computes alternative portions too, so an alternative is a real substitute', () => {
    const result = run([
      day(0, meal({ alternatives: [{ dish: 'fasolia', servings: 0.25 }] })),
    ]);

    // fasolia is 600 kcal; 620 / 600 = 1.03 → 1, not the 0.25 the model offered.
    expect(result.meals[0]!.options[0]!.servings).toBe(1);
    expect(result.meals[0]!.options[0]!.isSimilar).toBe(true);
  });
});

describe('reconcile — untrusted references', () => {
  test('drops a hallucinated dish and leaves the slot empty', () => {
    const result = run([day(0, meal({ dish: 'kebab-supreme', alternatives: [] }))]);

    expect(result.meals[0]!.dishId).toBeNull();
    expect(result.unfilled).toBe(1);
    expect(result.warnings).toEqual([
      { kind: 'unknown_dish', slug: 'kebab-supreme', dayOfWeek: 0, slotKey: 'lunch' },
    ]);
  });

  test('drops a dish carrying an allergen the client reacts to', () => {
    const result = run([day(0, meal({ dish: 'nuts-dish', alternatives: [] }))], {
      allergens: ['nuts'],
    });

    expect(result.meals[0]!.dishId).toBeNull();
    expect(result.warnings[0]).toMatchObject({ kind: 'allergen_violation', slug: 'nuts-dish' });
  });

  test('never offers a substitute carrying an allergen the client has', () => {
    const result = run([day(0, meal())], { allergens: ['nuts'] });

    expect(result.meals[0]!.dishId).toBe('dish-mujaddara');
    expect(result.meals[0]!.options.map((option) => option.slug)).not.toContain('nuts-dish');
  });

  test('drops a dish that is not for this kind of slot', () => {
    const result = run([day(0, meal({ dish: 'breakfast-only', alternatives: [] }))]);

    expect(result.meals[0]!.dishId).toBeNull();
    expect(result.warnings[0]).toMatchObject({ kind: 'wrong_meal_type', slug: 'breakfast-only' });
  });
});

describe('reconcile — the schedule is the source of truth', () => {
  test('a day the model omitted becomes empty slots, not a missing day', () => {
    const result = run([day(0)], { requestDays: [0, 1] });

    expect(result.meals).toHaveLength(2);
    expect(result.meals[1]).toMatchObject({ dayOfWeek: 1, slotKey: 'lunch', dishId: null });
    expect(result.unfilled).toBe(1);
    expect(result.warnings).toEqual([{ kind: 'missing_meal', dayOfWeek: 1, slotKey: 'lunch' }]);
  });

  test('a slot the model omitted becomes an empty meal', () => {
    const result = run([day(0, null)]);

    expect(result.meals).toHaveLength(1);
    expect(result.meals[0]!.dishId).toBeNull();
    expect(result.warnings).toEqual([{ kind: 'missing_meal', dayOfWeek: 0, slotKey: 'lunch' }]);
  });

  test('a day returned twice keeps the first and reports the rest', () => {
    const result = run([day(0, meal({ dish: 'mujaddara' })), day(0, meal({ dish: 'fasolia' }))]);

    expect(result.meals[0]!.dishId).toBe('dish-mujaddara');
    expect(result.warnings).toEqual([{ kind: 'duplicate_meal', dayOfWeek: 0, slotKey: 'lunch' }]);
  });

  test('meals come back in schedule order regardless of the response order', () => {
    const budgets = [
      { slotKey: 'breakfast', label: 'فطور', timeOfDay: '07:30', kcal: 380 },
      { slotKey: 'lunch', label: 'غداء', timeOfDay: '14:00', kcal: 620 },
    ];

    const result = reconcile({
      plan: parseGeneratedPlan(
        {
          days: [
            {
              dayOfWeek: 0,
              lunch: meal({ dish: 'mujaddara', alternatives: [] }),
              breakfast: meal({ dish: 'breakfast-only', alternatives: [] }),
            },
          ],
        },
        ['breakfast', 'lunch'],
      ),
      days: [0],
      budgets,
      catalog: CATALOG,
      allergens: [],
    });

    expect(result.meals.map((entry) => entry.slotKey)).toEqual(['breakfast', 'lunch']);
    expect(result.meals.map((entry) => entry.sortOrder)).toEqual([0, 1]);
    expect(result.meals.map((entry) => entry.budgetKcal)).toEqual([380, 620]);
  });
});

describe('reconcile — rationale', () => {
  test('an empty rationale becomes null', () => {
    const result = run([day(0, meal({ rationaleAr: '   ' }))]);

    expect(result.meals[0]!.rationaleAr).toBeNull();
  });

  test('an over-long rationale is truncated, not rejected', () => {
    const result = run([day(0, meal({ rationaleAr: 'ا'.repeat(500) }))]);

    const rationale = result.meals[0]!.rationaleAr!;
    expect(rationale.length).toBeLessThanOrEqual(240);
    expect(rationale.endsWith('…')).toBe(true);
    // The dish choice survived — that is the part that mattered.
    expect(result.meals[0]!.dishId).toBe('dish-mujaddara');
  });
});

describe('parseGeneratedPlan', () => {
  test('keys meals by slot and flattens to the canonical shape', () => {
    const parsed = parseGeneratedPlan(
      { days: [{ dayOfWeek: 3, breakfast: meal({ dish: 'breakfast-only' }), lunch: meal() }] },
      ['breakfast', 'lunch'],
    );

    expect(parsed.days).toHaveLength(1);
    expect(parsed.days[0]!.dayOfWeek).toBe(3);
    expect(parsed.days[0]!.meals.map((entry) => entry.slotKey)).toEqual(['breakfast', 'lunch']);
  });

  test('strips a slot the client schedule does not have', () => {
    const parsed = parseGeneratedPlan(
      { days: [{ dayOfWeek: 0, lunch: meal(), midnight_feast: meal() }] },
      ['lunch'],
    );

    expect(parsed.days[0]!.meals.map((entry) => entry.slotKey)).toEqual(['lunch']);
  });

  test('rejects a response with no days at all', () => {
    expect(() => parseGeneratedPlan({ days: [] }, ['lunch'])).toThrow();
  });

  test('rejects servings outside the legal range', () => {
    expect(() => parseGeneratedPlan({ days: [day(0, meal({ servings: 9 }))] }, ['lunch'])).toThrow();
  });

  test('reads the week summary beside the days', () => {
    const parsed = parseGeneratedPlan(
      {
        summaryAr: 'أسبوع أخف في الكربوهيدرات مع سمك مرتين.',
        days: [{ dayOfWeek: 0, lunch: { dish: 'mujaddara', servings: 1 } }],
      },
      ['lunch'],
    );

    expect(parsed.summaryAr).toBe('أسبوع أخف في الكربوهيدرات مع سمك مرتين.');
  });

  test('defaults a missing rationale and a missing summary rather than failing', () => {
    const parsed = parseGeneratedPlan(
      { days: [{ dayOfWeek: 0, lunch: { dish: 'mujaddara', servings: 1 } }] },
      ['lunch'],
    );

    expect(parsed.days[0]!.meals[0]!.rationaleAr).toBe('');
    expect(parsed.summaryAr).toBe('');
  });
});
