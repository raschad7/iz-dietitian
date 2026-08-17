/**
 * Loads `data/dishes.json` into `dishes` and `dish_ingredients`.
 *
 * Run on its own with `bun run db:seed:dishes`. Requires `foods` to be seeded
 * first — every ingredient resolves to a `foods` row by `fdc_id`.
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

import { inArray, sql } from 'drizzle-orm';

import { db } from '@/db';
import { dishIngredients, dishes, foods, type NewDish } from '@/db/schema';
import { DISH_TAGS, MEAL_TYPES } from '@/features/weekly-plans/schema';
import { isMember } from '@/lib/enum';

const DATASET_PATH = join(dirname(fileURLToPath(import.meta.url)), '../data/dishes.json');

/** `excluded.<column>` — the row PostgreSQL could not insert, inside an upsert. */
function sqlExcluded(column: string) {
  return sql.raw(`excluded.${column}`);
}

type IngredientRecord = {
  fdcId: number;
  grams: number;
  /** The USDA description this fdcId had when the file was written. Asserted, not trusted. */
  note: string;
};

export type DishRecord = {
  slug: string;
  nameAr: string;
  nameEn: string;
  mealTypes: string[];
  tags: string[];
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

    for (const ingredient of dish.ingredients) {
      if (!(ingredient.grams > 0)) {
        problems.push(`${dish.slug}: non-positive grams for fdcId ${ingredient.fdcId}`);
      }
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

export async function seedDishes(): Promise<{ dishes: number; ingredients: number }> {
  let file: string;

  try {
    file = readFileSync(DATASET_PATH, 'utf8');
  } catch {
    throw new Error('data/dishes.json is missing.');
  }

  const records = (JSON.parse(file) as Dataset).dishes;
  if (!records?.length) throw new Error('data/dishes.json contains no dishes');

  validate(records);

  // One query for every food the catalog references, rather than one per
  // ingredient line.
  const fdcIds = [...new Set(records.flatMap((dish) => dish.ingredients.map((i) => i.fdcId)))];

  const foodRows = await db
    .select({ id: foods.id, fdcId: foods.fdcId, description: foods.description })
    .from(foods)
    .where(inArray(foods.fdcId, fdcIds));

  const foodByFdcId = new Map(foodRows.map((row) => [row.fdcId, row]));

  // Resolve everything up front. A dish is only written once every one of its
  // ingredients is known to exist and to be the food the file says it is.
  const mismatches: string[] = [];

  for (const dish of records) {
    for (const ingredient of dish.ingredients) {
      const food = foodByFdcId.get(ingredient.fdcId);

      if (!food) {
        mismatches.push(
          `${dish.slug}: fdcId ${ingredient.fdcId} (${ingredient.note}) is not in the foods table`,
        );
        continue;
      }

      // The note is a human-readable label in the JSON, but it doubles as a
      // checksum: if a re-seed of `foods` ever moved an fdcId to a different
      // food, this is what catches it.
      if (!food.description.startsWith(ingredient.note.slice(0, 24))) {
        mismatches.push(
          `${dish.slug}: fdcId ${ingredient.fdcId} is "${food.description}", file says "${ingredient.note}"`,
        );
      }
    }
  }

  if (mismatches.length) {
    throw new Error(
      `data/dishes.json does not match the foods table. Nothing was written.\n  ${mismatches.join('\n  ')}\n\nIf a food "is not in the foods table", seed foods first: bun run db:seed:foods\nOtherwise the file's note is stale — correct it to the description shown.`,
    );
  }

  const values: NewDish[] = records.map((dish) => ({
    slug: dish.slug,
    nameAr: dish.nameAr,
    nameEn: dish.nameEn,
    mealTypes: dish.mealTypes,
    tags: dish.tags,
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

      return dish.ingredients.map((ingredient, index) => ({
        dishId,
        foodId: foodByFdcId.get(ingredient.fdcId)!.id,
        quantityGrams: ingredient.grams,
        sortOrder: index,
      }));
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
