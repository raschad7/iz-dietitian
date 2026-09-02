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
 * **Curated** — `slug`, `nameAr`, `nameEn`, `state`, `category`, `countedAs`,
 * `sourceType`, `sourceRef`, `aliasesAr`, `aliasesEn`, `extraPortions`. Written
 * by a person, read here, copied through untouched. This script never edits
 * curation.
 *
 * A food whose `sourceType` is not `usda_sr_legacy` is curated **entirely**,
 * `nutrition` and `portions` included, because there is no upstream row to derive
 * them from. `sourceRef` then has to say where the numbers came from — a
 * published table, or a product label and the date it was read.
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
  /** Every measured household portion, in `seq_num` order. */
  portions?: { grams: number; label: string }[];
} & Partial<Record<(typeof NUTRIENT_KEYS)[number], number>>;

type CuratedFood = {
  slug: string;
  nameAr: string;
  nameEn: string;
  state: string;
  category: string;
  sourceType: string;
  sourceRef: string;
  /** Where a non-USDA number came from. Required when `sourceType` is not USDA. */
  sourceNote?: string;
  note: string;
  nutrition: Record<string, number | null>;
  portions: PortionSeed[];
  /**
   * Units a dietitian uses that USDA does not publish, written by hand.
   *
   * The one case that needs this is the spoon: a dietitian writes "7 spoons of
   * rice" and means a heaped eating spoon, while USDA's tablespoon - where it has
   * one at all - is a level measuring spoon at a third of the weight. They are two
   * different objects and no arithmetic turns one into the other, so the clinic's
   * number is recorded as data with a `sourceRef` saying whose it is.
   *
   * Curated: read here, appended after the derived rows, never rewritten.
   */
  extraPortions?: PortionSeed[];
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

/**
 * Appends the hand-written portions after the derived ones.
 *
 * After, not before: the derived rows come from the food's own measures and are
 * what it should start in, so appending leaves `isDefault` where the derivation
 * put it. A curated row only ever adds a unit the dietitian can choose.
 *
 * A curated label that collides with a derived one is dropped rather than
 * overwriting it - the seed upserts portions on `(food_id, label_en)`, so two rows
 * claiming the same label would be one row with whichever weight was written last.
 */
export function withExtras(
  derived: readonly PortionSeed[],
  extras: readonly PortionSeed[] | undefined,
): PortionSeed[] {
  if (!extras?.length) return [...derived];

  const taken = new Set(derived.map((portion) => portion.labelEn));
  const rows = [...derived];

  for (const extra of extras) {
    if (taken.has(extra.labelEn) || !(extra.grams > 0)) continue;
    taken.add(extra.labelEn);

    rows.push({
      ...extra,
      // The derivation owns which unit a food starts in; a curated row is an
      // addition to the menu, never a replacement for its default.
      isDefault: rows.length === 0,
      sortOrder: rows.length,
    });
  }

  return rows;
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
    // A food USDA has no row for carries its own numbers, and they are curation
    // like every other hand-written field: read, copied through, never rewritten.
    // Labaneh and freekeh are not in SR Legacy and never will be — it is a final
    // 2018 release — so the alternative to this branch is calling labaneh Greek
    // yogurt, which is what the catalog used to do.
    if (curated.sourceType !== 'usda_sr_legacy') {
      if (!curated.nutrition || typeof curated.nutrition.kcal !== 'number') {
        problems.push(`${curated.slug}: ${curated.sourceType} food carries no nutrition of its own`);
      }
      if (!curated.sourceNote?.trim()) {
        problems.push(`${curated.slug}: ${curated.sourceType} food must cite where its numbers came from`);
      }
      // The reserved range, so a recipe can reference it by `fdcId` without ever
      // colliding with a real FoodData Central id.
      if (!(Number(curated.sourceRef) >= 900000)) {
        problems.push(`${curated.slug}: a non-USDA food needs a sourceRef of 900000 or above`);
      }

      return curated;
    }

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
      portions: withExtras(
        derivePortions({ category: curated.category, portions: source.portions ?? [] }),
        curated.extraPortions,
      ),
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
