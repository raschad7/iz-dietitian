/**
 * Seeds the canonical food catalog from `data/catalog-foods.json`.
 *
 *   bun run db:seed:catalog           # report only, writes nothing
 *   bun run db:seed:catalog --apply   # write
 *
 * **Self-contained since Phase 2.** It reads one committed file and nothing else —
 * no USDA table to load first, no 7,793 rows to create 91 canonical foods. The
 * nutrition, the portions and the aliases are all in the dataset, generated from
 * `data/usda-sr-legacy.ndjson` by `bun run db:build-catalog` and committed.
 *
 * What it writes, in one transaction:
 *
 *   1. Shared catalog foods (`clinic_id is null`), upserted on `slug`.
 *   2. Their aliases, upserted on `(food_id, normalized_name)`.
 *   3. Their portions, upserted on `(food_id, label_en)`; a portion dropped from
 *      the dataset is removed, and any ingredient that referenced it keeps its
 *      grams and falls back to showing them.
 *
 * **It never touches a clinic's own foods.** Those are the dietitian's records:
 * not in this file, not created here, not promoted, not re-verified. The only
 * thing this script may do to a clinic row is nothing.
 *
 * Idempotent and honest about it: every row is reported as created, updated,
 * unchanged or rejected, so a second run visibly changes nothing. Fails loudly and
 * writes nothing when the dataset's checksum does not match its contents, when a
 * required field is missing, or when a nutrient that must exist is null.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';

import { db } from '@/db';
import { catalogFoodAliases, catalogFoodPortions, catalogFoods } from '@/db/schema';
import {
  CATALOG_FOOD_CATEGORIES,
  CATALOG_FOOD_STATES,
} from '@/db/schema/catalog-foods';
import { normalizeArabic } from '@/features/weekly-plans/arabic-normalize';
import { NUTRIENT_KEYS, type NutrientKey } from '@/features/weekly-plans/nutrition';
import { isMember } from '@/lib/enum';
import { catalogChecksum } from './build-catalog-dataset';

const DATASET_PATH = join(dirname(fileURLToPath(import.meta.url)), '../data/catalog-foods.json');

/** The nutrients that must carry a number. The rest may be null — "never measured". */
const REQUIRED_NUTRIENTS = ['kcal', 'protein', 'fat', 'carbs'] as const;

type CuratedPortion = {
  labelAr: string;
  labelEn: string;
  grams: number;
  isDefault: boolean;
  sortOrder: number;
  /**
   * Where this weight came from, when it is not the food's own USDA measure.
   *
   * Only a curated portion carries one — a unit a dietitian uses that USDA does
   * not publish. Matches `PortionSeed` so the build and the seed hold one shape.
   */
  sourceRef?: string;
};

export type CuratedFood = {
  slug: string;
  nameAr: string;
  nameEn: string;
  state: string;
  category: string;
  sourceType: string;
  sourceRef: string;
  note: string;
  nutrition: Record<string, number | null>;
  /**
   * Every portion this food offers, derived and curated alike. **This is what the
   * seed writes** — `db:build-catalog` has already folded `extraPortions` in.
   */
  portions: CuratedPortion[];
  /**
   * The hand-written portions, kept so the build can re-fold them and so a reader
   * can tell a clinic's unit from a USDA measure. Never read by the seed.
   */
  extraPortions?: CuratedPortion[];
  aliasesAr: string[];
  aliasesEn: string[];
};

export type CatalogSeedReport = {
  curatedFoods: number;
  foodsCreated: number;
  foodsUpdated: number;
  foodsUnchanged: number;
  aliasesWritten: number;
  portionsWritten: number;
  portionsRemoved: number;
  /** Clinic-owned rows seen and deliberately left alone. */
  clinicFoodsUntouched: number;
  rejected: string[];
  applied: boolean;
};

/**
 * Validates the dataset before a single row is read from the database.
 *
 * Structural, not stylistic: a duplicate slug or source reference would be two
 * names for one food — the duplication the canonical catalog exists to remove —
 * and a null macro would put a zero into a meal plan.
 */
export function validateCuratedFoods(records: readonly CuratedFood[]): string[] {
  const problems: string[] = [];
  const slugs = new Set<string>();
  const refs = new Set<string>();

  for (const food of records) {
    if (slugs.has(food.slug)) problems.push(`duplicate slug: ${food.slug}`);
    slugs.add(food.slug);

    if (refs.has(food.sourceRef)) problems.push(`duplicate sourceRef: ${food.sourceRef}`);
    refs.add(food.sourceRef);

    if (!food.nameAr?.trim()) problems.push(`${food.slug}: empty nameAr`);
    if (!food.nameEn?.trim()) problems.push(`${food.slug}: empty nameEn`);
    if (!isMember(CATALOG_FOOD_STATES, food.state)) {
      problems.push(`${food.slug}: unknown state "${food.state}"`);
    }
    if (!isMember(CATALOG_FOOD_CATEGORIES, food.category)) {
      problems.push(`${food.slug}: unknown category "${food.category}"`);
    }

    if (!food.nutrition) {
      problems.push(`${food.slug}: no nutrition block`);
    } else {
      for (const key of NUTRIENT_KEYS) {
        if (!(key in food.nutrition)) {
          // Absent is not the same as null. Null states "never measured"; a missing
          // key states nothing, and the difference is the whole point of the column.
          problems.push(`${food.slug}: nutrition is missing "${key}" (use null for unmeasured)`);
        }
      }
      for (const key of REQUIRED_NUTRIENTS) {
        if (typeof food.nutrition[key] !== 'number') {
          problems.push(`${food.slug}: ${key} must be a number, never null`);
        }
      }
    }

    const labels = new Set<string>();
    let defaults = 0;

    for (const portion of food.portions ?? []) {
      if (!portion.labelAr?.trim() || !portion.labelEn?.trim()) {
        problems.push(`${food.slug}: a portion is missing a label`);
      }
      if (!Number.isFinite(portion.grams) || portion.grams <= 0) {
        problems.push(`${food.slug}: portion "${portion.labelEn}" has a non-positive weight`);
      }
      if (labels.has(portion.labelEn)) {
        problems.push(`${food.slug}: duplicate portion "${portion.labelEn}"`);
      }
      labels.add(portion.labelEn);
      if (portion.isDefault) defaults += 1;
    }

    if (defaults > 1) problems.push(`${food.slug}: ${defaults} default portions, expected at most one`);
    if ((food.portions?.length ?? 0) > 0 && defaults === 0) {
      problems.push(`${food.slug}: has portions but none is the default`);
    }
  }

  return problems;
}

/** Reads and checksum-verifies the dataset. Throws rather than seeding something unverified. */
export function readCatalogDataset(path = DATASET_PATH): CuratedFood[] {
  const file = JSON.parse(readFileSync(path, 'utf8')) as { checksum?: string; foods: CuratedFood[] };

  if (!file.foods?.length) throw new Error('data/catalog-foods.json contains no foods');

  const actual = catalogChecksum(file.foods);
  if (file.checksum !== actual) {
    throw new Error(
      `data/catalog-foods.json checksum mismatch: file says ${file.checksum}, contents are ${actual}. ` +
        'Re-run `bun run db:build-catalog` after editing the curated fields.',
    );
  }

  const problems = validateCuratedFoods(file.foods);
  if (problems.length) {
    throw new Error(`data/catalog-foods.json is invalid:\n  ${problems.join('\n  ')}`);
  }

  return file.foods;
}

/** The `catalog_foods` column values one curated entry becomes. */
function foodValues(food: CuratedFood) {
  const nutrition = {} as Record<NutrientKey, number | null>;
  for (const key of NUTRIENT_KEYS) nutrition[key] = food.nutrition[key] ?? null;

  return {
    clinicId: null,
    slug: food.slug,
    nameAr: food.nameAr,
    nameEn: food.nameEn,
    normalizedNameAr: normalizeArabic(food.nameAr),
    normalizedNameEn: normalizeArabic(food.nameEn),
    state: food.state,
    category: food.category,
    // Copied verbatim from the dataset. A null stays null — "not measured" is not zero.
    kcal: nutrition.kcal!,
    protein: nutrition.protein!,
    fat: nutrition.fat!,
    carbs: nutrition.carbs!,
    fiber: nutrition.fiber,
    sugar: nutrition.sugar,
    saturatedFat: nutrition.saturatedFat,
    cholesterol: nutrition.cholesterol,
    sodium: nutrition.sodium,
    calcium: nutrition.calcium,
    iron: nutrition.iron,
    potassium: nutrition.potassium,
    verificationStatus: 'verified',
    sourceType: food.sourceType,
    sourceRef: food.sourceRef,
    isActive: true,
  };
}

/** True when a stored row already says exactly what the dataset says. */
function sameFood(stored: Record<string, unknown>, desired: ReturnType<typeof foodValues>): boolean {
  return Object.entries(desired).every(([key, value]) => {
    const current = stored[key];
    if (typeof value === 'number' && typeof current === 'number') {
      // `real` round-trips through float32, so an exact === on a copied value is
      // not safe. A tenth of a milligram is far below any display precision.
      return Math.abs(current - value) < 1e-4;
    }
    return current === value;
  });
}

export async function seedCatalogFoods(options: { apply?: boolean } = {}): Promise<CatalogSeedReport> {
  const apply = options.apply ?? false;
  const curated = readCatalogDataset();

  const report: CatalogSeedReport = {
    curatedFoods: curated.length,
    foodsCreated: 0,
    foodsUpdated: 0,
    foodsUnchanged: 0,
    aliasesWritten: 0,
    portionsWritten: 0,
    portionsRemoved: 0,
    clinicFoodsUntouched: 0,
    rejected: [],
    applied: false,
  };

  const existing = await db.select().from(catalogFoods).where(isNull(catalogFoods.clinicId));
  const existingBySlug = new Map(existing.map((row) => [row.slug, row as Record<string, unknown>]));

  const [clinicOwned] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(catalogFoods)
    .where(sql`clinic_id is not null`);
  report.clinicFoodsUntouched = clinicOwned?.count ?? 0;

  for (const food of curated) {
    const stored = existingBySlug.get(food.slug);
    if (!stored) report.foodsCreated += 1;
    else if (sameFood(stored, foodValues(food))) report.foodsUnchanged += 1;
    else report.foodsUpdated += 1;
  }

  if (!apply) return report;

  await db.transaction(async (tx) => {
    // --- foods ---------------------------------------------------------------

    const written = await tx
      .insert(catalogFoods)
      .values(curated.map(foodValues))
      .onConflictDoUpdate({
        target: catalogFoods.slug,
        // The unique index is partial, so the predicate has to be restated here or
        // PostgreSQL cannot infer which index this ON CONFLICT means.
        targetWhere: sql`clinic_id is null`,
        set: {
          nameAr: sql`excluded.name_ar`,
          nameEn: sql`excluded.name_en`,
          normalizedNameAr: sql`excluded.normalized_name_ar`,
          normalizedNameEn: sql`excluded.normalized_name_en`,
          state: sql`excluded.state`,
          category: sql`excluded.category`,
          kcal: sql`excluded.kcal`,
          protein: sql`excluded.protein`,
          fat: sql`excluded.fat`,
          carbs: sql`excluded.carbs`,
          fiber: sql`excluded.fiber`,
          sugar: sql`excluded.sugar`,
          saturatedFat: sql`excluded.saturated_fat`,
          cholesterol: sql`excluded.cholesterol`,
          sodium: sql`excluded.sodium`,
          calcium: sql`excluded.calcium`,
          iron: sql`excluded.iron`,
          potassium: sql`excluded.potassium`,
          verificationStatus: sql`excluded.verification_status`,
          sourceType: sql`excluded.source_type`,
          sourceRef: sql`excluded.source_ref`,
          updatedAt: new Date(),
        },
      })
      .returning({ id: catalogFoods.id, slug: catalogFoods.slug });

    const idBySlug = new Map(written.map((row) => [row.slug, row.id]));

    // --- aliases -------------------------------------------------------------

    const aliasValues = curated.flatMap((food) => {
      const foodId = idBySlug.get(food.slug);
      if (!foodId) throw new Error(`catalog food ${food.slug} was not written`);

      const rows = [
        ...food.aliasesAr.map((name) => ({ name, locale: 'ar' })),
        ...food.aliasesEn.map((name) => ({ name, locale: 'en' })),
      ];

      // Two spellings that normalize the same are one alias; the unique index would
      // reject the second anyway, and dropping it here keeps the count honest.
      const seen = new Set<string>();
      return rows.flatMap(({ name, locale }) => {
        const normalized = normalizeArabic(name);
        if (!normalized || seen.has(normalized)) return [];
        seen.add(normalized);
        return [{ foodId, name, normalizedName: normalized, locale }];
      });
    });

    if (aliasValues.length) {
      await tx
        .insert(catalogFoodAliases)
        .values(aliasValues)
        .onConflictDoUpdate({
          target: [catalogFoodAliases.foodId, catalogFoodAliases.normalizedName],
          set: { name: sql`excluded.name`, locale: sql`excluded.locale`, updatedAt: new Date() },
        });
      report.aliasesWritten = aliasValues.length;
    }

    /*
     * An alias the dataset no longer claims is removed — otherwise مفتول would
     * survive on couscous forever in any database that was seeded before it was
     * taken out, which is the whole correction Phase 2 was asked to make. Only
     * touches shared foods; a clinic's own synonyms are its own.
     */
    for (const food of curated) {
      const foodId = idBySlug.get(food.slug)!;
      const keep = aliasValues
        .filter((alias) => alias.foodId === foodId)
        .map((alias) => alias.normalizedName);

      await tx
        .delete(catalogFoodAliases)
        .where(
          keep.length
            ? and(
                eq(catalogFoodAliases.foodId, foodId),
                notInArray(catalogFoodAliases.normalizedName, keep),
              )
            : eq(catalogFoodAliases.foodId, foodId),
        );
    }

    // --- portions ------------------------------------------------------------

    const portionValues = curated.flatMap((food) =>
      (food.portions ?? []).map((portion) => ({
        foodId: idBySlug.get(food.slug)!,
        labelAr: portion.labelAr,
        labelEn: portion.labelEn,
        grams: portion.grams,
        isDefault: portion.isDefault,
        sortOrder: portion.sortOrder,
        sourceRef: portion.sourceRef ?? food.sourceRef,
      })),
    );

    /*
     * Defaults are cleared before the upsert, not after.
     *
     * `catalog_food_portions_default_idx` allows one default per food, and it is
     * checked per row as the insert proceeds. Moving a food's default from "Cup" to
     * "Half cup" would collide with the default still stored on "Cup" mid-statement;
     * clearing first means the only defaults in the table during the write are the
     * ones this run is setting.
     */
    const foodIds = [...idBySlug.values()];
    if (foodIds.length) {
      await tx
        .update(catalogFoodPortions)
        .set({ isDefault: false })
        .where(inArray(catalogFoodPortions.foodId, foodIds));
    }

    if (portionValues.length) {
      await tx
        .insert(catalogFoodPortions)
        .values(portionValues)
        .onConflictDoUpdate({
          target: [catalogFoodPortions.foodId, catalogFoodPortions.labelEn],
          set: {
            labelAr: sql`excluded.label_ar`,
            grams: sql`excluded.grams`,
            isDefault: sql`excluded.is_default`,
            sortOrder: sql`excluded.sort_order`,
            sourceRef: sql`excluded.source_ref`,
            updatedAt: new Date(),
          },
        });
      report.portionsWritten = portionValues.length;
    }

    // A portion the dataset dropped stops being offered. Any ingredient that used
    // it keeps its grams — `dish_ingredients.portion_id` is `on delete set null`.
    for (const food of curated) {
      const foodId = idBySlug.get(food.slug)!;
      const keep = (food.portions ?? []).map((portion) => portion.labelEn);

      const removed = await tx
        .delete(catalogFoodPortions)
        .where(
          keep.length
            ? and(
                eq(catalogFoodPortions.foodId, foodId),
                notInArray(catalogFoodPortions.labelEn, keep),
              )
            : eq(catalogFoodPortions.foodId, foodId),
        )
        .returning({ id: catalogFoodPortions.id });

      report.portionsRemoved += removed.length;
    }
  });

  report.applied = true;

  return report;
}

if (import.meta.main) {
  const apply = process.argv.includes('--apply');

  const [database] = await db.execute<{ name: string }>(sql`select current_database() as name`);
  console.info(`database: ${database?.name ?? 'unknown'}`);
  console.info(apply ? 'mode: APPLY (writes)' : 'mode: report only (add --apply to write)');
  console.info('');

  const report = await seedCatalogFoods({ apply });

  console.info(`curated foods in file:      ${report.curatedFoods}`);
  console.info(`  created:                  ${report.foodsCreated}`);
  console.info(`  updated:                  ${report.foodsUpdated}`);
  console.info(`  unchanged:                ${report.foodsUnchanged}`);
  console.info(`  rejected:                 ${report.rejected.length}`);
  console.info(`aliases written:            ${report.aliasesWritten}`);
  console.info(`portions written:           ${report.portionsWritten}`);
  console.info(`portions removed:           ${report.portionsRemoved}`);
  console.info(`clinic foods left untouched:${report.clinicFoodsUntouched}`);

  if (report.rejected.length) {
    console.error('\nNothing was written. Rejected:');
    for (const line of report.rejected) console.error(`  ${line}`);
    process.exit(1);
  }

  if (!apply) console.info('\nRe-run with --apply to write.');

  process.exit(0);
}
