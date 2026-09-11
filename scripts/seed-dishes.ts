/**
 * Loads `data/dishes.json` into `dishes` and `dish_ingredients`.
 *
 * Run on its own with `bun run db:seed:dishes`. Requires the canonical catalog to
 * be seeded first — every ingredient resolves to a `catalog_foods` row by its
 * `source_ref` (the fdcId `data/dishes.json` authors against).
 *
 * Idempotent by way of `slug`: re-running updates dishes in place, so a weekly
 * plan keeps pointing at the same dish rows. Ingredients are replaced wholesale
 * per dish, because a recipe is a single fact — editing one line in the JSON and
 * getting a half-updated recipe would be worse than either outcome.
 *
 * **Fails loudly, never partially.** An unknown `fdcId`, or a `note` that no
 * longer matches the description USDA publishes for it, aborts the whole seed
 * before anything is written. A dish whose ingredients silently resolved to the
 * wrong food would put wrong numbers in front of a client, which is the one
 * failure this feature cannot have.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { inArray, isNull, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  catalogFoodPortions,
  catalogFoods,
  dishIngredients,
  dishes,
  type NewDish,
} from '@/db/schema';
import {
  DISH_COSTS,
  DISH_EFFORTS,
  DISH_OCCASIONS,
  DISH_SOURCES,
  MEAL_TYPES,
} from '@/features/weekly-plans/schema';
import type { PortionKey } from '@/features/weekly-plans/portion-contract';
import { componentProblems } from '@/features/weekly-plans/dish-components';
import { countLimit } from '@/features/weekly-plans/portion-limits';
import { isMember } from '@/lib/enum';

import { readCatalogDataset } from './seed-catalog-foods';

const DATASET_PATH = join(dirname(fileURLToPath(import.meta.url)), '../data/dishes.json');

/*
 * There is no longer a cap on how many lines of a dish may carry a control.
 *
 * The old rule allowed three, on the reasoning that the point of marking is
 * contrast — and contrast is still the point, but a count was the wrong way to
 * get it. A dish has as many controls as it has separately served parts, which is
 * a fact about the plate rather than a budget: مقلوبة has two, a
 * chicken-rice-salad plate has three, and a mixed grill honestly has four.
 * Capping at three forced an author to lie about the fourth.
 *
 * What keeps a dish readable instead is grouping — the lines cooked together
 * share one control rather than each taking their own — plus `VISIBLE_CONTROLS`
 * in `dish-components.ts`, which is a display decision and lives with the panel
 * that makes it.
 */

/** `excluded.<column>` — the row PostgreSQL could not insert, inside an upsert. */
function sqlExcluded(column: string) {
  return sql.raw(`excluded.${column}`);
}

type IngredientRecord = {
  fdcId: number;
  grams: number;
  /** The USDA description this fdcId had when the file was written. Asserted, not trusted. */
  note: string;
  /**
   * The dish component this line is part of, by its `key` in `components`.
   *
   * Lines sharing one are cooked together and move together: مجدرة's rice,
   * lentils, onion and oil are one served thing and take one control between
   * them. Absent means the line is its own component, which is what every recipe
   * written before this field is.
   */
  component?: string;
  /**
   * Whether a dietitian adjusts this line's component by hand when planning a
   * meal.
   *
   * The chicken and the rice on an assembled plate, not the pine nuts cooked into
   * a maqluba. Only these get a `−/+` on the board. Absent means false, so a dish
   * nobody has marked behaves exactly as every dish did before the field existed.
   *
   * Every line of one `component` must agree: the control moves all of them.
   */
  primary?: boolean;
  /**
   * Written without a number, and never scaled — شرائح خضار beside a breakfast.
   *
   * Its energy is still counted; what it never does is grow because the meal
   * around it did. Absent means false.
   */
  free?: boolean;
  /**
   * The household unit this amount is counted in, by its portion key
   * (`Loaf`, `Piece`, `Cup`).
   *
   * Optional, and absent for most lines: the catalog is authored in grams, and
   * grams are what nutrition is built from either way. It matters on a primary
   * line, because it is the unit the `−/+` steps in — bread by the loaf, eggs by
   * the piece, meat by weight because that is how meat is prescribed.
   */
  unit?: PortionKey;
  /** How many of `unit`. Required with it, meaningless without it. */
  count?: number;
};

export type DishRecord = {
  slug: string;
  nameAr: string;
  nameEn: string;
  mealTypes: string[];
  /** The four declared axes. Required on every dish — see `docs/catalog.md`. */
  source: string;
  effort: string;
  cost: string;
  occasion: string;
  /** A side sits beside a meal rather than being one. */
  isSide: boolean;
  allergenTags: string[];
  baseServingLabel: string;
  /**
   * The dish's separately served parts, where its lines do not each stand alone.
   *
   * Only needed for lines that were cooked together. A plate of chicken, rice and
   * salad declares nothing: each line is already its own component, named by its
   * own food. مجدرة declares one, because "أرز" is not what the client is served.
   */
  components?: ComponentRecord[];
  ingredients: IngredientRecord[];
};

/** A served part of a dish, named for the client. */
type ComponentRecord = {
  /** Stable within this dish, and what an ingredient's `component` refers to. */
  key: string;
  /** What the client is told they are eating — «مجدرة», not «أرز». */
  nameAr: string;
  nameEn: string;
};

type Dataset = { dishes: DishRecord[] };

/**
 * Collects everything wrong with the records, before touching the database.
 *
 * Every one of these would otherwise surface much later as a plan that looks
 * plausible and is wrong — a dish with no ingredients reads as 0 kcal, a
 * duplicate slug means one definition silently wins, and a missing axis is a dish
 * that describes nothing. Returns the problems rather than throwing, so it is
 * unit-testable without a database.
 */
export function validateDishRecords(records: DishRecord[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const dish of records) {
    if (seen.has(dish.slug)) problems.push(`duplicate slug: ${dish.slug}`);
    seen.add(dish.slug);

    if (dish.ingredients.length === 0) problems.push(`${dish.slug}: no ingredients`);
    if (dish.mealTypes.length === 0) problems.push(`${dish.slug}: no mealTypes`);

    for (const mealType of dish.mealTypes) {
      if (!isMember(MEAL_TYPES, mealType)) {
        problems.push(`${dish.slug}: unknown meal type "${mealType}"`);
      }
    }

    // Each of the four axes carries exactly one value, and a missing one is the
    // failure the axes exist to prevent: a dish that describes nothing.
    for (const [axis, allowed, value] of [
      ['source', DISH_SOURCES, dish.source],
      ['effort', DISH_EFFORTS, dish.effort],
      ['cost', DISH_COSTS, dish.cost],
      ['occasion', DISH_OCCASIONS, dish.occasion],
    ] as const) {
      if (value === undefined) problems.push(`${dish.slug}: no ${axis}`);
      else if (!isMember(allowed, value)) {
        problems.push(`${dish.slug}: unknown ${axis} "${value}"`);
      }
    }

    if (typeof dish.isSide !== 'boolean') problems.push(`${dish.slug}: no isSide`);

    for (const ingredient of dish.ingredients) {
      if (!(ingredient.grams > 0)) {
        problems.push(`${dish.slug}: non-positive grams for fdcId ${ingredient.fdcId}`);
      }

      // A unit without a count states nothing, and a count without a unit counts
      // nothing. Either is a half-written line rather than a smaller one.
      if ((ingredient.unit === undefined) !== (ingredient.count === undefined)) {
        problems.push(
          `${dish.slug}: fdcId ${ingredient.fdcId} gives a unit without a count, or the reverse`,
        );
      }

      if (ingredient.count !== undefined && !(ingredient.count > 0)) {
        problems.push(`${dish.slug}: non-positive count for fdcId ${ingredient.fdcId}`);
      }
    }

    problems.push(...componentRecordProblems(dish));
  }

  return problems;
}

/**
 * Everything wrong with one dish's declared components.
 *
 * Grouping decides what a client is told to serve, so a mistake here is not a
 * cosmetic one: a line pointing at a component that was never declared would lose
 * its name on read and quietly become its own control, which is the opposite of
 * what the author asked for.
 *
 * The shared rules — a group needs a name, its lines must agree on it and on
 * whether it is adjustable — live in `dish-components.ts` and are checked here
 * against the same function the clinic editor uses, so the two cannot drift.
 */
function componentRecordProblems(dish: DishRecord): string[] {
  const problems: string[] = [];
  const declared = new Map<string, ComponentRecord>();

  for (const component of dish.components ?? []) {
    if (declared.has(component.key)) {
      problems.push(`${dish.slug}: component "${component.key}" is declared twice`);
      continue;
    }
    declared.set(component.key, component);
  }

  const used = new Set<string>();

  for (const ingredient of dish.ingredients) {
    if (!ingredient.component) continue;

    used.add(ingredient.component);

    if (!declared.has(ingredient.component)) {
      problems.push(
        `${dish.slug}: fdcId ${ingredient.fdcId} is in component "${ingredient.component}", which is not declared`,
      );
    }
  }

  for (const key of declared.keys()) {
    // A component nothing is in describes a part of the plate that is not on it.
    if (!used.has(key)) problems.push(`${dish.slug}: component "${key}" has no ingredients`);
  }

  const lines = dish.ingredients.map((ingredient, index) => {
    const component = ingredient.component ? declared.get(ingredient.component) : undefined;

    return {
      componentKey: ingredient.component ?? null,
      componentNameAr: component?.nameAr ?? null,
      componentNameEn: component?.nameEn ?? null,
      isPrimary: ingredient.primary ?? false,
      quantityGrams: ingredient.grams,
      sortOrder: index,
      // The dataset identifies a food by its USDA id and carries its description
      // rather than its names; both are only ever read back into a message here.
      food: { id: String(ingredient.fdcId), nameAr: ingredient.note, nameEn: ingredient.note },
    };
  });

  problems.push(...componentProblems(lines).map((problem) => `${dish.slug}: ${problem}`));

  return problems;
}

/**
 * Every recipe line written in the unit its food declares.
 *
 * The rule lives on the food (`countedAs`), so a dish cannot decide that this
 * time an egg is 50 grams. Before it existed the same egg appeared as "1 حبة" in
 * one recipe and "50 غ" in another, and a client reading both had no way to know
 * they were the same thing.
 *
 * Only the positive direction is enforced. A food with no declared unit may still
 * be counted where it reads better — بندورة by the slice, بطاطا by the piece —
 * because "there is no one right unit for this" is a real answer.
 *
 * Takes the food dataset rather than reading the database, so it runs in a test.
 */
/**
 * Foods whose own identity implies an allergen, matched on the food's slug.
 *
 * Deliberately narrow. It matches wheat and barley by name and does not try to be
 * clever: a rule that guesses wrongly gets switched off, and a rule that catches
 * the obvious cases stays on. Oats are absent on purpose — they are gluten-free
 * grains that are usually cross-contaminated, and whether a clinic treats them as
 * safe is a decision for the dietitian rather than for a seed script.
 */
const ALLERGEN_BY_FOOD_SLUG: readonly { allergen: string; pattern: RegExp }[] = [
  {
    allergen: 'gluten',
    pattern: /pita|bread|toast|bulgur|freekeh|barley|couscous|pasta|macaroni|spaghetti|noodle|semolina|flour|cracker|kaak|manaqish|wheat/i,
  },
  { allergen: 'sesame', pattern: /sesame|tahini|halva/i },
  { allergen: 'egg', pattern: /^egg(s|-|$)/i },
  { allergen: 'fish', pattern: /^(fish|tuna|sardine|salmon|shrimp|anchovy|mackerel)/i },
];

/**
 * Dishes whose ingredients imply an allergen the dish does not declare.
 *
 * ## Why this exists
 *
 * `loubia-bzeit` carried sixty-four grams of whole-wheat pita and no `gluten`
 * tag. It is also one of the dishes the planner reaches for most, so it landed in
 * a coeliac client's week as «خبز عربي أسمر ٢ رغيف» — two loaves of wheat bread
 * on a plan built to exclude wheat.
 *
 * One missing tag on one row of two hundred and ninety-four, and the whole
 * allergen architecture — filter before the prompt, check again at reconciliation
 * — was defeated by it, because every layer trusts the tag. So the tag is checked
 * against the food itself, here, before anything reaches the database.
 */
export function validateAllergenTags(
  records: readonly DishRecord[],
  foods: readonly { sourceRef: string; slug: string }[],
): string[] {
  const problems: string[] = [];
  const byRef = new Map(foods.map((food) => [food.sourceRef, food]));

  for (const dish of records) {
    const declared = new Set(dish.allergenTags);

    for (const ingredient of dish.ingredients) {
      const food = byRef.get(String(ingredient.fdcId));
      if (!food) continue;

      for (const { allergen, pattern } of ALLERGEN_BY_FOOD_SLUG) {
        if (declared.has(allergen)) continue;
        if (!pattern.test(food.slug)) continue;

        problems.push(
          `${dish.slug}: contains ${food.slug} (${ingredient.grams} g) but does not declare "${allergen}"`,
        );
        // One report per dish and allergen; the fix is the same tag either way.
        declared.add(allergen);
      }
    }
  }

  return problems;
}

export function validateCountingUnits(
  records: readonly DishRecord[],
  foods: readonly { sourceRef: string; slug: string; countedAs?: string }[],
): string[] {
  const problems: string[] = [];
  const byRef = new Map(foods.map((food) => [food.sourceRef, food]));

  for (const dish of records) {
    for (const ingredient of dish.ingredients) {
      const food = byRef.get(String(ingredient.fdcId));
      if (!food?.countedAs) continue;

      if (ingredient.unit !== food.countedAs) {
        problems.push(
          `${dish.slug}: ${food.slug} is always counted in "${food.countedAs}", but this line says ${
            ingredient.unit ? `"${ingredient.unit}"` : `${ingredient.grams} g`
          }`,
        );
      }
    }
  }

  return problems;
}

/**
 * A recipe that is already past what a person eats at one sitting.
 *
 * `portion-limits.ts` is a **ceiling on growth** — it stops a multiplier pushing a
 * line further, and it deliberately never rewrites what an author wrote, because
 * a dietitian's own dish is hers. That contract leaves one hole, and the shipped
 * catalog fell into it: a recipe whose own count is already over the ceiling is
 * never touched by anything, so «فستق حلبي ٤٣ حبة» went out as written.
 *
 * The hole closes here rather than in the portioner, because these numbers are
 * ours and a build is the right place to be told about them.
 */
export function validateRecipeCounts(
  records: readonly DishRecord[],
  foods: readonly { sourceRef: string; slug: string }[],
): string[] {
  const problems: string[] = [];
  const byRef = new Map(foods.map((food) => [food.sourceRef, food]));

  for (const dish of records) {
    for (const ingredient of dish.ingredients) {
      const food = byRef.get(String(ingredient.fdcId));
      if (!food || ingredient.count === undefined) continue;

      const limit = countLimit(food.slug, ingredient.unit as PortionKey | undefined);
      if (limit !== null && ingredient.count > limit) {
        problems.push(
          `${dish.slug}: ${ingredient.count} × ${food.slug} is past the ${limit} a meal may hold`,
        );
      }
    }
  }

  return problems;
}

/**
 * The least protein a plate may carry and still be the day's main meal.
 *
 * Twelve grams is not a target — it is the line below which a 535 kcal lunch has
 * stopped being a meal and become a plate of starch. Hajer's Thursday is the
 * case: eggs at breakfast, walnuts at ten, **لوبيا بالزيت at lunch**, melon at
 * five and كوسا باللبن at eight — five plates, 1,484 kcal, and 53 g of protein
 * against a 96 g target. Nothing in that day was wrong on its own; the lunch was
 * simply not carrying a lunch's share.
 *
 * Only lunch, deliberately. A light dinner beside a proper lunch is how people
 * actually eat, and لوبيا بالزيت *is* a Palestinian dinner — it is being the
 * largest plate of the day that it cannot do.
 */
const MIN_LUNCH_PROTEIN_GRAMS = 12;

/**
 * A main that cannot carry the meal it is offered for.
 *
 * Sides are exempt by definition: a صحن سلطة is not pretending to be the meal.
 * That exemption is the other half of this rule — فتوش and تبولة were `isSide:
 * false` and reachable as dinners, so the planner served a bowl of salad as an
 * evening meal and broke no rule saying so.
 */
export function validateMainProtein(
  records: readonly DishRecord[],
  foods: readonly { sourceRef: string; slug: string; nutrition: Record<string, number | null> }[],
): string[] {
  const byRef = new Map(foods.map((food) => [food.sourceRef, food]));

  return records.flatMap((dish) => {
    if (dish.isSide || !dish.mealTypes.includes('lunch')) return [];

    const protein = dish.ingredients.reduce((total, ingredient) => {
      const food = byRef.get(String(ingredient.fdcId));
      const per100 = food?.nutrition.protein ?? 0;
      return total + (per100 * ingredient.grams) / 100;
    }, 0);

    if (protein >= MIN_LUNCH_PROTEIN_GRAMS) return [];

    return [
      `${dish.slug}: ${protein.toFixed(1)} g of protein is too little for a lunch — ` +
        `give it a protein food, mark it isSide, or offer it at dinner only`,
    ];
  });
}

function validate(records: DishRecord[]): void {
  const foods = readCatalogDataset();
  const problems = [
    ...validateDishRecords(records),
    ...validateCountingUnits(records, foods),
    ...validateAllergenTags(records, foods),
    ...validateRecipeCounts(records, foods),
    ...validateMainProtein(records, foods),
  ];

  if (problems.length) {
    throw new Error(`data/dishes.json is invalid:\n  ${problems.join('\n  ')}`);
  }
}

/**
 * The committed dish dataset, read and validated.
 *
 * Exported so `db:check` can count what a correctly seeded database is *supposed*
 * to hold rather than carrying a hand-copied number that goes stale the next time
 * a dish is added.
 */
export function readDishDataset(path = DATASET_PATH): DishRecord[] {
  let file: string;

  try {
    file = readFileSync(path, 'utf8');
  } catch {
    throw new Error('data/dishes.json is missing.');
  }

  const records = (JSON.parse(file) as Dataset).dishes;
  if (!records?.length) throw new Error('data/dishes.json contains no dishes');

  validate(records);

  return records;
}

export async function seedDishes(): Promise<{ dishes: number; ingredients: number }> {
  const records = readDishDataset();

  /**
   * The canonical catalog row for each fdcId, keyed by `source_ref`.
   *
   * Recipes point at `catalog_foods` only. `data/dishes.json` still authors against
   * fdcIds — they are the stable identifier the notes below are checked against —
   * so this map is the bridge between the two, and the catalog's `source_ref` is
   * what makes it possible without a USDA table in the database.
   */
  const catalogRows = await db
    .select({ id: catalogFoods.id, sourceRef: catalogFoods.sourceRef, nameEn: catalogFoods.nameEn })
    .from(catalogFoods)
    .where(isNull(catalogFoods.clinicId));

  const catalogBySourceRef = new Map(
    catalogRows.filter((row) => row.sourceRef !== null).map((row) => [row.sourceRef!, row]),
  );

  // Resolve everything up front. A dish is only written once every one of its
  // ingredients is known to exist and to be the food the file says it is.
  const mismatches: string[] = [];

  // The dataset's own `note` per fdcId — the USDA description `db:build-catalog`
  // recorded. `data/dishes.json` carries the same note per ingredient, written by
  // hand from the same source, so comparing them is what still catches an fdcId
  // that has moved onto a different food now that no USDA table is in the database.
  const catalogFoodsByRef = new Map(readCatalogDataset().map((food) => [food.sourceRef, food]));
  const noteBySourceRef = new Map(
    // The note assertion is a check that an fdcId still points at the food it
    // pointed at when the recipe was written. A food that is not from USDA has no
    // fdcId to drift, so there is nothing to assert.
    [...catalogFoodsByRef.values()]
      .filter((food) => food.sourceType === 'usda_sr_legacy')
      .map((food) => [food.sourceRef, food.note] as const),
  );

  for (const dish of records) {
    for (const ingredient of dish.ingredients) {
      const key = String(ingredient.fdcId);

      if (!catalogBySourceRef.has(key)) {
        mismatches.push(
          `${dish.slug}: fdcId ${ingredient.fdcId} (${ingredient.note}) has no canonical catalog food`,
        );
        continue;
      }

      const note = noteBySourceRef.get(key);
      if (note !== undefined && !note.startsWith(ingredient.note.slice(0, 24))) {
        mismatches.push(
          `${dish.slug}: fdcId ${ingredient.fdcId} is "${note}", data/dishes.json says "${ingredient.note}"`,
        );
      }
    }
  }

  /**
   * Every portion of every referenced food, keyed by `foodId:key`.
   *
   * Loaded before anything is written so a unit the food does not offer aborts the
   * seed rather than silently landing as `portion_id = null` — which would look
   * like "authored in grams" and quietly cost the line its −/+ step.
   */
  const portionRows = await db
    .select({
      id: catalogFoodPortions.id,
      foodId: catalogFoodPortions.foodId,
      key: catalogFoodPortions.key,
      grams: catalogFoodPortions.grams,
    })
    .from(catalogFoodPortions);

  const portionByKey = new Map(portionRows.map((row) => [`${row.foodId}:${row.key}`, row]));
  const portionIdFor = (foodId: string, unit: string) =>
    portionByKey.get(`${foodId}:${unit}`)?.id ?? null;

  for (const dish of records) {
    for (const ingredient of dish.ingredients) {
      if (!ingredient.unit) continue;

      const row = catalogBySourceRef.get(String(ingredient.fdcId));
      if (!row) continue;

      const portion = portionByKey.get(`${row.id}:${ingredient.unit}`);

      if (!portion) {
        mismatches.push(
          `${dish.slug}: fdcId ${ingredient.fdcId} is counted in "${ingredient.unit}", which that food does not offer`,
        );
        continue;
      }

      // The unit and the grams are two statements of one amount. A drift between
      // them would put one number in the nutrition and a different one on the
      // card, so it fails the seed rather than picking a winner.
      const implied = (ingredient.count ?? 0) * portion.grams;

      if (Math.abs(implied - ingredient.grams) > 0.5) {
        mismatches.push(
          `${dish.slug}: fdcId ${ingredient.fdcId} says ${ingredient.count} × ${ingredient.unit} (${implied} g) but records ${ingredient.grams} g`,
        );
      }
    }
  }

  if (mismatches.length) {
    throw new Error(
      `data/dishes.json does not match the canonical catalog. Nothing was written.\n  ${mismatches.join('\n  ')}\n\nSeed the catalog first: bun run db:seed:catalog --apply\nIf the food is genuinely missing, add it to data/catalog-foods.json and run: bun run db:build-catalog`,
    );
  }

  const values: NewDish[] = records.map((dish) => ({
    slug: dish.slug,
    nameAr: dish.nameAr,
    nameEn: dish.nameEn,
    mealTypes: dish.mealTypes,
    source: dish.source,
    effort: dish.effort,
    cost: dish.cost,
    occasion: dish.occasion,
    isSide: dish.isSide,
    allergenTags: dish.allergenTags,
    baseServingLabel: dish.baseServingLabel,
    isActive: true,
  }));

  let ingredientCount = 0;

  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(dishes)
      .values(values)
      .onConflictDoUpdate({
        target: dishes.slug,
        set: {
          nameAr: sqlExcluded('name_ar'),
          nameEn: sqlExcluded('name_en'),
          mealTypes: sqlExcluded('meal_types'),
          source: sqlExcluded('source'),
          effort: sqlExcluded('effort'),
          cost: sqlExcluded('cost'),
          occasion: sqlExcluded('occasion'),
          isSide: sqlExcluded('is_side'),
          allergenTags: sqlExcluded('allergen_tags'),
          baseServingLabel: sqlExcluded('base_serving_label'),
          isActive: sqlExcluded('is_active'),
          updatedAt: new Date(),
        },
      })
      .returning({ id: dishes.id, slug: dishes.slug });

    const idBySlug = new Map(inserted.map((row) => [row.slug, row.id]));

    // Replace each recipe wholesale. `dish_ingredients` has no natural key to
    // upsert on — an ingredient is identified by its position in a recipe, not by
    // itself — so a diff would be guesswork.
    await tx.delete(dishIngredients).where(
      inArray(
        dishIngredients.dishId,
        inserted.map((row) => row.id),
      ),
    );

    const ingredientValues = records.flatMap((dish) => {
      const dishId = idBySlug.get(dish.slug);
      // Unreachable: every slug was just inserted or updated. Throwing beats
      // writing a recipe onto the wrong dish.
      if (!dishId) throw new Error(`dish ${dish.slug} was not written`);

      const components = new Map((dish.components ?? []).map((one) => [one.key, one]));

      return dish.ingredients.map((ingredient, index) => {
        const foodId = catalogBySourceRef.get(String(ingredient.fdcId))!.id;
        // Validated above: a line naming an undeclared component never gets here.
        const component = ingredient.component ? components.get(ingredient.component) : undefined;

        return {
          dishId,
          catalogFoodId: foodId,
          componentKey: ingredient.component ?? null,
          // Flattened onto the line rather than joined from a table of its own —
          // see `dish_ingredients.component_name_ar` for why, and
          // `componentProblems` for the rule that keeps the copies equal.
          componentNameAr: component?.nameAr ?? null,
          componentNameEn: component?.nameEn ?? null,
          // Grams stay authoritative even where a unit was given: the unit was
          // checked against them above, so the two cannot disagree by the time
          // either is written.
          quantityGrams: ingredient.grams,
          portionId: ingredient.unit ? portionIdFor(foodId, ingredient.unit) : null,
          portionQuantity: ingredient.unit ? (ingredient.count ?? null) : null,
          isPrimary: ingredient.primary ?? false,
          isFree: ingredient.free ?? false,
          sortOrder: index,
        };
      });
    });

    await tx.insert(dishIngredients).values(ingredientValues);
    ingredientCount = ingredientValues.length;
  });

  return { dishes: values.length, ingredients: ingredientCount };
}

if (import.meta.main) {
  const result = await seedDishes();
  console.info(`seeded ${result.dishes} dishes, ${result.ingredients} ingredients`);
  process.exit(0);
}
