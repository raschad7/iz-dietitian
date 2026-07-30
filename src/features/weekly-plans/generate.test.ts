import { describe, expect, test } from 'bun:test';

import { reconcile, type CatalogDish } from './generate';
import { parseGeneratedPlan } from './schema';

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
    tags: ['cheap'],
    allergenTags: [],
    baseKcal: 620,
    baseProtein: 22,
  },
  {
    id: 'dish-fasolia',
    slug: 'fasolia',
    nameAr: 'فاصولياء',
    mealTypes: ['lunch', 'dinner'],
    tags: ['cheap'],
    allergenTags: [],
    baseKcal: 600,
    baseProtein: 20,
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
  options: { allergens?: string[]; requestDays?: number[] } = {},
) {
  return reconcile({
    plan: parseGeneratedPlan({ days }, ['lunch']),
    days: options.requestDays ?? [0],
    budgets: BUDGETS,
    catalog: CATALOG,
    allergens: options.allergens ?? [],
  });
}

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

  test('resolves alternatives and marks whether each is a real substitute', () => {
    const result = run([
      day(
        0,
        meal({
          alternatives: [
            { dish: 'fasolia', servings: 1 },
            { dish: 'tiny-lunch', servings: 1 },
          ],
        }),
      ),
    ]);

    const options = result.meals[0]!.options;

    expect(options.map((option) => option.slug)).toEqual(['fasolia', 'tiny-lunch']);
    // 600 kcal against a 620 budget is within 15%.
    expect(options[0]!.isSimilar).toBe(true);
    // 120 kcal at one serving is not, so it is offered but flagged.
    expect(options[1]!.isSimilar).toBe(false);
  });

  test('snaps servings to a legal quarter step', () => {
    const result = run([day(0, meal({ servings: 1.13 }))]);

    expect(result.meals[0]!.servings).toBe(1.25);
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

  test('drops an allergen violation hiding in the alternatives', () => {
    const result = run(
      [
        day(
          0,
          meal({
            alternatives: [
              { dish: 'nuts-dish', servings: 1 },
              { dish: 'fasolia', servings: 1 },
            ],
          }),
        ),
      ],
      { allergens: ['nuts'] },
    );

    // The meal itself survives; only the offending option is removed.
    expect(result.meals[0]!.dishId).toBe('dish-mujaddara');
    expect(result.meals[0]!.options.map((option) => option.slug)).toEqual(['fasolia']);
    expect(result.warnings[0]).toMatchObject({ kind: 'allergen_violation', slug: 'nuts-dish' });
  });

  test('drops a dish that is not for this kind of slot', () => {
    const result = run([day(0, meal({ dish: 'breakfast-only', alternatives: [] }))]);

    expect(result.meals[0]!.dishId).toBeNull();
    expect(result.warnings[0]).toMatchObject({ kind: 'wrong_meal_type', slug: 'breakfast-only' });
  });

  test('ignores the chosen dish repeated as its own alternative', () => {
    const result = run([
      day(
        0,
        meal({
          alternatives: [
            { dish: 'mujaddara', servings: 1 },
            { dish: 'fasolia', servings: 1 },
          ],
        }),
      ),
    ]);

    expect(result.meals[0]!.options.map((option) => option.slug)).toEqual(['fasolia']);
  });

  test('ignores the same alternative offered twice', () => {
    const result = run([
      day(
        0,
        meal({
          alternatives: [
            { dish: 'fasolia', servings: 1 },
            { dish: 'fasolia', servings: 2 },
          ],
        }),
      ),
    ]);

    expect(result.meals[0]!.options).toHaveLength(1);
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

  test('rejects more than three alternatives', () => {
    const tooMany = meal({
      alternatives: [
        { dish: 'a', servings: 1 },
        { dish: 'b', servings: 1 },
        { dish: 'c', servings: 1 },
        { dish: 'd', servings: 1 },
      ],
    });

    expect(() => parseGeneratedPlan({ days: [day(0, tooMany)] }, ['lunch'])).toThrow();
  });

  test('defaults a missing rationale and alternatives rather than failing', () => {
    const parsed = parseGeneratedPlan(
      { days: [{ dayOfWeek: 0, lunch: { dish: 'mujaddara', servings: 1 } }] },
      ['lunch'],
    );

    expect(parsed.days[0]!.meals[0]!.rationaleAr).toBe('');
    expect(parsed.days[0]!.meals[0]!.alternatives).toEqual([]);
  });
});
