/**
 * Regenerates the derived half of `data/catalog-foods.json`.
 *
 *   bun run db:build-catalog
 *
 * A maintenance tool, not part of any build — the same standing as
 * `build-food-dataset.ts`. The generated file is committed, so a fresh database
 * needs nothing but the migrations and `db:seed:catalog`.
 *
 * ## The two halves of the file
 *
 * **Curated** — `slug`, `nameAr`, `nameEn`, `state`, `category`, `sourceType`,
 * `sourceRef`, `aliasesAr`, `aliasesEn`. Written by a person, read here, copied
 * through untouched. This script never edits curation.
 *
 * **Derived** — `note`, `nutrition`, `portions`, and the file's `checksum`. Read
 * out of `data/usda-sr-legacy.ndjson` by `sourceRef`, and rewritten on every run.
 * Deterministic: the same inputs produce a byte-identical file, so a re-run should
 * be a no-op diff.
 *
 * ## Why the nutrition is written into the file at all
 *
 * Until Phase 2 the catalog seed copied nutrition out of the `foods` table, which
 * meant creating 91 canonical foods required first loading 7,793 USDA rows into
 * PostgreSQL. The dataset is the source of truth now; the NDJSON stays as the
 * offline provenance record every number can be checked against, which is what
 * this script does.
 *
 * **Nothing here invents a number.** Nutrition is copied verbatim, an unmeasured
 * nutrient is written as an explicit `null` rather than left out, and portions come
 * from `derivePortions` — the food's own measured household portion and plain
 * fractions of it.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NUTRIENT_KEYS } from '@/features/weekly-plans/nutrition';
import { derivePortions, type PortionSeed } from '@/features/weekly-plans/portion-derivation';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_PATH = join(ROOT, 'data/catalog-foods.json');
const USDA_PATH = join(ROOT, 'data/usda-sr-legacy.ndjson');

type UsdaRecord = {
  fdcId: number;
  description: string;
  category: string;
  portionGrams?: number;
  portionLabel?: string;
} & Partial<Record<(typeof NUTRIENT_KEYS)[number], number>>;

type CuratedFood = {
  slug: string;
  nameAr: string;
  nameEn: string;
  state: string;
  category: string;
  sourceType: string;
  sourceRef: string;
  note: string;
  nutrition: Record<string, number | null>;
  portions: PortionSeed[];
  aliasesAr: string[];
  aliasesEn: string[];
};

/** Reads the offline USDA reference, keyed by FDC id. */
export function readUsdaReference(path = USDA_PATH): Map<number, UsdaRecord> {
  const byId = new Map<number, UsdaRecord>();

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    // The `#` first line is the dataset's provenance header, not a food.
    if (!trimmed || trimmed.startsWith('#')) continue;
    const record = JSON.parse(trimmed) as UsdaRecord;
    byId.set(record.fdcId, record);
  }

  return byId;
}

/**
 * The checksum the seed refuses to run against a mismatch of.
 *
 * Taken over the canonical JSON of the foods array alone, so it covers every name,
 * nutrient, portion and alias but not the comment or the checksum line itself.
 */
export function catalogChecksum(foods: readonly unknown[]): string {
  return createHash('sha256').update(JSON.stringify(foods)).digest('hex').slice(0, 16);
}

function build(): void {
  const file = JSON.parse(readFileSync(CATALOG_PATH, 'utf8')) as {
    $comment?: string;
    checksum?: string;
    foods: CuratedFood[];
  };
  const usda = readUsdaReference();

  const problems: string[] = [];

  const foods = file.foods.map((curated) => {
    const source = usda.get(Number(curated.sourceRef));

    if (!source) {
      problems.push(`${curated.slug}: sourceRef ${curated.sourceRef} is not in data/usda-sr-legacy.ndjson`);
      return curated;
    }

    // Every nutrient is written explicitly, `null` included. An absent key would
    // be indistinguishable from a key someone forgot, and "never measured" is a
    // fact this file has to be able to state.
    const nutrition: Record<string, number | null> = {};
    for (const key of NUTRIENT_KEYS) {
      const value = source[key];
      nutrition[key] = typeof value === 'number' ? value : null;
    }

    if (nutrition.kcal === null) problems.push(`${curated.slug}: source has no energy value`);
    for (const key of ['protein', 'fat', 'carbs'] as const) {
      if (nutrition[key] === null) problems.push(`${curated.slug}: source has no ${key} value`);
    }

    return {
      ...curated,
      // The description this fdcId carried when the file was generated. The seed
      // re-checks it, so a re-run of `build-food-dataset` that moved an id onto a
      // different food is caught before any nutrition is trusted.
      note: source.description,
      nutrition,
      portions: derivePortions({
        category: curated.category,
        portionGrams: source.portionGrams ?? null,
        portionLabel: source.portionLabel ?? null,
      }),
    };
  });

  if (problems.length) {
    console.error('cannot build the catalog dataset:');
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }

  const output = {
    $comment: file.$comment,
    checksum: catalogChecksum(foods),
    foods,
  };

  // CRLF, matching the other committed data files on this repository.
  writeFileSync(CATALOG_PATH, `${JSON.stringify(output, null, 2)}\n`.replace(/\n/g, '\r\n'));

  const withPortions = foods.filter((food) => food.portions.length > 0).length;
  const portionRows = foods.reduce((total, food) => total + food.portions.length, 0);
  const aliases = foods.reduce((total, food) => total + food.aliasesAr.length + food.aliasesEn.length, 0);

  console.info(`wrote ${foods.length} foods to data/catalog-foods.json (checksum ${output.checksum})`);
  console.info(`  ${portionRows} portions across ${withPortions} foods, ${foods.length - withPortions} grams-only`);
  console.info(`  ${aliases} aliases`);
}

// Guarded: `seed-catalog-foods.ts` imports `catalogChecksum` from here, and a
// seed that rewrote the dataset on its way to reading it would be validating its
// own output.
if (import.meta.main) {
  build();
  process.exit(0);
}
