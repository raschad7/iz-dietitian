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

import { clinicalRules } from './clinical';
import type { SlotBudget } from './targets';
import { MAX_RATIONALE_LENGTH, mealTypeForSlot, type GenerationScope } from './schema';
import { MAX_SERVINGS, MIN_SERVINGS, SERVING_STEP } from './similar';

/** At most two things beside a main. A third is a buffet, not a plate. */
export const MAX_SIDES = 2;

/** A catalog entry, as the model sees it. */
export type PromptDish = {
  slug: string;
  nameAr: string;
  mealTypes: readonly string[];
  /** Energy for one base serving, rounded — three significant figures is generous here. */
  baseKcal: number;
  baseProtein: number;
  /**
   * Carbohydrate and sodium for one base serving.
   *
   * These exist because of a contradiction the audit found: the prompt tells a
   * type 2 diabetic's plan to "keep each meal's carbohydrate moderate and steady"
   * and told a hypertensive's to "avoid salty, processed, canned and pickled
   * food" — while the catalogue on the wire carried neither number. The model was
   * being asked to control quantities it could not see, with only the coarse
   * `nutritionCategory` label to go on.
   *
   * They also give `narrowToPattern` something real to filter a ketogenic week on:
   * a fattoush swimming in olive oil is `high_fat` by energy share and forty grams
   * of carbohydrate by weight, and only the second number is the one that matters.
   */
  baseCarbs: number;
  baseSodium: number;
  /**
   * The **computed** nutrition label (`high_protein` | `high_carb` | `high_fat` |
   * `balanced`), derived server-side from the recipe. Given to the model so it
   * never has to guess whether a dish is high-protein — kept as its own field,
   * distinct from the declared axes below, so the two kinds of metadata stay
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
  /**
   * The four declared axes — see `docs/catalog.md`.
   *
   * `source` is the one that changes what the model can do: until it existed, a
   * plan silently assumed every client goes home and cooks, and "he buys lunch
   * near work" was an instruction with nothing to resolve against.
   */
  source: string;
  effort: string;
  cost: string;
  occasion: string;
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
  /**
   * The ticked clinical conditions and the prescribed pattern, as keys — see
   * `CLINICAL_CONDITIONS` and `DIET_PATTERNS`.
   *
   * Keys and not sentences, so the sentence the model is given lives in one
   * place (`clinical.ts`) rather than being composed by whichever query built
   * this. The prompt test asserts on the sentences, which is what makes a
   * changed rule visible in review.
   *
   * A condition is not identifying: "pregnant, third trimester" describes a
   * clinical situation the plan depends on, exactly as an allergy does, and the
   * payload still carries no name, no date of birth and no id.
   */
  clinicalTags: readonly string[];
  dietPattern: string | null;
};

/**
 * A week that already exists, handed back for a second opinion.
 *
 * ## Why there is a second pass at all
 *
 * The first pass answers "which dish goes in this slot", which is a constrained
 * choice from an enum and something a model does well. What it cannot do in the
 * same breath is stand back and read the finished week — whether Thursday has a
 * shape, whether the carbohydrate holds steady across seven days, whether a bowl
 * of tabbouleh is a dinner. Those are judgements about the whole document, and
 * they are only available once the document exists.
 *
 * Measured on the audited weeks, a second pass lifted protein delivery from 82%
 * of target to 87% and pulled a diabetic week's carbohydrate range from
 * 104–256 g down to 116–144 g — the steadiness that matters most for that
 * client and that no arithmetic rule in this codebase expresses.
 *
 * It is a *correction*, not a regeneration: the same schema, the same catalogue,
 * the same reconciliation afterwards. So everything the first pass guarantees
 * still holds — a dish outside the catalogue is unrepresentable, allergens are
 * already filtered, portions are still arithmetic.
 */
export type PromptDraft = {
  days: readonly {
    dayOfWeek: number;
    kcal: number;
    protein: number;
    carbs: number;
    meals: readonly {
      slotKey: string;
      slug: string;
      kcal: number;
      budgetKcal: number;
      protein: number;
    }[];
  }[];
  /**
   * What the arithmetic checks found, so the model does not spend its answer
   * rediscovering countable things — the same division of labour as `review.ts`.
   */
  findings: readonly string[];
};

export type PromptInput = {
  client: PromptClient;
  /** Slots with their calorie budgets, already normalised by `slotBudgets`. */
  budgets: readonly SlotBudget[];
  /** Allergen-filtered and active only. Mains — never a side. */
  catalog: readonly PromptDish[];
  /**
   * What may be put *beside* a meal: صحن سلطة، كوب شوربة، كوب لبن.
   *
   * A separate list rather than a flag inside `catalog`, because the model is
   * answering a different question about them. A main is chosen against a budget;
   * a side is chosen to complete a plate, always at one serving, and it may never
   * be the meal itself.
   */
  sides: readonly PromptDish[];
  /** This week's note from the dietitian. */
  instruction: string | null;
  /** Dish slugs used in the previous plan, so the model can vary deliberately. */
  previousSlugs: readonly string[];
  /** Which days to produce. One entry for a single-day regeneration. */
  days: readonly number[];
  scope: GenerationScope;
  /**
   * Present for a refinement pass. The payload then asks for the draft to be
   * corrected rather than for a week to be planned, and everything else — the
   * client, the catalogue, the schema — is identical.
   */
  draft?: PromptDraft | null;
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
/**
 * The system prompt for the second pass.
 *
 * Written as a correction brief rather than a planning brief, and ordered by what
 * the audit found actually goes wrong. Protein is first because it is the
 * commonest failure and the one that matters most for a client in a deficit; it
 * used to be a single line in the planning prompt while variety had eight.
 *
 * The last rule is the one a real dietitian's own week taught. Hers repeats the
 * same bread in six of seven breakfasts and uses dairy in twelve of thirty-five
 * meals, and she is not being lazy — she holds the staples steady so the week is
 * shoppable, and varies the centre of the plate. A model told simply to "add
 * variety" will do the opposite, and take the labneh out of the breakfast.
 */
function buildRefineSystem(): string {
  return [
    'You are a senior clinical dietitian in Hebron, correcting a DRAFT weekly plan that software produced for one of your clients.',
    'Return the corrected week in the same format: a dish slug and a servings hint for every slot of every day.',
    '',
    'Most of the draft is probably fine. Keep what works and change a meal only where there is a reason — a week you rewrite entirely is a week you have not read.',
    '',
    'Correct these, in this order:',
    '',
    '1. PROTEIN. Every day must land within 15% of the daily protein target, and usually the draft is UNDER it — that is the commonest failure here, and you must not fix anything else by taking protein out of a meal.',
    '   BUT read the clinical rules first. Where a condition has LOWERED the target — chronic kidney disease above all — the number is a CEILING and not a goal, and a day over it is the error to correct. The checks below will say so explicitly when that is the case.',
    '2. STEADY MACROS. Carbohydrate should not double from the start of the week to the end. For a diabetic client this matters more than any single day being perfect.',
    '3. THE CLINICAL RULES above govern. A sweet in a diabetic week, a salty dish in a hypertensive one, or bread in a low-carbohydrate one is a correction that outranks everything below.',
    '4. OCCASION. Festive and Ramadan dishes belong only in a festive or Ramadan week.',
    '5. SOURCE. Plan home cooking unless the client was said to eat out, and then only on the days named.',
    '6. DAY SHAPE. Something warm and cooked at lunch or dinner; not two cold salads in one day. A salad or a mezze is not a main course — a bowl of tabbouleh is not a dinner.',
    '7. THE PLATE FITS THE SLOT. A snack is a snack. Do not put a full plate in a 150 kcal slot or a piece of fruit in a 500 kcal one.',
    '',
    'On variety, which is where these drafts most often go wrong in the other direction:',
    '- Vary the CENTRE OF THE PLATE — the protein and the main dish at lunch and dinner. That is the repetition a client notices.',
    '- Do NOT chase variety in the staples. Bread, labneh, eggs, cheese, yogurt, salad and vegetables repeat through a real week and should. A dietitian holds them steady on purpose, so the week is shoppable and the client learns it.',
    '- Never repeat the same main dish on consecutive days in the same slot.',
    '',
    'Choose ONLY from the catalogue below, by slug. Portions are recomputed afterwards by arithmetic, so servings is a hint.',
    '',
    'summaryAr — 2 to 4 short notes in Arabic for the dietitian, one per line, each starting with "- ". Say what you changed and why, naming the day and the meal. If you changed little, say that instead of inventing notes.',
  ].join('\n');
}

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
    '- `source` says where the client gets a dish: home, street, restaurant or shop. Plan home cooking unless the instruction says they eat out, then use that many street or restaurant meals and no more.',
    '- Respect `effort` and `cost` when the instruction asks for them. A client who cooks only at the weekend cannot be given four `long` dishes on weekdays.',
    '- `occasion` says when a dish belongs. Use `ramadan` and `festive` dishes ONLY when the instruction says the week is Ramadan or a holiday; an ordinary week is `everyday` and `family`. A كنافة on a Tuesday afternoon is the mistake this rule exists to prevent.',
    '',
    'Sides — what stands beside the main:',
    '- A side is optional. Roughly half to two thirds of lunches and dinners carry one; the rest are the plate on its own. A salad on all fourteen is not how anyone eats, and it is not a plan — it is a default.',
    '- NEVER the same side twice in one day, and no side more than twice in the week. The catalog holds several salads and several soups: use different ones. Repeating صحن سلطة every day is the single most obvious way a plan looks generated.',
    '- Match the side to the plate. A heavy rice dish takes something raw and sharp; a light dish can take a soup or a cup of yogurt. Do not put a soup and a salad on the same meal unless the main is small.',
    '- Breakfast and snacks rarely need one.',
    '- At most two, and never a side on its own.',
    '- A side is one serving and is NOT counted against the slot budget you were given — that budget is for the main. Choose the main first.',
    '- Do not repeat the same dish in the same slot on consecutive days.',
    '',
    'Honour the dietitian instructions and the client dislikes. Instructions outrank variety.',
    '',
    `- rationaleAr: ONE short sentence in Arabic (under ${MAX_RATIONALE_LENGTH} characters) saying why this dish suits this client. Plain, concrete, no marketing language.`,
    '',
    'summaryAr — NOTES FOR THE DIETITIAN, not a description of the week:',
    '- Write 2 to 4 short notes in Arabic, one per line, each starting with "- ". Nothing else: no heading, no closing sentence.',
    '- Each note must be something the dietitian can ACT ON. A note she cannot do anything with is worse than no note, because she still has to read it.',
    '- Write about: what to confirm with this client before sending the plan; where the week is likely to fail and what to swap if it does; what you did because of their dislikes, allergies or the instruction, and what you could not do; anything about this week that needs watching or asking about at the next visit.',
    '- DO NOT summarise the plan. "A varied week of Palestinian home dishes with different starches" describes what she is already looking at, and tells her nothing she does not know. It is the exact note not to write.',
    '- Be specific: name the day, the meal or the dish you mean. "Thursday lunch is from a restaurant" is a note; "some meals are eaten out" is not.',
    '- Say it plainly, as one colleague to another. No marketing language, no praise for the plan.',
    '- Examples of the register: "- غداء الخميس من مطعم — تأكدي أنه فعلاً يأكل خارج البيت ذلك اليوم." / "- البروتين أقل من الهدف يومي الثلاثاء والجمعة؛ إضافة بيضة على الفطور تسدّ الفرق." / "- تجنبت السمك بناءً على ما ذكرته، فالأوميغا 3 هذا الأسبوع من المكسرات فقط."',
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

  /*
    The clinical block, before the preferences and the dislikes — those are
    about what the client enjoys, and these are about what the week has to do.
    A model reading top to bottom meets the constraint before the taste.
  */
  const clinical = clinicalRules(client.clinicalTags, client.dietPattern);

  if (clinical.pattern) lines.push(`- PRESCRIBED PATTERN — this governs the whole week: ${clinical.pattern}`);
  for (const condition of clinical.conditions) lines.push(`- Clinical: ${condition}`);

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
      `${Math.round(dish.baseKcal)}kcal`,
      `${Math.round(dish.baseProtein)}g`,
      `${Math.round(dish.baseCarbs)}g`,
      `${Math.round(dish.baseSodium)}mg`,
      dish.nutritionCategory,
      dish.proteinSource,
      dish.carbBase,
      dish.source,
      dish.effort,
      dish.cost,
      dish.occasion,
    ].join('\t'),
  );

  return [
    [
      'slug',
      'name',
      'meal_types',
      'base_kcal',
      'base_protein',
      'base_carbs',
      'base_sodium',
      'nutrition',
      'protein_source',
      'carb_base',
      'source',
      'effort',
      'cost',
      'occasion',
    ].join('\t'),
    ...rows,
  ].join('\n');
}

function describeBudgets(budgets: readonly SlotBudget[]): string {
  return budgets
    .map((slot) => `- ${slot.slotKey} ("${slot.label}", ${slot.timeOfDay}): ${slot.kcal} kcal`)
    .join('\n');
}

/**
 * The draft, as the second pass reads it.
 *
 * Compact on purpose: a slug, what the meal came to, and what it was aiming at.
 * The model already has the catalogue, so naming a dish by slug tells it
 * everything else — and rendering thirty-five full recipes would triple the
 * payload to say what one line already says.
 */
function describeDraft(draft: PromptDraft): string {
  const lines: string[] = [];

  for (const day of draft.days) {
    lines.push(
      `Day ${day.dayOfWeek} — ${day.kcal} kcal · protein ${day.protein} g · carbs ${day.carbs} g`,
    );

    for (const meal of day.meals) {
      lines.push(
        `  ${meal.slotKey}: ${meal.slug || '(empty)'} — ${meal.kcal}/${meal.budgetKcal} kcal, ${meal.protein} g protein`,
      );
    }
  }

  return lines.join('\n');
}

export function buildPrompt(input: PromptInput): PromptPayload {
  const { client, budgets, catalog, sides, instruction, previousSlugs, days, draft } = input;

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

  if (sides.length) {
    sections.push(
      '',
      '## Sides',
      'These may be added beside a main, never instead of one. Each is one serving and is not scaled.',
      describeCatalog(sides),
    );
  }

  if (previousSlugs.length) {
    sections.push(
      '',
      '## Last week',
      `These dishes were used last week — prefer different ones where the budget allows: ${previousSlugs.join(', ')}`,
    );
  }

  if (draft) {
    sections.push('', '## The draft to correct', describeDraft(draft));

    if (draft.findings.length) {
      sections.push(
        '',
        '## What the checks already found',
        'These are computed, not opinions. You do not need to repeat them; correct them.',
        ...draft.findings.map((finding) => `- ${finding}`),
      );
    }
  }

  if (instruction) {
    sections.push('', '## Dietitian instructions for this week', instruction);
  }

  sections.push(
    '',
    '## Task',
    draft
      ? `Return the corrected week for these days: ${days.map((day) => `${day} (${dayNameAr(day)})`).join(', ')}.`
      : `Produce a plan for these days: ${days.map((day) => `${day} (${dayNameAr(day)})`).join(', ')}.`,
    `Each day must contain exactly these slots: ${budgets.map((slot) => slot.slotKey).join(', ')}.`,
  );

  return {
    system: draft ? buildRefineSystem() : buildSystem(),
    user: sections.join('\n'),
    jsonSchema: buildJsonSchema(catalog, sides, budgets, days),
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
  sides: readonly PromptDish[],
  budgets: readonly SlotBudget[],
  days: readonly number[],
): Record<string, unknown> {
  const sideSlugs = sides.map((dish) => dish.slug);

  const mealForSlot = (slotKey: string) => {
    const slugs = catalog
      .filter((dish) => dish.mealTypes.includes(mealTypeForSlot(slotKey)))
      .map((dish) => dish.slug);

    if (!slugs.length) throw new EmptySlotCatalogError(slotKey);

    const dish = { type: 'string', enum: slugs };

    // Strict mode has no optional properties, so `sides` is required and may be
    // empty. An enum of the side slugs is what makes "a side is not a meal"
    // unrepresentable rather than merely instructed — with no sides in the
    // catalog the array is typed as never having items at all.
    const sideList = sideSlugs.length
      ? { type: 'array', maxItems: MAX_SIDES, items: { type: 'string', enum: sideSlugs } }
      : { type: 'array', maxItems: 0, items: { type: 'string' } };

    return {
      type: 'object',
      additionalProperties: false,
      properties: {
        dish,
        // Bounded on the wire as well as in the parser. The value is a hint and is
        // recomputed, but a provider that refuses 3.5 is one fewer retry.
        servings: { type: 'number', minimum: MIN_SERVINGS, maximum: MAX_SERVINGS },
        rationaleAr: { type: 'string' },
        sides: sideList,
      },
      required: ['dish', 'servings', 'rationaleAr', 'sides'],
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
