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
  DISH_TAGS,
  MEAL_TYPES,
} from '@/features/weekly-plans/schema';
import { isMember } from '@/lib/enum';

import { readCatalogDataset } from './seed-catalog-foods';

const DATASET_PATH = join(dirname(fileURLToPath(import.meta.url)), '../data/dishes.json');

/**
 * How many lines of one dish may carry a control.
 *
 * Three, because the point of marking is contrast. A dish with a control on every
 * line has recreated the problem the marking exists to solve — the two amounts a
 * dietitian actually sets, buried among nine she never touches.
 */
export const MAX_PRIMARY_INGREDIENTS = 3;

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
   * Whether a dietitian adjusts this line by hand when planning a meal.
   *
   * Two or three per dish — the chicken and the rice in a maqluba, not the pine
   * nuts. Only these get a `−/+` on the board. Absent means false, so a dish
   * nobody has marked behaves exactly as every dish did before the field existed.
   */
  primary?: boolean;
  /**
   * The household unit this amount is counted in, by its English portion label
   * (`Loaf`, `Piece`, `Cup`).
   *
   * Optional, and absent for most lines: the catalog is authored in grams, and
   * grams are what nutrition is built from either way. It matters on a primary
   * line, because it is the unit the `−/+` steps in — bread by the loaf, eggs by
   * the piece, meat by weight because that is how meat is prescribed.
   */
  unit?: string;
  /** How many of `unit`. Required with it, meaningless without it. */
  count?: number;
};

export type DishRecord = {
  slug: string;
  nameAr: string;
  nameEn: string;
  mealTypes: string[];
  tags: string[];
  /** The four declared axes. Required on every dish — see `docs/catalog.md`. */
  source: string;
  effort: string;
  cost: string;
  occasion: string;
  /** A side sits beside a meal rather than being one. */
  isSide: boolean;
  allergenTags: string[];
  baseServingLabel: string;
  ingredients: IngredientRecord[];
};

type Dataset = { dishes: DishRecord[] };

/**
 * Collects everything wrong with the records, before touching the database.
 *
 * Every one of these would otherwise surface much later as a plan that looks
 * plausible and is wrong — a dish with no ingredients reads as 0 kcal, a
 * duplicate slug means one definition silently wins, and a **deprecated or
 * unknown tag** (`high_protein`, `diabetic_friendly`, a typo) would let metadata
 * back in that the rest of the app has removed. Returns the problems rather than
 * throwing, so it is unit-testable without a database.
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

    // Only the practical tags survive the taxonomy cleanup; a computed-nutrition
    // tag or a disease tag stored here is a defect, not a value.
    for (const tag of dish.tags) {
      if (!isMember(DISH_TAGS, tag)) {
        problems.push(`${dish.slug}: unknown or deprecated tag "${tag}"`);
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

    // A dish where everything is adjustable has answered the question with
    // "all of it", which is the same as not answering it: the point of marking is
    // that the two or three lines that carry the meal stand out from the rest.
    const primary = dish.ingredients.filter((ingredient) => ingredient.primary).length;
    if (primary > MAX_PRIMARY_INGREDIENTS) {
      problems.push(
        `${dish.slug}: ${primary} primary ingredients, at most ${MAX_PRIMARY_INGREDIENTS} are useful`,
      );
    }
  }

  return problems;
}

function validate(records: DishRecord[]): void {
  const problems = validateDishRecords(records);
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
  const noteBySourceRef = new Map(readCatalogDataset().map((food) => [food.sourceRef, food.note]));

  for (const dish of records) {
    for (const ingredient of dish.ingredients) {
      const key = String(ingredient.fdcId);

      if (!catalogBySourceRef.has(key)) {
        mismatches.push(
          `${dish.slug}: fdcId ${ingredient.fdcId} (${ingredient.note}) has no canonical catalog food`,
        );
        continue;
      }

      const note = noteBySourceRef.get(key) ?? '';
      if (!note.startsWith(ingredient.note.slice(0, 24))) {
        mismatches.push(
          `${dish.slug}: fdcId ${ingredient.fdcId} is "${note}", data/dishes.json says "${ingredient.note}"`,
        );
      }
    }
  }

  /**
   * Every portion of every referenced food, keyed by `foodId:labelEn`.
   *
   * Loaded before anything is written so a unit the food does not offer aborts the
   * seed rather than silently landing as `portion_id = null` — which would look
   * like "authored in grams" and quietly cost the line its −/+ step.
   */
  const portionRows = await db
    .select({
      id: catalogFoodPortions.id,
      foodId: catalogFoodPortions.foodId,
      labelEn: catalogFoodPortions.labelEn,
      grams: catalogFoodPortions.grams,
    })
    .from(catalogFoodPortions);

  const portionByKey = new Map(portionRows.map((row) => [`${row.foodId}:${row.labelEn}`, row]));
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
    tags: dish.tags,
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
          tags: sqlExcluded('tags'),
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

      return dish.ingredients.map((ingredient, index) => {
        const foodId = catalogBySourceRef.get(String(ingredient.fdcId))!.id;

        return {
          dishId,
          catalogFoodId: foodId,
          // Grams stay authoritative even where a unit was given: the unit was
          // checked against them above, so the two cannot disagree by the time
          // either is written.
          quantityGrams: ingredient.grams,
          portionId: ingredient.unit ? portionIdFor(foodId, ingredient.unit) : null,
          portionQuantity: ingredient.unit ? (ingredient.count ?? null) : null,
          isPrimary: ingredient.primary ?? false,
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
