import { describe, expect, test } from 'bun:test';

import { buildPrompt, EmptySlotCatalogError, type PromptDish, type PromptInput } from './prompt';

const CATALOG: PromptDish[] = [
  {
    slug: 'mujaddara-salad',
    nameAr: 'مجدرة مع سلطة خضراء',
    mealTypes: ['lunch', 'dinner'],
    tags: ['economical', 'vegetarian'],
    baseKcal: 618.4,
    baseProtein: 21.7,
    nutritionCategory: 'balanced',
  },
  {
    slug: 'labaneh-zeit-pita',
    nameAr: 'لبنة بزيت الزيتون مع خبز',
    mealTypes: ['breakfast'],
    // Practical tags only — "high protein" is not among them; it rides in the
    // separate nutritionCategory field below, computed from the recipe.
    tags: ['quick'],
    baseKcal: 381.2,
    baseProtein: 18.4,
    nutritionCategory: 'high_protein',
  },
];

const BUDGETS = [
  { slotKey: 'breakfast', label: 'فطور', timeOfDay: '07:30', kcal: 460 },
  { slotKey: 'lunch', label: 'غداء', timeOfDay: '14:00', kcal: 640 },
];

function input(overrides: Partial<PromptInput> = {}): PromptInput {
  return {
    client: {
      age: 40,
      sex: 'female',
      heightCm: 175,
      weightKg: 84,
      bmi: 27.43,
      bmiCategory: 'overweight',
      activityLevel: 'light',
      goal: 'weight_loss',
      dailyKcalTarget: 1850,
      proteinTargetGrams: 134,
      allergies: 'مكسرات',
      preferences: 'يفضل الأكل النباتي',
      dislikes: 'لا يحب السمك',
      permanentInstructions: 'سكري نوع 2 — تجنّب السكريات المضافة',
    },
    budgets: BUDGETS,
    catalog: CATALOG,
    instruction: 'تحضير أسهل وتكلفة أقل',
    previousSlugs: ['fattoush', 'musakhan'],
    days: [0, 1, 2, 3, 4, 5, 6],
    scope: 'week',
    ...overrides,
  };
}

describe('buildPrompt — privacy', () => {
  /**
   * The reason this file exists. The payload describes a client; it must never
   * identify one. A regression here is a data leak to a third party, so it is
   * asserted against the whole serialised payload rather than field by field.
   */
  test('carries no identifying field', () => {
    const payload = buildPrompt(input());
    const serialised = `${payload.system}\n${payload.user}\n${JSON.stringify(payload.jsonSchema)}`;

    const forbidden = [
      'سارة',
      'Sara',
      'rashad@example.com',
      '0599',
      '11111111-1111-1111-1111-111111111111',
    ];

    for (const value of forbidden) {
      expect(serialised).not.toContain(value);
    }
  });

  test('the input type has no name, email, phone or id to pass in', () => {
    const client = input().client;

    expect(client).not.toHaveProperty('fullName');
    expect(client).not.toHaveProperty('email');
    expect(client).not.toHaveProperty('phone');
    expect(client).not.toHaveProperty('id');
    expect(client).not.toHaveProperty('clientId');
  });
});

describe('buildPrompt — content', () => {
  test('describes the clinical facts a plan depends on', () => {
    const { user } = buildPrompt(input());

    expect(user).toContain('Age: 40');
    expect(user).toContain('Height: 175 cm');
    expect(user).toContain('Weight: 84 kg');
    expect(user).toContain('BMI: 27.4 (overweight)');
    expect(user).toContain('Goal: weight_loss');
    expect(user).toContain('Daily calorie target: 1850 kcal');
    expect(user).toContain('Daily protein target: 134 g');
  });

  test('omits unrecorded fields rather than saying null', () => {
    const { user } = buildPrompt(
      input({
        client: {
          ...input().client,
          age: null,
          sex: null,
          bmi: null,
          bmiCategory: null,
          proteinTargetGrams: null,
          preferences: null,
          dislikes: null,
          permanentInstructions: null,
        },
      }),
    );

    expect(user).not.toContain('null');
    expect(user).not.toContain('Age:');
    expect(user).not.toContain('BMI:');
    // The target is not optional — a plan cannot be generated without one.
    expect(user).toContain('Daily calorie target:');
  });

  test('passes dislikes and standing instructions through verbatim', () => {
    const { user } = buildPrompt(input());

    expect(user).toContain('لا يحب السمك');
    expect(user).toContain('سكري نوع 2 — تجنّب السكريات المضافة');
    expect(user).toContain('تحضير أسهل وتكلفة أقل');
  });

  test('lists every slot with its budget', () => {
    const { user } = buildPrompt(input());

    expect(user).toContain('breakfast ("فطور", 07:30): 460 kcal');
    expect(user).toContain('lunch ("غداء", 14:00): 640 kcal');
  });

  test('lists the catalog with rounded energy', () => {
    const { user } = buildPrompt(input());

    expect(user).toContain(
      'mujaddara-salad\tمجدرة مع سلطة خضراء\tlunch|dinner\teconomical|vegetarian\t618kcal\t22g\tbalanced',
    );
  });

  test('keeps practical tags and computed nutrition in separate columns', () => {
    const { user } = buildPrompt(input());

    // The header names both, distinctly.
    expect(user).toContain('slug\tname\tmeal_types\ttags\tbase_kcal\tbase_protein\tnutrition');

    // labaneh is computed high_protein, but "high_protein" is NOT in its tags
    // column — it appears only in the trailing computed-nutrition column.
    expect(user).toContain('labaneh-zeit-pita\tلبنة بزيت الزيتون مع خبز\tbreakfast\tquick\t381kcal\t18g\thigh_protein');
  });

  test('names last week so the model can vary', () => {
    const { user } = buildPrompt(input());

    expect(user).toContain('fattoush, musakhan');
  });

  test('omits the last-week section entirely when there is no previous plan', () => {
    const { user } = buildPrompt(input({ previousSlugs: [] }));

    expect(user).not.toContain('## Last week');
  });

  test('omits the instruction section when the dietitian wrote nothing', () => {
    const { user } = buildPrompt(input({ instruction: null }));

    expect(user).not.toContain('## Dietitian instructions');
  });

  test('names the days requested, so a single-day regeneration asks for one', () => {
    const { user } = buildPrompt(input({ days: [2], scope: 'day' }));

    expect(user).toContain('2 (الثلاثاء)');
    expect(user).not.toContain('0 (الأحد)');
  });
});

describe('buildPrompt — json schema', () => {
  /**
   * This block is the structural half of the AI contract. Each assertion removes a
   * class of failure from the code that would otherwise have to catch it.
   */
  test('each slot only offers dishes valid for its meal type', () => {
    const { jsonSchema } = buildPrompt(input());

    // A breakfast dish at lunch is unrepresentable, not merely discouraged.
    expect(slotSchemaOf(jsonSchema, 'breakfast').properties.dish.enum).toEqual(['labaneh-zeit-pita']);
    expect(slotSchemaOf(jsonSchema, 'lunch').properties.dish.enum).toEqual(['mujaddara-salad']);
  });

  test('alternatives are constrained to the same per-slot dishes', () => {
    const { jsonSchema } = buildPrompt(input());
    const lunch = slotSchemaOf(jsonSchema, 'lunch');

    expect(lunch.properties.alternatives.items.properties.dish.enum).toEqual(['mujaddara-salad']);
  });

  test('a day is keyed by slot, so no slot can be missing or duplicated', () => {
    const { jsonSchema } = buildPrompt(input());
    const day = daySchemaOf(jsonSchema);

    expect(Object.keys(day.properties).sort()).toEqual(['breakfast', 'dayOfWeek', 'lunch']);
    expect(day.required).toEqual(['dayOfWeek', 'breakfast', 'lunch']);
  });

  test('constrains dayOfWeek to the days requested', () => {
    const { jsonSchema } = buildPrompt(input({ days: [3] }));

    expect(daySchemaOf(jsonSchema).properties.dayOfWeek.enum).toEqual([3]);
  });

  test('satisfies strict mode: no additional properties, everything required', () => {
    const { jsonSchema } = buildPrompt(input());
    const day = daySchemaOf(jsonSchema);
    const lunch = slotSchemaOf(jsonSchema, 'lunch');

    expect(jsonSchema.additionalProperties).toBe(false);
    expect(day.additionalProperties).toBe(false);
    expect(lunch.additionalProperties).toBe(false);

    expect(lunch.required).toEqual(['dish', 'servings', 'rationaleAr', 'alternatives']);
    expect(Object.keys(lunch.properties).sort()).toEqual([...lunch.required].sort());
  });

  test('refuses to build a request for a slot the catalog cannot fill', () => {
    // Nothing in this catalog is tagged for snacks, so a snack slot has no
    // candidates — an empty enum is invalid JSON Schema and an unplannable slot.
    expect(() =>
      buildPrompt(
        input({ budgets: [{ slotKey: 'snack_1', label: 'سناك', timeOfDay: '10:30', kcal: 200 }] }),
      ),
    ).toThrow(EmptySlotCatalogError);
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
function daySchemaOf(schema: Record<string, unknown>): any {
  return (schema as any).properties.days.items;
}

function slotSchemaOf(schema: Record<string, unknown>, slotKey: string): any {
  return daySchemaOf(schema).properties[slotKey];
}
