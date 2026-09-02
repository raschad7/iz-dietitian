import { and, eq, inArray, isNull, or } from 'drizzle-orm';

import { db } from '@/db';
import {
  catalogFoodAliases,
  catalogFoodPortions,
  catalogFoods,
  clinicHiddenDishes,
  dishes,
  dishIngredients,
  weeklyPlanMealOptions,
  weeklyPlanMeals,
} from '@/db/schema';

import { normalizeArabic } from './arabic-normalize';
import type { ClinicDishInput, CustomFoodInput } from './catalog-schema';
import { CUSTOM_UNIT_LABELS } from './portion-derivation';

/**
 * Writes for a clinic's own catalog.
 *
 * Same rules as `mutations.ts`: `clinicId` first, every id resolved against the
 * clinic before writing, `false` rather than a throw on a scope miss so a forged
 * id is indistinguishable from a stale one. Only clinic-owned dishes
 * (`clinic_id = clinicId`) may be edited or deleted; a shared dish may only be
 * hidden.
 */

function makeSlug(clinicId: string, nameEn: string): string {
  const base = nameEn.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'dish';
  // Suffixed with a short clinic-scoped random tail so two clinics naming a dish
  // the same do not collide on the global unique slug index.
  return `${base}-${clinicId.slice(0, 8)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** One recipe line after the server has decided what it actually means. */
type ResolvedIngredient = {
  foodId: string;
  /** Derived here, never taken from the request when a portion was chosen. */
  quantityGrams: number;
  portionId: string | null;
  portionQuantity: number | null;
};

function ingredientRows(dishId: string, ingredients: readonly ResolvedIngredient[]) {
  return ingredients.map((ingredient, index) => ({
    dishId,
    catalogFoodId: ingredient.foodId,
    // The authoritative amount, and the only one nutrition reads.
    quantityGrams: ingredient.quantityGrams,
    // How it was typed, preserved exactly as entered.
    portionId: ingredient.portionId,
    portionQuantity: ingredient.portionQuantity,
    sortOrder: index,
  }));
}

/**
 * Resolves a submitted recipe into the rows that may actually be written, or null
 * if any line is not usable by this clinic.
 *
 * Two jobs, and the second is the reason this is not just a validator.
 *
 * **1. Authorisation.** Returns null — never a throw, never a partial save — on:
 *
 *   - a food this clinic cannot see (another clinic's, or one that does not exist);
 *   - an inactive food;
 *   - a portion that belongs to a *different* food than the line it is on, which is
 *     how "2 حبة" of egg could otherwise end up meaning "2 كوب" of rice;
 *   - a portion of a food the clinic cannot see, which is the same cross-tenant
 *     read as the first case arriving one level down.
 *
 * The portion id comes from a form. A dietitian's browser cannot offer another
 * clinic's portion, but a request can name one, and "the UI would never send that"
 * is not an authorisation rule.
 *
 * **2. Deriving the grams.** When a line names a portion, its weight is computed
 * here as `portionQuantity × portion.grams` and the grams the client submitted are
 * **discarded**. They are a convenience the browser calculates, and a request is
 * free to submit "1 cup" with `quantityGrams: 50` when that cup weighs 200 g —
 * which would show every reader "1 كوب" while feeding a quarter of a cup into the
 * nutrition. The two figures cannot disagree if only one of them is ever trusted.
 * A grams-only line has nothing to derive from and keeps the validated number it
 * submitted, which is also the only figure it stated.
 *
 * The portion count itself is preserved exactly as typed, so the display keeps
 * saying what the dietitian wrote rather than a value reconstructed by division.
 */
async function resolveIngredients(
  clinicId: string,
  input: ClinicDishInput,
): Promise<ResolvedIngredient[] | null> {
  const foodIds = [...new Set(input.ingredients.map((ingredient) => ingredient.foodId))];

  const visible = await db
    .select({ id: catalogFoods.id })
    .from(catalogFoods)
    .where(
      and(
        inArray(catalogFoods.id, foodIds),
        eq(catalogFoods.isActive, true),
        or(isNull(catalogFoods.clinicId), eq(catalogFoods.clinicId, clinicId)),
      ),
    );

  if (visible.length !== foodIds.length) return null;

  const portionIds = [
    ...new Set(
      input.ingredients
        .map((ingredient) => ingredient.portionId)
        .filter((id): id is string => typeof id === 'string'),
    ),
  ];

  // Joined to the food and re-scoped there: a portion carries no `clinic_id` of
  // its own precisely because its scope is the food's, so this is where that
  // inheritance is enforced rather than assumed.
  const portions = portionIds.length
    ? await db
        .select({
          id: catalogFoodPortions.id,
          foodId: catalogFoodPortions.foodId,
          grams: catalogFoodPortions.grams,
        })
        .from(catalogFoodPortions)
        .innerJoin(catalogFoods, eq(catalogFoods.id, catalogFoodPortions.foodId))
        .where(
          and(
            inArray(catalogFoodPortions.id, portionIds),
            eq(catalogFoods.isActive, true),
            or(isNull(catalogFoods.clinicId), eq(catalogFoods.clinicId, clinicId)),
          ),
        )
    : [];

  const portionById = new Map(portions.map((row) => [row.id, row]));

  const resolved: ResolvedIngredient[] = [];

  for (const ingredient of input.ingredients) {
    if (ingredient.portionId == null || ingredient.portionQuantity == null) {
      resolved.push({
        foodId: ingredient.foodId,
        quantityGrams: ingredient.quantityGrams,
        portionId: null,
        portionQuantity: null,
      });
      continue;
    }

    const portion = portionById.get(ingredient.portionId);
    // Unknown, retired, invisible, or belonging to another food — all of them are
    // "this clinic may not measure this line that way", and all of them refuse.
    if (!portion || portion.foodId !== ingredient.foodId) return null;
    // The column is CHECK-constrained positive; a zero here would silently write a
    // weightless ingredient, so it is refused rather than trusted.
    if (!Number.isFinite(portion.grams) || portion.grams <= 0) return null;

    const grams = ingredient.portionQuantity * portion.grams;
    if (!Number.isFinite(grams) || grams <= 0) return null;

    resolved.push({
      foodId: ingredient.foodId,
      quantityGrams: grams,
      portionId: ingredient.portionId,
      portionQuantity: ingredient.portionQuantity,
    });
  }

  return resolved;
}

export async function createClinicDish(clinicId: string, input: ClinicDishInput): Promise<string | null> {
  const ingredients = await resolveIngredients(clinicId, input);
  if (!ingredients) return null;

  return db.transaction(async (tx) => {
    const [dish] = await tx
      .insert(dishes)
      .values({
        clinicId,
        slug: makeSlug(clinicId, input.nameEn),
        nameAr: input.nameAr,
        nameEn: input.nameEn,
        mealTypes: input.mealTypes,
        source: input.source,
        effort: input.effort,
        cost: input.cost,
        occasion: input.occasion,
        isSide: input.isSide,
        allergenTags: input.allergenTags,
        baseServingLabel: input.baseServingLabel,
      })
      .returning({ id: dishes.id });

    if (!dish) return null;
    await tx.insert(dishIngredients).values(ingredientRows(dish.id, ingredients));
    return dish.id;
  });
}

/** True only if the dish exists AND is owned by this clinic (not shared, not another clinic's). */
async function ownsDish(clinicId: string, dishId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: dishes.id })
    .from(dishes)
    .where(and(eq(dishes.id, dishId), eq(dishes.clinicId, clinicId)))
    .limit(1);
  return row !== undefined;
}

export async function updateClinicDish(
  clinicId: string,
  dishId: string,
  input: ClinicDishInput,
): Promise<boolean> {
  if (!(await ownsDish(clinicId, dishId))) return false;

  const ingredients = await resolveIngredients(clinicId, input);
  if (!ingredients) return false;

  await db.transaction(async (tx) => {
    await tx
      .update(dishes)
      .set({
        nameAr: input.nameAr,
        nameEn: input.nameEn,
        mealTypes: input.mealTypes,
        source: input.source,
        effort: input.effort,
        cost: input.cost,
        occasion: input.occasion,
        isSide: input.isSide,
        allergenTags: input.allergenTags,
        baseServingLabel: input.baseServingLabel,
        updatedAt: new Date(),
      })
      .where(eq(dishes.id, dishId));

    // Replace the recipe wholesale — simpler and less error-prone than diffing,
    // and a dish has a handful of rows.
    await tx.delete(dishIngredients).where(eq(dishIngredients.dishId, dishId));
    await tx.insert(dishIngredients).values(ingredientRows(dishId, ingredients));
  });

  return true;
}

export type DeleteDishResult = 'deleted' | 'not_found' | 'in_use';

export async function deleteClinicDish(clinicId: string, dishId: string): Promise<DeleteDishResult> {
  if (!(await ownsDish(clinicId, dishId))) return 'not_found';

  // The dish's own ingredients cascade, but weekly_plan_meals / options reference
  // it with onDelete: restrict — a dish a saved plan still uses must not vanish
  // from under that plan. Report it rather than letting the FK error escape.
  const [inMeal] = await db
    .select({ id: weeklyPlanMeals.id })
    .from(weeklyPlanMeals)
    .where(eq(weeklyPlanMeals.dishId, dishId))
    .limit(1);
  const [inOption] = await db
    .select({ id: weeklyPlanMealOptions.id })
    .from(weeklyPlanMealOptions)
    .where(eq(weeklyPlanMealOptions.dishId, dishId))
    .limit(1);
  if (inMeal || inOption) return 'in_use';

  await db.delete(dishes).where(eq(dishes.id, dishId));
  return 'deleted';
}

/** Confirms a dish is a SHARED dish (clinic_id null) — the only kind that may be hidden. */
async function isSharedDish(dishId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: dishes.id })
    .from(dishes)
    .where(and(eq(dishes.id, dishId), isNull(dishes.clinicId)))
    .limit(1);
  return row !== undefined;
}

export async function hideSharedDish(clinicId: string, dishId: string): Promise<boolean> {
  if (!(await isSharedDish(dishId))) return false;
  await db
    .insert(clinicHiddenDishes)
    .values({ clinicId, dishId })
    .onConflictDoNothing({ target: [clinicHiddenDishes.clinicId, clinicHiddenDishes.dishId] });
  return true;
}

export async function unhideSharedDish(clinicId: string, dishId: string): Promise<boolean> {
  await db
    .delete(clinicHiddenDishes)
    .where(and(eq(clinicHiddenDishes.clinicId, clinicId), eq(clinicHiddenDishes.dishId, dishId)));
  return true;
}

/**
 * Remembers that an Arabic name maps to a catalog food, for this clinic.
 *
 * Idempotent on (food, normalized name): confirming the same match twice is a
 * no-op, so callers can record freely.
 *
 * Scope comes from the food, not from a column here — an alias on a clinic's own
 * food is that clinic's, an alias on a shared food is everyone's. Which is why
 * this refuses to write against a food the clinic cannot see, and why it will not
 * add a synonym to a *shared* catalog row: one clinic's vocabulary must not become
 * every clinic's.
 */
export async function rememberFoodAlias(clinicId: string, foodId: string, nameAr: string): Promise<void> {
  const [food] = await db
    .select({ id: catalogFoods.id, clinicId: catalogFoods.clinicId })
    .from(catalogFoods)
    .where(eq(catalogFoods.id, foodId))
    .limit(1);

  if (!food || food.clinicId !== clinicId) return;

  await db
    .insert(catalogFoodAliases)
    .values({
      foodId,
      name: nameAr.trim(),
      normalizedName: normalizeArabic(nameAr),
      locale: 'ar',
    })
    .onConflictDoNothing({
      target: [catalogFoodAliases.foodId, catalogFoodAliases.normalizedName],
    });
}

/**
 * Creates a clinic's own custom catalog food.
 *
 * Numbers are the dietitian's — the one place nutrition is entered by hand rather
 * than copied from a named source, which is why the row is written
 * `source_type: 'clinic_entered'` and `verification_status: 'provisional'`. It is
 * private to the clinic and stays that way: nothing here can produce a shared row.
 *
 * Reuses an existing food rather than adding a duplicate, cheapest path first. The
 * old third path — matching a USDA row by exact English description — is gone with
 * the USDA cutover; the catalog is small and Arabic-first, so name matching over
 * what the clinic can actually see is both sufficient and safer.
 *
 * ⚠ App-level check-then-insert, so there is a narrow race between the lookups and
 * the insert under two simultaneous creates of the same name. Unchanged from
 * before, and still not worth closing for one dietitian saving one form.
 */
export async function createCustomFood(clinicId: string, input: CustomFoodInput): Promise<string | null> {
  const normalized = normalizeArabic(input.nameAr);
  // English name is optional; fall back to the Arabic name so `name_en` always
  // has a value.
  const nameEn = input.description.trim() || input.nameAr.trim();

  // 1. A food this clinic can already see under the same normalized Arabic name —
  //    its own, or a shared catalog entry. Re-typing "بندورة" must resolve to the
  //    catalog's tomato, not split the catalog.
  const visible = await db
    .select({
      id: catalogFoods.id,
      normalizedNameAr: catalogFoods.normalizedNameAr,
      normalizedNameEn: catalogFoods.normalizedNameEn,
    })
    .from(catalogFoods)
    .where(
      and(
        eq(catalogFoods.isActive, true),
        or(isNull(catalogFoods.clinicId), eq(catalogFoods.clinicId, clinicId)),
      ),
    );

  const nameMatch = visible.find(
    (row) => row.normalizedNameAr === normalized || row.normalizedNameEn === normalized,
  );
  if (nameMatch) return nameMatch.id;

  // 2. An alias, on any food this clinic can see, that already means this name.
  const [aliasMatch] = await db
    .select({ foodId: catalogFoodAliases.foodId })
    .from(catalogFoodAliases)
    .innerJoin(catalogFoods, eq(catalogFoods.id, catalogFoodAliases.foodId))
    .where(
      and(
        eq(catalogFoodAliases.normalizedName, normalized),
        eq(catalogFoods.isActive, true),
        or(isNull(catalogFoods.clinicId), eq(catalogFoods.clinicId, clinicId)),
      ),
    )
    .limit(1);
  if (aliasMatch) return aliasMatch.foodId;

  return db.transaction(async (tx) => {
    // A chosen household unit becomes one portion row, exactly as a shipped food's
    // portions are rows — so a clinic food and a catalog food behave identically in
    // the editor. Grams (or no unit) creates none: a grams-only food.
    const unit = input.unit && input.unit !== 'g' ? input.unit : null;

    const [food] = await tx
      .insert(catalogFoods)
      .values({
        clinicId,
        // Unique per clinic, and stable: two clinics may both add "لبن عيران".
        slug: `custom-${normalized.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40) || 'food'}-${Date.now().toString(36)}`,
        nameAr: input.nameAr.trim(),
        nameEn,
        normalizedNameAr: normalized,
        normalizedNameEn: normalizeArabic(nameEn),
        // The dietitian entered numbers, not a preparation. Claiming a state would
        // be asserting something about their food that nobody told us.
        state: 'prepared',
        category: 'other',
        kcal: input.kcal,
        protein: input.protein,
        carbs: input.carbs,
        fat: input.fat,
        verificationStatus: 'provisional',
        sourceType: 'clinic_entered',
        sourceRef: null,
        isActive: true,
      })
      .returning({ id: catalogFoods.id });

    if (!food) return null;

    await tx
      .insert(catalogFoodAliases)
      .values({
        foodId: food.id,
        name: input.nameAr.trim(),
        normalizedName: normalized,
        locale: 'ar',
      })
      .onConflictDoNothing();

    if (unit && input.unitGrams) {
      await tx.insert(catalogFoodPortions).values({
        foodId: food.id,
        ...CUSTOM_UNIT_LABELS[unit],
        grams: input.unitGrams,
        isDefault: true,
        sortOrder: 0,
        // No upstream reference: the weight is the dietitian's own, and claiming a
        // source would be attributing their number to somebody else.
        sourceRef: null,
      });
    }

    return food.id;
  });
}
