/**
 * Builds what is sent to the model, and nothing else.
 *
 * Pure by design. This is the one function in the feature whose output leaves the
 * building, so it must be assertable without a network, a database, or a running
 * app — `prompt.test.ts` checks that no name, email, phone, or id appears in the
 * payload, and a privacy regression is therefore a red test rather than a
 * discovery.
 *
 * Two rules shape everything here:
 *
 *  1. **The client is described, never identified.** Age, sex, and measurements
 *     are what a plan depends on. A name is not.
 *  2. **The catalog is filtered before it is described.** A dish the client is
 *     allergic to is absent from the payload, so no instruction has to be obeyed
 *     for the allergy to be respected.
 */

import type { SlotBudget } from './targets';
import { MAX_RATIONALE_LENGTH, mealTypeForSlot, type GenerationScope } from './schema';
import { MAX_SERVINGS, MIN_SERVINGS, SERVING_STEP } from './similar';

/** A catalog entry, as the model sees it. */
export type PromptDish = {
  slug: string;
  nameAr: string;
  mealTypes: readonly string[];
  /** The **practical** tags only (cost, effort, cuisine). Nutrition is never in here. */
  tags: readonly string[];
  /** Energy for one base serving, rounded — three significant figures is generous here. */
  baseKcal: number;
  baseProtein: number;
  /**
   * The **computed** nutrition label (`high_protein` | `high_carb` | `high_fat` |
   * `balanced`), derived server-side from the recipe. Given to the model so it
   * never has to guess whether a dish is high-protein — kept as its own field,
   * distinct from the practical `tags`, so the two kinds of metadata stay
   * separate on the wire exactly as they are in the data.
   */
  nutritionCategory: string;
  /**
   * What the dish's protein is and what it is eaten with, derived from the recipe
   * by `dish-composition.ts`.
   *
   * The model used to see a name and a calorie count, which is why it could put
   * chickpeas in eight meals of a week while obeying every rule it was given: the
   * repetition a person notices is in the ingredients, and the ingredients were
   * not on the wire.
   */
  proteinSource: string;
  carbBase: string;
};

export type PromptClient = {
  age: number | null;
  sex: string | null;
  heightCm: number | null;
  weightKg: number | null;
  bmi: number | null;
  bmiCategory: string | null;
  activityLevel: string | null;
  goal: string | null;
  dailyKcalTarget: number;
  proteinTargetGrams: number | null;
  allergies: string | null;
  preferences: string | null;
  dislikes: string | null;
  permanentInstructions: string | null;
};

export type PromptInput = {
  client: PromptClient;
  /** Slots with their calorie budgets, already normalised by `slotBudgets`. */
  budgets: readonly SlotBudget[];
  /** Allergen-filtered and active only. */
  catalog: readonly PromptDish[];
  /** This week's note from the dietitian. */
  instruction: string | null;
  /** Dish slugs used in the previous plan, so the model can vary deliberately. */
  previousSlugs: readonly string[];
  /** Which days to produce. One entry for a single-day regeneration. */
  days: readonly number[];
  scope: GenerationScope;
};

export type PromptPayload = {
  system: string;
  user: string;
  /** The JSON schema the API is asked to enforce. */
  jsonSchema: Record<string, unknown>;
};

const DAY_NAMES_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function dayNameAr(dayOfWeek: number): string {
  return DAY_NAMES_AR[dayOfWeek] ?? DAY_NAMES_AR[0]!;
}

/**
 * The system prompt.
 *
 * Written as constraints rather than encouragement. "Do not invent nutrition
 * values" is not in here, because the model has no way to state one — the schema
 * only accepts a slug and a multiplier. Prompts should not ask for guarantees the
 * data model already provides; it wastes tokens and implies the guarantee is soft.
 */
function buildSystem(): string {
  return [
    'You are a clinical dietitian planning weekly meals for a Palestinian client in Hebron.',
    '',
    'Rules:',
    '- Choose meals ONLY from the provided dish catalog, by slug. There are no other dishes.',
    '- Every requested day must appear, and every slot in a day must be filled.',
    '- Match each slot to its calorie budget as closely as the catalog allows. Prefer a dish whose base energy is near the budget over a small dish eaten several times over: portions are set afterwards by arithmetic, they are capped at what a person serves, and a 90 kcal snack cannot be stretched to fill a 250 kcal slot.',
    `- servings is a hint only, and is recomputed. Give a multiple of ${SERVING_STEP} between ${MIN_SERVINGS} and ${MAX_SERVINGS}.`,
    '- Aim at the daily protein target as well as the calorie target. Protein comes from the dishes you choose; nothing downstream can add it.',
    '',
    'Variety, which is what makes a plan look like food rather than output:',
    '- Never the same dish twice in one day, and no more than twice in the week.',
    '- Never the same protein_source twice in one day. Chicken at lunch and chicken at dinner is one meal served twice.',
    '- No protein_source more than three times in the week, and use at least four different ones.',
    '- Include fish at least twice in a week where the catalog allows it.',
    '- Vary carb_base across the day and the week; not rice at every lunch.',
    '- A day needs a shape: something warm and cooked at lunch or dinner, not two cold salads.',
    '- Do not repeat the same dish in the same slot on consecutive days.',
    '',
    'Honour the dietitian instructions and the client dislikes. Instructions outrank variety.',
    '',
    `- rationaleAr: ONE short sentence in Arabic (under ${MAX_RATIONALE_LENGTH} characters) saying why this dish suits this client. Plain, concrete, no marketing language.`,
    '- summaryAr: two or three sentences of Arabic describing THIS week as a whole — what it is built around, what makes it different from an ordinary week, and anything the dietitian asked for that shaped it. It is read in a list beside other weeks, so it must say what distinguishes this one. Never mention calories or the client by name.',
    '',
    'The catalog already excludes anything the client is allergic to. Choose freely within it.',
  ].join('\n');
}

/** Only the fields that were actually recorded, so absence reads as absence. */
function describeClient(client: PromptClient): string {
  const lines: string[] = [];

  if (client.age !== null) lines.push(`- Age: ${client.age}`);
  if (client.sex) lines.push(`- Sex: ${client.sex}`);
  if (client.heightCm !== null) lines.push(`- Height: ${client.heightCm} cm`);
  if (client.weightKg !== null) lines.push(`- Weight: ${client.weightKg} kg`);
  if (client.bmi !== null) {
    lines.push(`- BMI: ${client.bmi.toFixed(1)}${client.bmiCategory ? ` (${client.bmiCategory})` : ''}`);
  }
  if (client.activityLevel) lines.push(`- Activity level: ${client.activityLevel}`);
  if (client.goal) lines.push(`- Goal: ${client.goal}`);

  lines.push(`- Daily calorie target: ${client.dailyKcalTarget} kcal`);
  if (client.proteinTargetGrams !== null) {
    lines.push(`- Daily protein target: ${client.proteinTargetGrams} g`);
  }

  if (client.allergies) lines.push(`- Allergies (already excluded from catalog): ${client.allergies}`);
  if (client.preferences) lines.push(`- Preferences: ${client.preferences}`);
  if (client.dislikes) lines.push(`- Dislikes, avoid these: ${client.dislikes}`);
  if (client.permanentInstructions) {
    lines.push(`- Standing clinical instructions: ${client.permanentInstructions}`);
  }

  return lines.join('\n');
}

/**
 * The catalog, one dish per line.
 *
 * Tab-separated rather than JSON: the same information at roughly a third of the
 * tokens, and the model has no trouble with a table. At ~76 dishes this is the
 * bulk of the prompt, so the format matters.
 */
function describeCatalog(catalog: readonly PromptDish[]): string {
  const rows = catalog.map((dish) =>
    [
      dish.slug,
      dish.nameAr,
      dish.mealTypes.join('|'),
      dish.tags.join('|'),
      `${Math.round(dish.baseKcal)}kcal`,
      `${Math.round(dish.baseProtein)}g`,
      dish.nutritionCategory,
      dish.proteinSource,
      dish.carbBase,
    ].join('\t'),
  );

  return [
    'slug\tname\tmeal_types\ttags\tbase_kcal\tbase_protein\tnutrition\tprotein_source\tcarb_base',
    ...rows,
  ].join('\n');
}

function describeBudgets(budgets: readonly SlotBudget[]): string {
  return budgets
    .map((slot) => `- ${slot.slotKey} ("${slot.label}", ${slot.timeOfDay}): ${slot.kcal} kcal`)
    .join('\n');
}

export function buildPrompt(input: PromptInput): PromptPayload {
  const { client, budgets, catalog, instruction, previousSlugs, days } = input;

  const sections: string[] = [
    '## Client',
    describeClient(client),
    '',
    '## Meal slots and calorie budgets',
    describeBudgets(budgets),
    '',
    '## Dish catalog',
    describeCatalog(catalog),
  ];

  if (previousSlugs.length) {
    sections.push(
      '',
      '## Last week',
      `These dishes were used last week — prefer different ones where the budget allows: ${previousSlugs.join(', ')}`,
    );
  }

  if (instruction) {
    sections.push('', '## Dietitian instructions for this week', instruction);
  }

  sections.push(
    '',
    '## Task',
    `Produce a plan for these days: ${days.map((day) => `${day} (${dayNameAr(day)})`).join(', ')}.`,
    `Each day must contain exactly these slots: ${budgets.map((slot) => slot.slotKey).join(', ')}.`,
  );

  return {
    system: buildSystem(),
    user: sections.join('\n'),
    jsonSchema: buildJsonSchema(catalog, budgets, days),
  };
}

/**
 * Raised when a slot has nothing in the catalog that could fill it.
 *
 * An empty `enum` is not valid JSON Schema, and a slot with no candidates cannot be
 * planned anyway — so this fails before the request rather than producing a plan
 * with a hole in it. Usually means the allergen filter removed every breakfast
 * dish, which the UI reports as a catalog problem, not a generation failure.
 */
export class EmptySlotCatalogError extends Error {
  constructor(readonly slotKey: string) {
    super(`No catalog dishes are available for the "${slotKey}" slot.`);
    this.name = 'EmptySlotCatalogError';
  }
}

/**
 * The JSON schema handed to the API.
 *
 * A day is an object keyed by slot, not a list of meals. That buys four guarantees
 * from the provider rather than from the prompt: every slot is present (`required`),
 * no slot appears twice (object keys), no slot is invented
 * (`additionalProperties: false`), and — because each slot's `dish` enum lists only
 * the dishes valid for that meal type — a breakfast dish cannot land at lunch.
 *
 * Strict mode forbids optional properties, so `rationaleAr` and `alternatives` are
 * required and may be empty rather than absent.
 */
function buildJsonSchema(
  catalog: readonly PromptDish[],
  budgets: readonly SlotBudget[],
  days: readonly number[],
): Record<string, unknown> {
  const mealForSlot = (slotKey: string) => {
    const slugs = catalog
      .filter((dish) => dish.mealTypes.includes(mealTypeForSlot(slotKey)))
      .map((dish) => dish.slug);

    if (!slugs.length) throw new EmptySlotCatalogError(slotKey);

    const dish = { type: 'string', enum: slugs };

    return {
      type: 'object',
      additionalProperties: false,
      properties: {
        dish,
        servings: { type: 'number' },
        rationaleAr: { type: 'string' },
      },
      required: ['dish', 'servings', 'rationaleAr'],
    };
  };

  const slotProperties = Object.fromEntries(
    budgets.map((slot) => [slot.slotKey, mealForSlot(slot.slotKey)]),
  );

  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      summaryAr: { type: 'string' },
      days: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            dayOfWeek: { type: 'integer', enum: [...days] },
            ...slotProperties,
          },
          required: ['dayOfWeek', ...budgets.map((slot) => slot.slotKey)],
        },
      },
    },
    required: ['summaryAr', 'days'],
  };
}
