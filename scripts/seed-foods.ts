/**
 * Loads `data/usda-sr-legacy.ndjson` into the `foods` table.
 *
 * Run on its own with `bun run db:seed:foods`, or as the first step of
 * `bun run db:seed`.
 *
 * Idempotent by way of `fdc_id`: re-running updates the 7,793 rows in place
 * rather than duplicating them, so meal plan items keep pointing at the same
 * food rows across a re-seed. That is the whole reason `foods.fdc_id` carries a
 * unique index.
 *
 * Regenerate the dataset itself with `bun run scripts/build-food-dataset.ts`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';

import { db } from '@/db';
import { foods, type NewFood } from '@/db/schema';

const DATASET_PATH = join(dirname(fileURLToPath(import.meta.url)), '../data/usda-sr-legacy.ndjson');

/**
 * PostgreSQL caps a statement at 65,535 bound parameters. At 20 columns per row
 * that allows ~3,200 rows; 500 keeps a wide margin and still finishes in a
 * handful of round trips.
 */
const BATCH_SIZE = 500;

type DatasetRecord = {
  fdcId: number;
  description: string;
  category: string;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber?: number;
  sugar?: number;
  saturatedFat?: number;
  cholesterol?: number;
  sodium?: number;
  calcium?: number;
  iron?: number;
  potassium?: number;
  portionGrams?: number;
  portionLabel?: string;
};

/**
 * An absent nutrient in the dataset means "never measured", and must reach the
 * database as NULL rather than 0 — see the note on `foods.fiber`.
 */
function toRow(record: DatasetRecord): NewFood {
  return {
    fdcId: record.fdcId,
    description: record.description,
    category: record.category,
    kcal: record.kcal,
    protein: record.protein,
    fat: record.fat,
    carbs: record.carbs,
    fiber: record.fiber ?? null,
    sugar: record.sugar ?? null,
    saturatedFat: record.saturatedFat ?? null,
    cholesterol: record.cholesterol ?? null,
    sodium: record.sodium ?? null,
    calcium: record.calcium ?? null,
    iron: record.iron ?? null,
    potassium: record.potassium ?? null,
    portionGrams: record.portionGrams ?? null,
    portionLabel: record.portionLabel ?? null,
  };
}

/** `excluded.<column>` — the row PostgreSQL could not insert, inside an upsert. */
function sqlExcluded(column: string) {
  return sql.raw(`excluded.${column}`);
}

export async function seedFoods(): Promise<number> {
  let file: string;

  try {
    file = readFileSync(DATASET_PATH, 'utf8');
  } catch {
    throw new Error(
      'data/usda-sr-legacy.ndjson is missing. Regenerate it with: bun run scripts/build-food-dataset.ts',
    );
  }

  const rows = file
    .split('\n')
    // Blank lines, and the leading `#` line carrying the source and licence.
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => toRow(JSON.parse(line) as DatasetRecord));

  if (rows.length === 0) throw new Error('data/usda-sr-legacy.ndjson contains no foods');

  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    await db
      .insert(foods)
      .values(rows.slice(offset, offset + BATCH_SIZE))
      .onConflictDoUpdate({
        target: foods.fdcId,
        set: {
          description: sqlExcluded('description'),
          category: sqlExcluded('category'),
          kcal: sqlExcluded('kcal'),
          protein: sqlExcluded('protein'),
          fat: sqlExcluded('fat'),
          carbs: sqlExcluded('carbs'),
          fiber: sqlExcluded('fiber'),
          sugar: sqlExcluded('sugar'),
          saturatedFat: sqlExcluded('saturated_fat'),
          cholesterol: sqlExcluded('cholesterol'),
          sodium: sqlExcluded('sodium'),
          calcium: sqlExcluded('calcium'),
          iron: sqlExcluded('iron'),
          potassium: sqlExcluded('potassium'),
          portionGrams: sqlExcluded('portion_grams'),
          portionLabel: sqlExcluded('portion_label'),
          updatedAt: new Date(),
        },
      });
  }

  return rows.length;
}

// Allow `bun run scripts/seed-foods.ts` as well as being imported by seed.ts.
if (import.meta.main) {
  const count = await seedFoods();
  console.info(`seeded ${count} foods`);
  process.exit(0);
}
