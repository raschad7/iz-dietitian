import { and, asc, eq, isNull, or, ilike, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { catalogFoodAliases, catalogFoodPortions, catalogFoods, dishIngredients } from '@/db/schema';
import { CATALOG_FOOD_CATEGORIES, CATALOG_FOOD_STATES } from '@/db/schema/catalog-foods';
import { normalizeArabic } from '@/features/weekly-plans/arabic-normalize';

/**
 * The shared food catalog, as the platform curates it.
 *
 * ## What this screen may edit, and why it is not everything
 *
 * `catalog_foods` is generated data as much as it is a table. `data/catalog-foods.json`
 * is the committed source, and two scripts write to it from different directions:
 * `db:build-catalog` derives `note`, `nutrition` and `portions` from
 * `data/usda-sr-legacy.ndjson`, and `db:seed:catalog` loads the whole file into
 * the database.
 *
 * So the fields split cleanly in two, and this module edits only one half:
 *
 * - **Curated** — Arabic and English names, category, preparation state, the
 *   active flag, and aliases. Nothing derives these; a person chose them.
 * - **Derived** — nutrition, portions, provenance. `db:build-catalog` regenerates
 *   them from USDA and would put its own figures back over any hand correction,
 *   silently. Offering a nutrition field here would be offering an edit the next
 *   run of that script reverts.
 *
 * That is a real boundary rather than a shortcut, and it is why the panel has no
 * kcal box. A wrong nutrition value is fixed in `data/usda-sr-legacy.ndjson` or
 * by curating the food's source, not by typing over the result.
 *
 * ## Edits are not durable until they are exported
 *
 * `db:seed:catalog --apply` upserts every row in the file on `slug`, so a name
 * changed here is overwritten the next time anyone seeds. `bun run
 * db:export:catalog --apply` writes the database back out to the file — commit
 * that diff, the same way a generated migration is committed. The screen says so.
 */

export const CATALOG_QUERY_MAX = 60;

/** A shared food as the catalog screen lists it. */
export type SharedFood = {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  state: string;
  category: string;
  kcal: number;
  isActive: boolean;
  aliases: number;
  /** How many dish recipes name this food. A food in use cannot be deactivated lightly. */
  usedBy: number;
};

/**
 * Shared foods only — `clinic_id is null`.
 *
 * A clinic's private foods are that dietitian's records. They are invisible here
 * for the same reason `seed-catalog-foods.ts` refuses to touch them: the platform
 * curates the shared set, and a practice's own additions are not the platform's
 * to edit.
 */
export async function listSharedFoods(query?: string): Promise<SharedFood[]> {
  const term = query?.trim();

  const rows = await db
    .select({
      id: catalogFoods.id,
      slug: catalogFoods.slug,
      nameAr: catalogFoods.nameAr,
      nameEn: catalogFoods.nameEn,
      state: catalogFoods.state,
      category: catalogFoods.category,
      kcal: catalogFoods.kcal,
      isActive: catalogFoods.isActive,
    })
    .from(catalogFoods)
    .where(
      term
        ? and(
            isNull(catalogFoods.clinicId),
            or(
              ilike(catalogFoods.nameEn, `%${term}%`),
              ilike(catalogFoods.slug, `%${term}%`),
              // Arabic is matched on the normalised column, so a search typed
              // with a plain alef finds a food stored with a hamza. The same
              // normalisation the aliases are keyed on.
              ilike(catalogFoods.normalizedNameAr, `%${normalizeArabic(term)}%`),
            ),
          )
        : isNull(catalogFoods.clinicId),
    )
    .orderBy(asc(catalogFoods.slug))
    .limit(CATALOG_QUERY_MAX);

  if (!rows.length) return [];

  /*
    Two grouped counts rather than subqueries per row — the same lesson the
    clinic registry learned: an interpolated column inside a `sql` template
    loses its table, and a correlated subquery written that way compares the
    wrong pair.
  */
  const [aliasCounts, useCounts] = await Promise.all([
    db
      .select({ foodId: catalogFoodAliases.foodId, total: sql<number>`count(*)::int` })
      .from(catalogFoodAliases)
      .groupBy(catalogFoodAliases.foodId),
    db
      .select({ foodId: dishIngredients.catalogFoodId, total: sql<number>`count(*)::int` })
      .from(dishIngredients)
      .groupBy(dishIngredients.catalogFoodId),
  ]);

  const aliases = new Map(aliasCounts.map((row) => [row.foodId, row.total]));
  const used = new Map(useCounts.map((row) => [row.foodId, row.total]));

  return rows.map((row) => ({
    ...row,
    aliases: aliases.get(row.id) ?? 0,
    usedBy: used.get(row.id) ?? 0,
  }));
}

/** One shared food, with everything its edit screen shows. */
export type SharedFoodDetail = SharedFood & {
  sourceType: string;
  sourceRef: string | null;
  sourceNote: string | null;
  protein: number;
  fat: number;
  carbs: number;
  aliasList: { id: string; name: string; locale: string }[];
  portionList: { id: string; labelAr: string; labelEn: string; grams: number; isDefault: boolean }[];
};

export async function getSharedFood(foodId: string): Promise<SharedFoodDetail | null> {
  const [food] = await db
    .select()
    .from(catalogFoods)
    .where(and(eq(catalogFoods.id, foodId), isNull(catalogFoods.clinicId)))
    .limit(1);

  if (!food) return null;

  const [aliasRows, portionRows, useRows] = await Promise.all([
    db
      .select({ id: catalogFoodAliases.id, name: catalogFoodAliases.name, locale: catalogFoodAliases.locale })
      .from(catalogFoodAliases)
      .where(eq(catalogFoodAliases.foodId, foodId))
      .orderBy(asc(catalogFoodAliases.name)),
    db
      .select({
        id: catalogFoodPortions.id,
        labelAr: catalogFoodPortions.labelAr,
        labelEn: catalogFoodPortions.labelEn,
        grams: catalogFoodPortions.grams,
        isDefault: catalogFoodPortions.isDefault,
      })
      .from(catalogFoodPortions)
      .where(eq(catalogFoodPortions.foodId, foodId))
      .orderBy(asc(catalogFoodPortions.sortOrder)),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(dishIngredients)
      .where(eq(dishIngredients.catalogFoodId, foodId)),
  ]);

  return {
    id: food.id,
    slug: food.slug,
    nameAr: food.nameAr,
    nameEn: food.nameEn,
    state: food.state,
    category: food.category,
    kcal: food.kcal,
    protein: food.protein,
    fat: food.fat,
    carbs: food.carbs,
    isActive: food.isActive,
    sourceType: food.sourceType,
    sourceRef: food.sourceRef,
    sourceNote: food.sourceNote,
    aliases: aliasRows.length,
    usedBy: useRows[0]?.total ?? 0,
    aliasList: aliasRows,
    portionList: portionRows,
  };
}

/** What the edit form may send. Nutrition is absent on purpose — see the header. */
export const sharedFoodSchema = z.object({
  foodId: z.string().uuid(),
  nameAr: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().min(1).max(120),
  state: z.enum(CATALOG_FOOD_STATES),
  category: z.enum(CATALOG_FOOD_CATEGORIES),
  isActive: z.boolean(),
});

export type SharedFoodInput = z.infer<typeof sharedFoodSchema>;

/**
 * Writes the curated half of a shared food.
 *
 * `clinic_id is null` is part of the `where`, not just the read. A food id is a
 * form field, so it is attacker-controlled: without it this action would let the
 * platform panel edit one clinic's private food, which is the tenant boundary
 * running the wrong way.
 *
 * The normalised names are rewritten alongside the display names, because search
 * reads them and a rename that left them behind would make a food findable only
 * under a name it no longer has.
 *
 * It returns **what the row held before**, so the audit entry can record the
 * change and not only its result.
 *
 * ⚠ That value comes from a `select` inside the transaction, **not** from
 * `returning`. Postgres' `RETURNING` on an `UPDATE` yields the NEW row — using
 * it here would have logged the submitted values as both halves of the change,
 * which is a log that renders perfectly and says nothing. `for update` on the
 * read is what closes the gap between the two statements: a second operator
 * saving the same food waits rather than interleaving, so neither entry records
 * the other's value as its "before".
 */
export type SharedFoodBefore = {
  nameAr: string;
  nameEn: string;
  state: string;
  category: string;
  isActive: boolean;
};

export async function updateSharedFood(
  input: SharedFoodInput,
): Promise<{ before: SharedFoodBefore } | null> {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select({
        nameAr: catalogFoods.nameAr,
        nameEn: catalogFoods.nameEn,
        state: catalogFoods.state,
        category: catalogFoods.category,
        isActive: catalogFoods.isActive,
      })
      .from(catalogFoods)
      .where(and(eq(catalogFoods.id, input.foodId), isNull(catalogFoods.clinicId)))
      .limit(1)
      .for('update');

    if (!before) return null;

    await tx
      .update(catalogFoods)
      .set({
        nameAr: input.nameAr,
        nameEn: input.nameEn,
        normalizedNameAr: normalizeArabic(input.nameAr),
        normalizedNameEn: normalizeArabic(input.nameEn),
        state: input.state,
        category: input.category,
        isActive: input.isActive,
        updatedAt: new Date(),
      })
      .where(and(eq(catalogFoods.id, input.foodId), isNull(catalogFoods.clinicId)));

    return { before };
  });
}
