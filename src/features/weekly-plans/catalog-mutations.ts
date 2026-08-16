import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/db';
import {
  clinicHiddenDishes,
  dishes,
  dishIngredients,
  foodAliases,
  foods,
  weeklyPlanMealOptions,
  weeklyPlanMeals,
} from '@/db/schema';

import type { ClinicDishInput, CustomFoodInput } from './catalog-schema';

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

function ingredientRows(dishId: string, input: ClinicDishInput) {
  return input.ingredients.map((ingredient, index) => ({
    dishId,
    foodId: ingredient.foodId,
    quantityGrams: ingredient.quantityGrams,
    displayNameAr: ingredient.displayNameAr ?? null,
    householdLabel: ingredient.householdLabel ?? null,
    householdGrams: ingredient.householdGrams ?? null,
    sortOrder: index,
  }));
}

export async function createClinicDish(clinicId: string, input: ClinicDishInput): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [dish] = await tx
      .insert(dishes)
      .values({
        clinicId,
        slug: makeSlug(clinicId, input.nameEn),
        nameAr: input.nameAr,
        nameEn: input.nameEn,
        mealTypes: input.mealTypes,
        tags: input.tags,
        allergenTags: input.allergenTags,
        baseServingLabel: input.baseServingLabel,
      })
      .returning({ id: dishes.id });

    if (!dish) return null;
    await tx.insert(dishIngredients).values(ingredientRows(dish.id, input));
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

  await db.transaction(async (tx) => {
    await tx
      .update(dishes)
      .set({
        nameAr: input.nameAr,
        nameEn: input.nameEn,
        mealTypes: input.mealTypes,
        tags: input.tags,
        allergenTags: input.allergenTags,
        baseServingLabel: input.baseServingLabel,
        updatedAt: new Date(),
      })
      .where(eq(dishes.id, dishId));

    // Replace the recipe wholesale — simpler and less error-prone than diffing,
    // and a dish has a handful of rows.
    await tx.delete(dishIngredients).where(eq(dishIngredients.dishId, dishId));
    await tx.insert(dishIngredients).values(ingredientRows(dishId, input));
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
 * Remembers that an Arabic name maps to a library food, for this clinic.
 *
 * Idempotent on (clinic, name): confirming the same match twice is a no-op, so
 * callers can record freely.
 */
export async function rememberFoodAlias(clinicId: string, foodId: string, nameAr: string): Promise<void> {
  await db
    .insert(foodAliases)
    .values({ clinicId, foodId, nameAr })
    .onConflictDoNothing({ target: [foodAliases.clinicId, foodAliases.nameAr] });
}

/**
 * Creates a clinic's own custom food.
 *
 * Numbers are the dietitian's (or an AI estimate she confirmed) — the one place
 * nutrition is entered by hand rather than read from the USDA library. Records
 * the Arabic name it was created under as an alias, so it resolves instantly next
 * time.
 */
export async function createCustomFood(clinicId: string, input: CustomFoodInput): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [food] = await tx
      .insert(foods)
      .values({
        clinicId,
        fdcId: null,
        description: input.description,
        nameAr: input.nameAr,
        category: 'Clinic custom',
        kcal: input.kcal,
        protein: input.protein,
        carbs: input.carbs,
        fat: input.fat,
      })
      .returning({ id: foods.id });

    if (!food) return null;
    await tx
      .insert(foodAliases)
      .values({ clinicId, foodId: food.id, nameAr: input.nameAr })
      .onConflictDoNothing({ target: [foodAliases.clinicId, foodAliases.nameAr] });
    return food.id;
  });
}
