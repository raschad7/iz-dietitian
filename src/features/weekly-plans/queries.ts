import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  ne,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

import { db } from '@/db';
import {
  clientNutritionProfiles,
  clients,
  appointments,
  catalogFoodAliases,
  catalogFoodPortions,
  catalogFoods,
  clinicHiddenDishes,
  dishIngredients,
  dishes,
  weeklyPlanMealIngredients,
  weeklyPlanMealOptions,
  weeklyPlanMealSides,
  weeklyPlanMeals,
  weeklyPlanReviews,
  weeklyPlans,
  type MealSlot,
} from '@/db/schema';
import { wallClockIn, type WallClock } from '@/features/booking/completed';
import { calculateAge } from '@/features/clients/age';
import { clientSeq } from '@/features/clients/seq';
import { DISPLAY_TIME_ZONE } from '@/lib/format';

import { normalizeArabic } from './arabic-normalize';
import { matchesOwner, type OwnerFilter } from './catalog-ownership';
import { carbBase, proteinSource } from './dish-composition';
import type { ReviewFinding } from './review';
import type { CatalogDish } from './generate';
import type { FoodPortion } from './ingredient-units';
import {
  hasOwnAmounts,
  mealIngredientLines,
  mealTotals,
  scaleRecipe,
  type MealIngredientLine,
  type SideRecipe,
} from './meal-ingredients';
import {
  baseServingKcal,
  combineTotals,
  dishTotals,
  emptyTotals,
  nutritionCategory,
  type DishDetail,
  type FoodNutrients,
  type NutrientTotals,
  type NutritionCategory,
} from './nutrition';
import { readMealSnapshot, requiresFrozenNutrition, resolveMealNutrition } from './nutrition-snapshot';
import { findSimilar, type SimilarMatch } from './similar';
import { slotFillKey, type SlotFill } from './skeleton';
import {
  DAYS_OF_WEEK,
  DEFAULT_MEAL_SCHEDULE,
  mealScheduleSchema,
  mealTypeForSlot,
  planIdSchema,
  toTimeInput,
  type MealScheduleInput,
} from './schema';
import { slotBudgets, suggestProteinGrams, suggestTargets, type SlotBudget, type SuggestedTargets } from './targets';
import { weekDates } from './week';

/**
 * Reads for the weekly-plans feature.
 *
 * Imports nothing from Next.js, so every function here can be called from a test
 * or a script. `clinicId` is a required first argument on everything that touches
 * a plan or a profile, so forgetting the tenant scope is a type error rather than
 * a silent leak — the same rule V1 follows.
 */

/**
 * Anything a read can run on: the pool, or an open transaction.
 *
 * Only `loadDishesByIds` takes one today, so `publishPlan` can freeze nutrition on
 * the same connection that flips the status. Spelled out from `db.transaction`'s
 * own callback parameter rather than imported, which is the idiom already used in
 * `editor-mutations.ts`.
 */
export type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * A `text[]` literal with each element bound as a parameter.
 *
 * Interpolating a JS array straight into a `sql` template hands PostgreSQL a
 * comma-joined string, which `array_in` rejects with "Array value must start with
 * {". Building `ARRAY[$1, $2]::text[]` keeps every value parameterised — so this is
 * about correctness first and injection safety second.
 */
function textArray(values: readonly string[]): SQL {
  return sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`;
}

/**
 * The columns making up a food's composition, shared by the readers below.
 *
 * `catalog_foods` is the only food table now. Both names are stored and both come
 * through, so `food-display.ts` chooses one by locale rather than deriving either.
 */
const foodColumns = {
  id: catalogFoods.id,
  nameAr: catalogFoods.nameAr,
  nameEn: catalogFoods.nameEn,
  /** Null for a shared catalog food — what tells "my clinic added this" from the shipped set. */
  clinicId: catalogFoods.clinicId,
  /** `raw` | `cooked` | `dry` | … — kept distinct, never merged. */
  state: catalogFoods.state,
  category: catalogFoods.category,
  verificationStatus: catalogFoods.verificationStatus,
  kcal: catalogFoods.kcal,
  protein: catalogFoods.protein,
  carbs: catalogFoods.carbs,
  fat: catalogFoods.fat,
  fiber: catalogFoods.fiber,
  sugar: catalogFoods.sugar,
  saturatedFat: catalogFoods.saturatedFat,
  sodium: catalogFoods.sodium,
  cholesterol: catalogFoods.cholesterol,
  calcium: catalogFoods.calcium,
  iron: catalogFoods.iron,
  potassium: catalogFoods.potassium,
} as const;

/** The portion columns, joined onto a recipe line to say how its amount was typed. */
const portionColumns = {
  id: catalogFoodPortions.id,
  labelAr: catalogFoodPortions.labelAr,
  labelEn: catalogFoodPortions.labelEn,
  grams: catalogFoodPortions.grams,
} as const;

/**
 * Every portion belonging to a set of foods, grouped by food.
 *
 * A second query rather than a join on the food select: a food with three portions
 * would otherwise come back three times and every caller would have to fold it
 * back, and the picker's twenty results are one small extra round trip.
 *
 * Visibility needs no check of its own — a portion is reachable only through a food
 * the caller already scoped, which is the reason the table carries no `clinic_id`.
 */
async function portionsByFood(
  foodIds: readonly string[],
  executor: DbExecutor = db,
): Promise<Map<string, FoodPortion[]>> {
  const byFood = new Map<string, FoodPortion[]>();
  if (!foodIds.length) return byFood;

  const rows = await executor
    .select({
      foodId: catalogFoodPortions.foodId,
      id: catalogFoodPortions.id,
      labelAr: catalogFoodPortions.labelAr,
      labelEn: catalogFoodPortions.labelEn,
      grams: catalogFoodPortions.grams,
      isDefault: catalogFoodPortions.isDefault,
      sortOrder: catalogFoodPortions.sortOrder,
    })
    .from(catalogFoodPortions)
    .where(inArray(catalogFoodPortions.foodId, [...foodIds]))
    .orderBy(asc(catalogFoodPortions.sortOrder), asc(catalogFoodPortions.labelEn));

  for (const { foodId, ...portion } of rows) {
    const bucket = byFood.get(foodId);
    if (bucket) bucket.push(portion);
    else byFood.set(foodId, [portion]);
  }

  return byFood;
}

/** One recipe line as the bulk dish readers select it: the food, and how it was typed. */
const recipeColumns = {
  dishId: dishIngredients.dishId,
  quantityGrams: dishIngredients.quantityGrams,
  portionQuantity: dishIngredients.portionQuantity,
  isPrimary: dishIngredients.isPrimary,
  isFree: dishIngredients.isFree,
  sortOrder: dishIngredients.sortOrder,
  portion: portionColumns,
  food: foodColumns,
} as const;

type RecipeRow = {
  dishId: string;
  quantityGrams: number;
  portionQuantity: number | null;
  /** Whether this line carries a `−/+` control on the board. */
  isPrimary: boolean;
  /** Written without a number and never scaled — شرائح خضار. */
  isFree: boolean;
  sortOrder: number;
  /**
   * Null when the line was entered in grams, or when the portion it was entered in
   * has since been retired — `dish_ingredients.portion_id` is `on delete set null`,
   * and the `left join` then finds nothing. Both cases mean the same thing to a
   * reader: show the grams.
   */
  portion: { id: string; labelAr: string; labelEn: string; grams: number } | null;
  food: Omit<FoodSearchResult, 'portions'>;
};

/**
 * The amounts a dietitian set by hand, for a set of meals, grouped by meal.
 *
 * Absent for almost every meal, and that absence is the normal case: a meal has
 * rows here only once someone has moved one of its ingredients. `mealIngredientLines`
 * treats an empty bucket and a missing one identically, so no caller has to.
 *
 * Read through the same `foodColumns` / `portionColumns` the recipe readers use, so
 * a hand-set line and a scaled recipe line arrive in the same shape and the code
 * downstream cannot tell — or need to tell — which it is holding.
 */
export async function ownAmountsByMeal(
  mealIds: readonly string[],
  executor: DbExecutor = db,
): Promise<Map<string, MealIngredientLine[]>> {
  const byMeal = new Map<string, MealIngredientLine[]>();
  if (!mealIds.length) return byMeal;

  const rows = await executor
    .select({
      mealId: weeklyPlanMealIngredients.mealId,
      quantityGrams: weeklyPlanMealIngredients.quantityGrams,
      portionQuantity: weeklyPlanMealIngredients.portionQuantity,
      isPrimary: weeklyPlanMealIngredients.isPrimary,
      sortOrder: weeklyPlanMealIngredients.sortOrder,
      portion: portionColumns,
      food: foodColumns,
    })
    .from(weeklyPlanMealIngredients)
    .innerJoin(catalogFoods, eq(catalogFoods.id, weeklyPlanMealIngredients.catalogFoodId))
    .leftJoin(catalogFoodPortions, eq(catalogFoodPortions.id, weeklyPlanMealIngredients.portionId))
    .where(inArray(weeklyPlanMealIngredients.mealId, [...mealIds]))
    .orderBy(asc(weeklyPlanMealIngredients.sortOrder));

  for (const { mealId, ...row } of rows) {
    // Stored rows are always the main: `mealIngredientLines` keeps sides out of
    // this table entirely, so a materialised meal has nothing to attribute.
    const line: MealIngredientLine = { ...row, side: null };
    const bucket = byMeal.get(mealId);
    if (bucket) bucket.push(line);
    else byMeal.set(mealId, [line]);
  }

  return byMeal;
}

/**
 * The sides attached to each meal, with the recipe each contributes.
 *
 * Takes an executor for the same reason `loadDishesByIds` does: publishing freezes
 * a plan inside one transaction, and a side read outside it would be a row from
 * before the transaction started.
 */
export async function sidesByMealId(
  mealIds: readonly string[],
  executor: DbExecutor = db,
): Promise<Map<string, SideRecipe[]>> {
  const byMeal = new Map<string, SideRecipe[]>();
  if (!mealIds.length) return byMeal;

  const rows = await executor
    .select({ mealId: weeklyPlanMealSides.mealId, dishId: weeklyPlanMealSides.dishId })
    .from(weeklyPlanMealSides)
    .where(inArray(weeklyPlanMealSides.mealId, [...mealIds]))
    .orderBy(asc(weeklyPlanMealSides.sortOrder));

  if (!rows.length) return byMeal;

  const dishes = await loadDishesByIds([...new Set(rows.map((row) => row.dishId))], executor);
  const dishById = new Map(dishes.map((dish) => [dish.id, dish]));

  for (const row of rows) {
    const dish = dishById.get(row.dishId);
    if (!dish) continue;

    const entry: SideRecipe = { id: dish.id, nameAr: dish.nameAr, recipe: dish.ingredients };
    const bucket = byMeal.get(row.mealId);
    if (bucket) bucket.push(entry);
    else byMeal.set(row.mealId, [entry]);
  }

  return byMeal;
}

/** Folds recipe rows onto their dishes, preserving the query's ordering. */
function attachRecipes<D extends { id: string }>(
  dishRows: readonly D[],
  ingredientRows: readonly RecipeRow[],
): (D & { ingredients: DishDetail['ingredients'] })[] {
  const byDish = new Map<string, DishDetail['ingredients']>();

  for (const row of ingredientRows) {
    const ingredient = {
      quantityGrams: row.quantityGrams,
      food: row.food,
      portion: row.portion,
      portionQuantity: row.portionQuantity,
      isPrimary: row.isPrimary,
      isFree: row.isFree,
      sortOrder: row.sortOrder,
    };

    const bucket = byDish.get(row.dishId);
    if (bucket) bucket.push(ingredient);
    else byDish.set(row.dishId, [ingredient]);
  }

  return dishRows.map((dish) => ({ ...dish, ingredients: byDish.get(dish.id) ?? [] }));
}

/**
 * One stored synonym for a food, with the language it is written in.
 *
 * Aliases are **search-only** — a food is always displayed under its canonical
 * name — but which language a synonym is written in decides which of the picker's
 * two lists the food it found belongs in. See `ingredient-refine.ts`.
 */
export type FoodAlias = {
  foodId: string;
  name: string;
  /** `normalizeArabic(name)`, the form search matched against. */
  normalizedName: string;
  /** `ar` | `en`. */
  locale: string;
};

/**
 * Every alias carried by a set of foods, grouped by food.
 *
 * Read after the search rather than joined into it, for the same reason
 * {@link portionsByFood} is: a food with four synonyms must come back once, and a
 * join would multiply the row and fight the ordering. Needs no visibility check of
 * its own — the food ids handed in have already been scoped.
 */
export async function loadFoodAliases(
  foodIds: readonly string[],
): Promise<Map<string, FoodAlias[]>> {
  const byFood = new Map<string, FoodAlias[]>();
  const ids = [...new Set(foodIds)];
  if (!ids.length) return byFood;

  const rows = await db
    .select({
      foodId: catalogFoodAliases.foodId,
      name: catalogFoodAliases.name,
      normalizedName: catalogFoodAliases.normalizedName,
      locale: catalogFoodAliases.locale,
    })
    .from(catalogFoodAliases)
    .where(inArray(catalogFoodAliases.foodId, ids));

  for (const row of rows) {
    const bucket = byFood.get(row.foodId);
    if (bucket) bucket.push(row);
    else byFood.set(row.foodId, [row]);
  }

  return byFood;
}

/** Attaches each food's portions to a list of search results. */
async function withPortions(
  foods: readonly Omit<FoodSearchResult, 'portions'>[],
): Promise<FoodSearchResult[]> {
  const byFood = await portionsByFood(foods.map((food) => food.id));
  return foods.map((food) => ({ ...food, portions: byFood.get(food.id) ?? [] }));
}

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------

/**
 * The whole active catalog, with recipes.
 *
 * Loaded in full rather than per-dish: 76 dishes and ~300 ingredient rows is two
 * queries and a few milliseconds, and every caller — generation, the board, the
 * swap panel — needs the same set. Fetching per meal would be 35 round trips to
 * render one page.
 *
 * `allergens` filters in SQL. This is the only allergen gate that matters: a dish
 * excluded here never reaches the model, the prompt, or the UI.
 */
export async function loadCatalog(
  clinicId: string,
  allergens: readonly string[] = [],
): Promise<DishDetail[]> {
  // Dishes hidden by this clinic — read first so the main query can exclude them.
  const hidden = await db
    .select({ dishId: clinicHiddenDishes.dishId })
    .from(clinicHiddenDishes)
    .where(eq(clinicHiddenDishes.clinicId, clinicId));
  const hiddenIds = hidden.map((row) => row.dishId);

  const conditions: SQL[] = [
    eq(dishes.isActive, true),
    // Shared (unowned) dishes, or this clinic's own — never another clinic's.
    or(isNull(dishes.clinicId), eq(dishes.clinicId, clinicId))!,
  ];

  if (hiddenIds.length) {
    conditions.push(notInArray(dishes.id, hiddenIds));
  }

  if (allergens.length) {
    // `&&` is the array-overlap operator: true when the dish carries ANY of the
    // client's allergens. Negated, so only clean dishes survive.
    conditions.push(sql`not (${dishes.allergenTags} && ${textArray(allergens)})`);
  }

  const dishRows = await db
    .select({
      id: dishes.id,
      clinicId: dishes.clinicId,
      slug: dishes.slug,
      nameAr: dishes.nameAr,
      nameEn: dishes.nameEn,
      mealTypes: dishes.mealTypes,
      tags: dishes.tags,
      source: dishes.source,
      effort: dishes.effort,
      cost: dishes.cost,
      occasion: dishes.occasion,
      isSide: dishes.isSide,
      allergenTags: dishes.allergenTags,
      baseServingLabel: dishes.baseServingLabel,
      isActive: dishes.isActive,
    })
    .from(dishes)
    .where(and(...conditions))
    .orderBy(asc(dishes.slug));

  if (!dishRows.length) return [];

  const ingredientRows = await db
    .select(recipeColumns)
    .from(dishIngredients)
    .innerJoin(catalogFoods, eq(catalogFoods.id, dishIngredients.catalogFoodId))
    .leftJoin(catalogFoodPortions, eq(catalogFoodPortions.id, dishIngredients.portionId))
    .where(
      inArray(
        dishIngredients.dishId,
        dishRows.map((dish) => dish.id),
      ),
    )
    .orderBy(asc(dishIngredients.sortOrder));

  return attachRecipes(dishRows, ingredientRows);
}

/**
 * Dishes by id, regardless of `is_active`.
 *
 * The board must render a plan as it was written. `loadCatalog` filters retired
 * dishes because nothing new should be built from one, but a plan that already
 * holds one would otherwise show a blank card and count it toward the unfilled
 * total that gates publishing — punishing the dietitian for a catalog change they
 * did not make. `dishes.is_active` says as much itself: retired dishes stay for the
 * plans that reference them.
 */
export async function loadDishesByIds(
  ids: readonly string[],
  /**
   * The connection to read on. Defaults to the pool.
   *
   * `publishPlan` freezes each meal's nutrition inside the transaction that flips
   * the status, and it must read the recipes on that same connection or it would
   * be snapshotting rows from outside its own transaction. Passing the executor in
   * is what lets publishing reuse this exact loader — and therefore the exact
   * nutrition path the board uses — rather than growing a second one.
   */
  executor: DbExecutor = db,
): Promise<DishDetail[]> {
  if (!ids.length) return [];

  const dishRows = await executor
    .select({
      id: dishes.id,
      clinicId: dishes.clinicId,
      slug: dishes.slug,
      nameAr: dishes.nameAr,
      nameEn: dishes.nameEn,
      mealTypes: dishes.mealTypes,
      tags: dishes.tags,
      source: dishes.source,
      effort: dishes.effort,
      cost: dishes.cost,
      occasion: dishes.occasion,
      isSide: dishes.isSide,
      allergenTags: dishes.allergenTags,
      baseServingLabel: dishes.baseServingLabel,
      isActive: dishes.isActive,
    })
    .from(dishes)
    .where(inArray(dishes.id, [...ids]))
    .orderBy(asc(dishes.slug));

  if (!dishRows.length) return [];

  const ingredientRows = await executor
    .select(recipeColumns)
    .from(dishIngredients)
    .innerJoin(catalogFoods, eq(catalogFoods.id, dishIngredients.catalogFoodId))
    .leftJoin(catalogFoodPortions, eq(catalogFoodPortions.id, dishIngredients.portionId))
    .where(
      inArray(
        dishIngredients.dishId,
        dishRows.map((dish) => dish.id),
      ),
    )
    .orderBy(asc(dishIngredients.sortOrder));

  return attachRecipes(dishRows, ingredientRows);
}

/**
 * The catalog reduced to what generation needs: identity, tags, and energy per
 * serving.
 *
 * **Sides are dropped here.** صحن سلطة is not a dinner, and a dish that belongs
 * beside a meal must never be offered as one — not as a main and not as an
 * alternative. They reach a plan through `weekly_plan_meal_sides` instead, which
 * is a different question asked at a different point.
 */
export function toPromptCatalog(catalog: readonly DishDetail[]): CatalogDish[] {
  return catalog.filter((dish) => !dish.isSide).map(toCatalogDish);
}

/**
 * The other half of the same catalog: what may stand *beside* a meal.
 *
 * Same shape, asked a different question. Kept as its own list rather than a flag
 * the caller has to remember to check, because every place that reads the catalog
 * is choosing a meal, and the one place that is not should have to say so.
 */
export function toPromptSides(catalog: readonly DishDetail[]): CatalogDish[] {
  return catalog.filter((dish) => dish.isSide).map(toCatalogDish);
}

function toCatalogDish(dish: DishDetail): CatalogDish {
  return {
    id: dish.id,
    slug: dish.slug,
    nameAr: dish.nameAr,
    mealTypes: dish.mealTypes,
    tags: dish.tags,
    source: dish.source,
    effort: dish.effort,
    cost: dish.cost,
    occasion: dish.occasion,
    allergenTags: dish.allergenTags,
    baseKcal: baseServingKcal(dish.ingredients),
    baseProtein: dishTotals(dish.ingredients, 1).protein.value,
    // Carried for `chooseServings`, which has to portion a recipe to know what a
    // multiplier produces. Never reaches the model: `describeCatalog` writes the
    // columns it wants by name.
    recipe: dish.ingredients,
    // Computed here, sent to the model as a fact rather than a question — kept
    // separate from `tags`, which stay purely practical.
    nutritionCategory: nutritionCategory(dishTotals(dish.ingredients, 1)),
    // What repeats when a week feels repetitive. Derived from the recipe for the
    // same reason the nutrition label is: a tag someone types can disagree with
    // the food, and this one has to be able to carry a rule.
    proteinSource: proteinSource(dish.ingredients),
    carbBase: carbBase(dish.ingredients),
  };
}

export type CatalogEntry = DishDetail & {
  /** Energy for one base serving, so the panel can rank by fit. */
  baseKcal: number;
  /**
   * The dish's computed nutrition label (`high_protein` | `high_carb` |
   * `high_fat` | `balanced`), derived from the recipe — never a stored tag. This
   * is what the "high protein" filter matches, so the filter and the badge can
   * never disagree, and no dish can be hand-tagged into a nutrition claim.
   */
  nutritionCategory: NutritionCategory;
  /**
   * The client's allergens this dish carries. Empty for a dish they can eat.
   *
   * Carried rather than filtered out: a dietitian searching for a dish they know
   * exists and finding nothing concludes the catalog is broken. Shown, disabled,
   * and labelled with the reason is the honest presentation — and the write path
   * refuses it regardless, because `loadCatalog(allergens)` never offered it.
   */
  blockedBy: string[];
};

/**
 * The whole active catalog, costed, marked against one client's allergens.
 *
 * Ingredients travel with it because the board recomputes totals optimistically
 * from the same arithmetic the server uses — without them, dropping a dish would
 * have to guess at the numbers or wait for a round trip.
 */
export async function listCatalogForBoard(
  clinicId: string,
  allergens: readonly string[],
): Promise<CatalogEntry[]> {
  const catalog = await loadCatalog(clinicId);
  const blocked = new Set(allergens);

  return catalog
    .map((dish) => ({
      ...dish,
      baseKcal: baseServingKcal(dish.ingredients),
      nutritionCategory: nutritionCategory(dishTotals(dish.ingredients, 1)),
      blockedBy: dish.allergenTags.filter((tag) => blocked.has(tag)),
    }))
    .sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'));
}

export type DishListResult = {
  items: (DishDetail & { baseKcal: number; totals: NutrientTotals; hidden: boolean })[];
  total: number;
  page: number;
  pageCount: number;
};

/** One clinic dish, in the exact shape the editor preloads its fields from. */
export type DishEditData = {
  id: string;
  nameAr: string;
  nameEn: string;
  baseServingLabel: string;
  mealTypes: string[];
  tags: string[];
  allergenTags: string[];
  ingredients: {
    /** Carries the food's whole portion menu, so the editor can rebuild the unit list. */
    food: FoodSearchResult;
    quantityGrams: number;
    /** The portion the amount was saved in, or null for grams. */
    portionId: string | null;
  }[];
};

export const DISHES_PAGE_SIZE = 20;

export type DishNameSuggestion = {
  id: string;
  nameAr: string;
  nameEn: string;
  /** Shared/system dish when null, otherwise a dish owned by this clinic. */
  clinicId: string | null;
};

/**
 * Lightweight prefix matches for the add-dish name field.
 *
 * This deliberately does not call `listDishes`: that reader loads every recipe
 * and computes nutrition because the catalog needs those values, while this
 * interaction only needs enough identity to warn about an existing name. The
 * left join applies the same visible-catalog boundary — active shared dishes the
 * clinic has not hidden, plus this clinic's own dishes — without exposing another
 * clinic's names.
 */
export async function searchDishNameSuggestions(input: {
  clinicId: string;
  query: string;
  excludeDishId?: string;
  limit?: number;
}): Promise<DishNameSuggestion[]> {
  const term = normalizeArabic(input.query.trim());
  if (term.length < 2) return [];

  const visibleNames = await db
    .select({
      id: dishes.id,
      nameAr: dishes.nameAr,
      nameEn: dishes.nameEn,
      clinicId: dishes.clinicId,
    })
    .from(dishes)
    .leftJoin(
      clinicHiddenDishes,
      and(
        eq(clinicHiddenDishes.dishId, dishes.id),
        eq(clinicHiddenDishes.clinicId, input.clinicId),
      ),
    )
    .where(
      and(
        eq(dishes.isActive, true),
        or(isNull(dishes.clinicId), eq(dishes.clinicId, input.clinicId)),
        isNull(clinicHiddenDishes.id),
        input.excludeDishId ? ne(dishes.id, input.excludeDishId) : undefined,
      ),
    );

  return visibleNames
    .filter(
      (dish) =>
        normalizeArabic(dish.nameAr).startsWith(term) ||
        normalizeArabic(dish.nameEn).startsWith(term),
    )
    .sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'))
    .slice(0, Math.max(1, Math.min(input.limit ?? 5, 10)));
}

/**
 * The browsable catalog — one clinic's visible dishes, searched and paginated.
 *
 * Filtered and paged **in memory over `loadCatalog`**, not by a second SQL query.
 * `loadCatalog` already returns exactly what this clinic may see — shared dishes
 * it has not hidden, plus its own, active only — and this function loaded the
 * whole thing regardless to cost each dish. The previous version counted and
 * paged with an *unscoped* query over `dishes`, so the total was inflated by
 * every other clinic's dishes and by this clinic's hidden ones, and a page could
 * come back short once the visibility intersection removed rows the offset had
 * already claimed. Driving both the count and the window off the visible set
 * keeps them honest.
 *
 * Search is normalized the same way the ingredient search is (`normalizeArabic`),
 * so a dietitian who types `ارز` finds a dish stored as `أرز`. Both names and the
 * slug are matched, because she will search in whichever language is to hand.
 */
export async function listDishes(input: {
  clinicId: string;
  q?: string;
  mealType?: string;
  /** Practical tags to require (AND) — the catalog toolbar's tag chips. */
  tags?: readonly string[];
  /** Keep only dishes whose computed nutrition category is `high_protein`. */
  highProtein?: boolean;
  /** Ownership filter: shared/system dishes, the clinic's own, or (undefined) all. */
  owner?: OwnerFilter;
  page: number;
  /**
   * List the shared dishes this clinic has hidden — and *only* those, flagged
   * `hidden`, so they can be brought back.
   *
   * A separate view rather than a wider one. It used to mean "also include the
   * hidden ones", which mixed them into the normal catalog: a dietitian who
   * turned it on to find one dish she had put away got her whole catalog back
   * with a handful of dimmed rows scattered through it, and had to hunt for the
   * grey ones. The question being asked is "what have I hidden", and the answer
   * to that question is a list of hidden dishes.
   *
   * Every other filter still composes with it, because the hidden set is a
   * catalog like any other — it can be searched, and narrowed by meal or tag.
   */
  hiddenOnly?: boolean;
}): Promise<DishListResult> {
  // One load or the other, never both: the two sets are disjoint views of the
  // same shelf and nothing here has to merge them any more.
  const catalog = input.hiddenOnly
    ? (await loadHiddenSharedDishes(input.clinicId)).map((dish) => ({ ...dish, hidden: true }))
    : (await loadCatalog(input.clinicId)).map((dish) => ({ ...dish, hidden: false }));

  const term = input.q?.trim() ? normalizeArabic(input.q) : null;
  const tags = input.tags ?? [];

  const filtered = catalog
    .filter((dish) => {
      // Ownership first — shared vs the clinic's own — so it composes with every
      // other filter and with pagination. See `catalog-ownership.ts`.
      if (!matchesOwner(dish.clinicId, input.owner)) return false;
      if (input.mealType && !dish.mealTypes.includes(input.mealType)) return false;
      // AND, like the planner's catalog filter: each extra tag narrows.
      if (tags.length && !tags.every((tag) => dish.tags.includes(tag))) return false;
      // Computed from the recipe, never a stored tag — the filter can't disagree
      // with the dish's own numbers. See `nutritionCategory`.
      if (input.highProtein && nutritionCategory(dishTotals(dish.ingredients, 1)) !== 'high_protein') {
        return false;
      }
      if (!term) return true;
      return (
        normalizeArabic(dish.nameAr).includes(term) ||
        normalizeArabic(dish.nameEn).includes(term) ||
        normalizeArabic(dish.slug).includes(term)
      );
    })
    .sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'));

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / DISHES_PAGE_SIZE));

  /*
   * Clamped, not trusted. A page number can outlive the list it was written
   * for — a bookmarked `?page=4`, a shared link, the back button after a
   * filter narrowed the catalog — and a window past the end returns no rows at
   * all. Landing on the last real page instead shows the reader the end of the
   * list they asked for, the nearest true answer to the request.
   */
  const currentPage = Math.min(Math.max(input.page, 1), pageCount);
  const start = (currentPage - 1) * DISHES_PAGE_SIZE;

  const items = filtered.slice(start, start + DISHES_PAGE_SIZE).map((dish) => ({
    ...dish,
    baseKcal: baseServingKcal(dish.ingredients),
    totals: dishTotals(dish.ingredients, 1),
  }));

  return { items, total, page: currentPage, pageCount };
}

/**
 * The shared dishes this clinic has hidden, with recipes — the complement of
 * what `loadCatalog` filters out. Only used to offer "unhide" from the catalog;
 * generation never sees these.
 */
async function loadHiddenSharedDishes(clinicId: string): Promise<DishDetail[]> {
  const hidden = await db
    .select({ dishId: clinicHiddenDishes.dishId })
    .from(clinicHiddenDishes)
    .where(eq(clinicHiddenDishes.clinicId, clinicId));

  return loadDishesByIds(hidden.map((row) => row.dishId));
}

/**
 * One clinic-owned dish, everything the editor needs to reopen it.
 *
 * Owner-scoped: returns null for a shared dish or another clinic's, so the edit
 * path cannot preload — let alone save over — a dish this clinic does not own.
 *
 * Unlike `loadCatalog` this carries each food's **whole portion menu**, not just the
 * one portion the line was saved in: the editor has to offer every unit the food
 * supports, and reopening a dish must not silently narrow the list to what was
 * chosen last time.
 */
export async function getClinicDishForEdit(clinicId: string, dishId: string): Promise<DishEditData | null> {
  const [dish] = await db
    .select({
      id: dishes.id,
      nameAr: dishes.nameAr,
      nameEn: dishes.nameEn,
      baseServingLabel: dishes.baseServingLabel,
      mealTypes: dishes.mealTypes,
      tags: dishes.tags,
      source: dishes.source,
      effort: dishes.effort,
      cost: dishes.cost,
      occasion: dishes.occasion,
      isSide: dishes.isSide,
      allergenTags: dishes.allergenTags,
    })
    .from(dishes)
    .where(and(eq(dishes.id, dishId), eq(dishes.clinicId, clinicId)))
    .limit(1);

  if (!dish) return null;

  const rows = await db
    .select({
      quantityGrams: dishIngredients.quantityGrams,
      portionId: dishIngredients.portionId,
      food: foodColumns,
    })
    .from(dishIngredients)
    .innerJoin(catalogFoods, eq(catalogFoods.id, dishIngredients.catalogFoodId))
    .where(eq(dishIngredients.dishId, dishId))
    .orderBy(asc(dishIngredients.sortOrder));

  const byFood = await portionsByFood(rows.map((row) => row.food.id));

  return {
    ...dish,
    ingredients: rows.map((row) => ({
      food: { ...row.food, portions: byFood.get(row.food.id) ?? [] },
      quantityGrams: row.quantityGrams,
      portionId: row.portionId,
    })),
  };
}

/** A dish opened in the catalog's read-only detail drawer. */
export type DishDetailView = {
  id: string;
  /** Null for a shared/system dish — what tells the drawer whether to offer Edit. */
  clinicId: string | null;
  nameAr: string;
  nameEn: string;
  mealTypes: string[];
  tags: string[];
  allergenTags: string[];
  baseServingLabel: string;
  /** Computed here so the drawer never sums nutrition itself. */
  totals: NutrientTotals;
  baseKcal: number;
  ingredients: DishDetail['ingredients'];
};

/**
 * One dish for the catalog detail drawer, any dish this clinic can see.
 *
 * Unlike `getClinicDishForEdit` this is **not** owner-scoped — a dietitian may
 * open a shared/system dish to read it, they just cannot edit it. Scoped to
 * shared-or-own so it never reaches another clinic's dish. Each line carries the
 * portion it was entered in, so the drawer can show "1 كوب" rather than "158 غرام",
 * and falls back to grams when there is none.
 */
export async function getDishDetailForClinic(
  clinicId: string,
  dishId: string,
): Promise<DishDetailView | null> {
  const [dish] = await db
    .select({
      id: dishes.id,
      clinicId: dishes.clinicId,
      nameAr: dishes.nameAr,
      nameEn: dishes.nameEn,
      mealTypes: dishes.mealTypes,
      tags: dishes.tags,
      source: dishes.source,
      effort: dishes.effort,
      cost: dishes.cost,
      occasion: dishes.occasion,
      isSide: dishes.isSide,
      allergenTags: dishes.allergenTags,
      baseServingLabel: dishes.baseServingLabel,
    })
    .from(dishes)
    .where(and(eq(dishes.id, dishId), or(isNull(dishes.clinicId), eq(dishes.clinicId, clinicId))))
    .limit(1);

  if (!dish) return null;

  const rows = await db
    .select(recipeColumns)
    .from(dishIngredients)
    .innerJoin(catalogFoods, eq(catalogFoods.id, dishIngredients.catalogFoodId))
    .leftJoin(catalogFoodPortions, eq(catalogFoodPortions.id, dishIngredients.portionId))
    .where(eq(dishIngredients.dishId, dishId))
    .orderBy(asc(dishIngredients.sortOrder));

  const [assembled] = attachRecipes([{ id: dishId }], rows);
  const ingredients = assembled?.ingredients ?? [];
  const totals = dishTotals(ingredients, 1);

  return { ...dish, ingredients, totals, baseKcal: totals.kcal.value };
}

export async function listMealTypes(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ mealType: sql<string>`unnest(${dishes.mealTypes})` })
    .from(dishes)
    .where(eq(dishes.isActive, true));

  return rows.map((row) => row.mealType).sort();
}

export type FoodSearchResult = {
  id: string;
  /** Both stored, neither derived. The reader's locale picks one; see `food-display.ts`. */
  nameAr: string;
  nameEn: string;
  /** Null for a shared catalog food, set for one this clinic added. */
  clinicId: string | null;
  /** `raw` | `cooked` | `dry` | … Raw and cooked are separate foods, never merged. */
  state: string;
  category: string;
  verificationStatus: string;
  /** Every household measure this food offers, in menu order. Empty means grams only. */
  portions: FoodPortion[];
} & FoodNutrients;

/** Shared catalog foods plus this clinic's own. Never another clinic's, never inactive. */
function catalogVisibleTo(clinicId: string): SQL {
  return and(
    eq(catalogFoods.isActive, true),
    or(isNull(catalogFoods.clinicId), eq(catalogFoods.clinicId, clinicId))!,
  )!;
}

/**
 * Ingredient search over the canonical catalog.
 *
 * Matches the stored Arabic name, the stored English name, and any stored alias —
 * all on their normalized forms, so "ارز ابيض" finds "أرز أبيض" and "طماطم" finds
 * بندورة. The normalization happens at write time (`normalized_name_ar` /
 * `normalized_name_en` / `catalog_food_aliases.normalized_name`), which is what
 * makes this an indexed SQL predicate instead of the whole-table load into JS the
 * old clinic-food search needed.
 *
 * **USDA is not reachable from here.** The old path searched 7,793 SR Legacy rows
 * by English description and then guessed an Arabic label back out of them, which
 * is how a search for بيض could return 94 rows including `Eggplant, raw`, and how
 * restaurant meals, baby food and alcohol were one substring away from a meal plan.
 * The catalog is the only source now; `foods` stays as an internal reference.
 */
export async function searchFoods(
  clinicId: string,
  query: string,
  limit = 20,
): Promise<FoodSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const term = `%${normalizeArabic(trimmed).replace(/[\\%_]/g, '\\$&')}%`;

  // `exists` rather than a join: a food with three matching aliases must come back
  // once, and a join would need a distinct that fights the ordering below.
  const aliasMatch = sql`exists (
    select 1 from ${catalogFoodAliases}
    where ${catalogFoodAliases.foodId} = ${catalogFoods.id}
      and ${catalogFoodAliases.normalizedName} ilike ${term}
  )`;

  const rows = await db
    .select(foodColumns)
    .from(catalogFoods)
    .where(
      and(
        catalogVisibleTo(clinicId),
        or(
          ilike(catalogFoods.normalizedNameAr, term),
          ilike(catalogFoods.normalizedNameEn, term),
          aliasMatch,
        ),
      ),
    )
    /*
     * A clinic's own food first — it was added because the shared catalog lacked
     * it — then an exact name match, then everything else alphabetically.
     *
     * Note what this deliberately does NOT do: collapse a food's preparation
     * states. A search for رز returns both أرز أبيض ناشف and أرز أبيض مطبوخ, each
     * under its own name, and neither is promoted over the other. They are
     * different foods with different nutrition per 100 g, and picking one on the
     * dietitian's behalf is exactly the error the catalog was built to stop.
     */
    .orderBy(
      sql`case when ${catalogFoods.clinicId} is null then 1 else 0 end`,
      sql`case when ${catalogFoods.normalizedNameAr} = ${normalizeArabic(trimmed)} then 0 else 1 end`,
      asc(catalogFoods.nameAr),
    )
    .limit(limit);

  return withPortions(rows);
}

/**
 * A single catalog food by id, clinic-visible.
 *
 * Symmetric with `searchFoods`: same columns, same visibility rule, but by id —
 * what the editor needs after a pick, without guessing at text search.
 */
export async function searchFoodsById(clinicId: string, foodId: string): Promise<FoodSearchResult[]> {
  const rows = await db
    .select(foodColumns)
    .from(catalogFoods)
    .where(and(eq(catalogFoods.id, foodId), catalogVisibleTo(clinicId)))
    .limit(1);

  return withPortions(rows);
}

/** Every food this clinic added to its own catalog. For the library screen. */
export async function listClinicFoods(clinicId: string): Promise<FoodSearchResult[]> {
  const rows = await db
    .select(foodColumns)
    .from(catalogFoods)
    .where(and(eq(catalogFoods.clinicId, clinicId), eq(catalogFoods.isActive, true)))
    .orderBy(asc(catalogFoods.nameAr));

  return withPortions(rows);
}

/**
 * Searches ONLY this clinic's own catalog foods, by Arabic or English name.
 *
 * An empty query returns the clinic's own library (first `limit`), so the picker
 * has something to show before the dietitian types anything.
 */
export async function searchClinicFoods(
  clinicId: string,
  query: string,
  limit = 20,
): Promise<FoodSearchResult[]> {
  const trimmed = query.trim();

  const scope = and(eq(catalogFoods.clinicId, clinicId), eq(catalogFoods.isActive, true))!;

  if (!trimmed) {
    return withPortions(
      await db
        .select(foodColumns)
        .from(catalogFoods)
        .where(scope)
        .orderBy(asc(catalogFoods.nameAr))
        .limit(limit),
    );
  }

  const term = `%${normalizeArabic(trimmed).replace(/[\\%_]/g, '\\$&')}%`;

  // Aliases count here exactly as they do in the shared search: a clinic that
  // recorded طماطم as a synonym for its own بندورة entry expects to find it by
  // either word, and a search that only read the canonical names would quietly
  // ignore half of what the clinic wrote down.
  const rows = await db
    .select(foodColumns)
    .from(catalogFoods)
    .where(
      and(
        scope,
        or(
          ilike(catalogFoods.normalizedNameAr, term),
          ilike(catalogFoods.normalizedNameEn, term),
          sql`exists (
            select 1 from ${catalogFoodAliases}
            where ${catalogFoodAliases.foodId} = ${catalogFoods.id}
              and ${catalogFoodAliases.normalizedName} ilike ${term}
          )`,
        ),
      ),
    )
    .orderBy(asc(catalogFoods.nameAr))
    .limit(limit);

  return withPortions(rows);
}

// ---------------------------------------------------------------------------
// Clients and profiles
// ---------------------------------------------------------------------------

export type PlannableClient = {
  id: string;
  fullName: string;
  /**
   * The client's position in their clinic — what the rail's disc and the
   * picker's dot are coloured from, through `patientHue`. The same number the
   * calendar draws their appointments from, so the person you pick here is the
   * colour you will see them in on the grid. See `@/features/clients/seq`.
   */
  seq: number;
  /** Whether a plan can be generated at all, so the rail can say so. */
  hasProfile: boolean;
  latestPlanStatus: string | null;
  latestWeekStartDate: string | null;
  /** Soonest visit that has not started yet, used to order the planner's first screen. */
  nextAppointment: { date: string; startMinute: number } | null;
  /** Most recent visit that has already started, used when nothing is booked next. */
  lastAppointment: { date: string; startMinute: number } | null;
};

/**
 * Clients to offer in the rail. Active only — you do not plan for an archived record.
 *
 * Carries each client's latest plan status so the rail can show who has a live
 * plan and who has an untouched draft, which is what a dietitian opening the page
 * on a Sunday morning actually wants to know.
 */
export async function listPlannableClients(
  clinicId: string,
  /**
   * The clinic's wall clock, not the server's date alone.
   *
   * The split between "next" and "last" is a *moment*, not a day: a 09:00 visit
   * read at 17:00 is over, and calling it the next appointment on the planner's
   * first screen is the one thing on that card a dietitian can check against
   * their own morning — so getting it wrong makes the whole suggestion look
   * invented. Read in the clinic's zone for the same reason the calendar is:
   * appointments are clinic-local, and the server may be anywhere.
   */
  now: WallClock = wallClockIn(DISPLAY_TIME_ZONE),
): Promise<PlannableClient[]> {
  const { date: today, minute } = now;

  // Not started yet: any later day, or today at or after this minute.
  const upcoming = or(
    gt(appointments.date, today),
    and(eq(appointments.date, today), gte(appointments.startMinute, minute)),
  );
  // Its exact complement, so every appointment falls in one bucket or the other.
  const past = or(
    lt(appointments.date, today),
    and(eq(appointments.date, today), lt(appointments.startMinute, minute)),
  );

  /**
   * The newest plan per client, via `DISTINCT ON` — PostgreSQL's own answer to
   * "the first row of each group".
   *
   * Two queries merged in memory rather than one join. The obvious-looking version —
   * a `group by` subquery yielding `max(week_start_date)`, joined back to
   * `weekly_plans` to recover that row's status — does not survive contact with
   * Drizzle: the aliased aggregate comes out unqualified in the join condition
   * (`… and "weekly_plans"."week_start_date" = "week_start_date"`), which PostgreSQL
   * rejects. `DISTINCT ON` needs no self-join at all, and the rail is a few dozen
   * rows either way.
   *
   * The `ORDER BY` must lead with the `DISTINCT ON` expression; the rest of it is
   * what decides which row wins — newest week, and the most recently touched plan
   * within it.
   */
  const [clientRows, planRows, nextAppointmentRows, lastAppointmentRows] = await Promise.all([
    db
      .select({
        id: clients.id,
        fullName: clients.fullName,
        seq: clientSeq,
        profileId: clientNutritionProfiles.id,
      })
      .from(clients)
      .leftJoin(clientNutritionProfiles, eq(clientNutritionProfiles.clientId, clients.id))
      .where(and(eq(clients.clinicId, clinicId), eq(clients.status, 'active')))
      .orderBy(asc(clients.fullName)),
    db
      .selectDistinctOn([weeklyPlans.clientId], {
        clientId: weeklyPlans.clientId,
        weekStartDate: weeklyPlans.weekStartDate,
        status: weeklyPlans.status,
      })
      .from(weeklyPlans)
      .where(eq(weeklyPlans.clinicId, clinicId))
      .orderBy(asc(weeklyPlans.clientId), desc(weeklyPlans.weekStartDate), desc(weeklyPlans.updatedAt)),
    db
      .selectDistinctOn([appointments.clientId], {
        clientId: appointments.clientId,
        date: appointments.date,
        startMinute: appointments.startMinute,
      })
      .from(appointments)
      .where(and(eq(appointments.clinicId, clinicId), upcoming))
      .orderBy(asc(appointments.clientId), asc(appointments.date), asc(appointments.startMinute)),
    db
      .selectDistinctOn([appointments.clientId], {
        clientId: appointments.clientId,
        date: appointments.date,
        startMinute: appointments.startMinute,
      })
      .from(appointments)
      .where(and(eq(appointments.clinicId, clinicId), past))
      .orderBy(desc(appointments.clientId), desc(appointments.date), desc(appointments.startMinute)),
  ]);

  const latestByClient = new Map(planRows.map((row) => [row.clientId, row]));
  // The date and the minute only: the row also carries the client id it was
  // grouped by, and leaving it on the value would put a field in the returned
  // shape that the type never promised and the card has no use for.
  const visit = (row: { date: string; startMinute: number }): { date: string; startMinute: number } => ({
    date: row.date,
    startMinute: row.startMinute,
  });
  const nextAppointmentByClient = new Map(nextAppointmentRows.map((row) => [row.clientId, visit(row)]));
  const lastAppointmentByClient = new Map(lastAppointmentRows.map((row) => [row.clientId, visit(row)]));

  return clientRows.map((row) => {
    const latest = latestByClient.get(row.id);

    return {
      id: row.id,
      fullName: row.fullName,
      seq: row.seq,
      hasProfile: row.profileId !== null,
      latestPlanStatus: latest?.status ?? null,
      latestWeekStartDate: latest?.weekStartDate ?? null,
      nextAppointment: nextAppointmentByClient.get(row.id) ?? null,
      lastAppointment: lastAppointmentByClient.get(row.id) ?? null,
    };
  });
}

export type ClientContext = {
  clientId: string;
  fullName: string;
  /** Demographics, for the panel. Never sent to the model — see `prompt.ts`. */
  age: number | null;
  sex: string | null;
  heightCm: number | null;
  goal: string | null;
  activityLevel: string | null;
  allergies: string | null;
  medicalNotes: string | null;
  /** Null until the dietitian saves the form once. */
  profile: {
    weightKg: number | null;
    dailyKcalTarget: number | null;
    proteinTargetGrams: number | null;
    allergenTags: string[];
    preferences: string | null;
    dislikes: string | null;
    permanentInstructions: string | null;
    mealSchedule: MealScheduleInput;
  } | null;
  targets: SuggestedTargets;
  /** The target actually in force: the override, else the suggestion. */
  effectiveKcal: number | null;
  effectiveProteinGrams: number | null;
  budgets: SlotBudget[];
};

/**
 * Reads the stored schedule, falling back to the default.
 *
 * Validated on read, not only on write: `meal_schedule` is jsonb, so a hand-edited
 * row or a schema change could otherwise put a malformed slot into a component and
 * crash the render. A bad value degrades to the default rather than throwing.
 */
function readMealSchedule(value: MealSlot[] | null): MealScheduleInput {
  if (!value) return DEFAULT_MEAL_SCHEDULE;
  const parsed = mealScheduleSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_MEAL_SCHEDULE;
}

/**
 * Everything the context panel shows, and everything generation reads.
 *
 * Returns null for a client of another clinic — indistinguishable from one that
 * does not exist.
 */
export async function getClientContext(clinicId: string, clientId: string): Promise<ClientContext | null> {
  const [row] = await db
    .select({
      clientId: clients.id,
      fullName: clients.fullName,
      dateOfBirth: clients.dateOfBirth,
      sex: clients.sex,
      heightCm: clients.heightCm,
      goal: clients.goal,
      activityLevel: clients.activityLevel,
      allergies: clients.allergies,
      medicalNotes: clients.medicalNotes,
      profileId: clientNutritionProfiles.id,
      weightKg: clientNutritionProfiles.weightKg,
      dailyKcalTarget: clientNutritionProfiles.dailyKcalTarget,
      proteinTargetGrams: clientNutritionProfiles.proteinTargetGrams,
      allergenTags: clientNutritionProfiles.allergenTags,
      preferences: clientNutritionProfiles.preferences,
      dislikes: clientNutritionProfiles.dislikes,
      permanentInstructions: clientNutritionProfiles.permanentInstructions,
      mealSchedule: clientNutritionProfiles.mealSchedule,
    })
    .from(clients)
    .leftJoin(clientNutritionProfiles, eq(clientNutritionProfiles.clientId, clients.id))
    .where(and(eq(clients.id, clientId), eq(clients.clinicId, clinicId)))
    .limit(1);

  if (!row) return null;

  const age = row.dateOfBirth ? calculateAge(row.dateOfBirth) : null;
  const weightKg = row.weightKg ?? null;

  const targets = suggestTargets({
    weightKg,
    heightCm: row.heightCm,
    age,
    sex: row.sex,
    activityLevel: row.activityLevel,
    goal: row.goal,
  });

  const effectiveKcal = row.dailyKcalTarget ?? targets.suggestedKcal;
  const schedule = readMealSchedule(row.mealSchedule);

  return {
    clientId: row.clientId,
    fullName: row.fullName,
    age,
    sex: row.sex,
    heightCm: row.heightCm,
    goal: row.goal,
    activityLevel: row.activityLevel,
    allergies: row.allergies,
    medicalNotes: row.medicalNotes,
    profile: row.profileId
      ? {
          weightKg,
          dailyKcalTarget: row.dailyKcalTarget,
          proteinTargetGrams: row.proteinTargetGrams,
          allergenTags: row.allergenTags ?? [],
          preferences: row.preferences,
          dislikes: row.dislikes,
          permanentInstructions: row.permanentInstructions,
          mealSchedule: schedule,
        }
      : null,
    targets,
    effectiveKcal,
    effectiveProteinGrams: row.proteinTargetGrams ?? suggestProteinGrams(weightKg),
    budgets: effectiveKcal === null ? [] : slotBudgets(effectiveKcal, schedule),
  };
}

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

export type BoardOption = {
  id: string;
  dishId: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  servings: number;
  kcal: number;
  isSimilar: boolean;
};

export type BoardMeal = {
  id: string;
  slotKey: string;
  label: string;
  timeOfDay: string;
  /** Null for an unfilled slot. */
  dish: (DishDetail & { servings: number }) | null;
  /**
   * What this meal actually contains, already resolved and already scaled.
   *
   * The meal's own hand-set amounts when it has any, the dish's recipe at
   * `servings` otherwise — decided once by `mealIngredientLines`, so every surface
   * reading this array is reading the same meal. Empty for an unfilled slot.
   */
  lines: MealIngredientLine[];
  /** True once the dietitian has set amounts by hand and the dish multiplier no longer applies. */
  hasOwnAmounts: boolean;
  rationaleAr: string | null;
  /** Frozen when the plan was published, computed live for a draft. */
  totals: NutrientTotals;
  /** The dish's total weight, from the same source as `totals`, so the two agree. */
  grams: number;
  /**
   * True when `totals` and `grams` came from the published snapshot.
   *
   * The itemised ingredient list beside them is still rendered from the *current*
   * recipe — composition is not versioned — so on an older plan the frozen total
   * and the live breakdown can legitimately disagree. This flag is what lets the UI
   * avoid presenting that breakdown as the prescription.
   */
  nutritionFrozen: boolean;
  /** What this slot was supposed to carry, from the plan's snapshotted target. */
  budgetKcal: number;
  options: BoardOption[];
};

export type BoardDay = {
  dayOfWeek: number;
  meals: BoardMeal[];
  totals: NutrientTotals;
  unfilled: number;
};

export type Board = {
  id: string;
  clientId: string;
  clientName: string;
  weekStartDate: string;
  status: string;
  publishedAt: Date | null;
  weekInstructions: string | null;
  kcalTargetSnapshot: number;
  /** Null when the week used the client's own figures. */
  proteinTargetSnapshot: number | null;
  goalSnapshot: string | null;
  generatedBy: string;
  model: string | null;
  updatedAt: Date;
  days: BoardDay[];
  totals: NutrientTotals;
  /** Slots with no dish, across the week. What the banner counts. */
  unfilled: number;
};

export type PlanListEntry = {
  id: string;
  weekStartDate: string;
  status: string;
  updatedAt: Date;
  kcalTargetSnapshot: number;
  mealCount: number;
  /** The model's account of this week, for telling one from another in a list. */
  summaryAr: string | null;
};

/** A plan review as the board reads it. */
export type PlanReviewRow = {
  id: string;
  model: string;
  verdict: string;
  summaryAr: string;
  findings: ReviewFinding[];
  checks: string[];
  createdAt: Date;
};

/**
 * The newest review of one plan, or null where it has never been reviewed.
 *
 * Clinic-scoped like every other read here: a plan id is a uuid a staff member
 * could otherwise carry between clinics.
 */
export async function latestReview(
  clinicId: string,
  planId: string,
): Promise<PlanReviewRow | null> {
  const [row] = await db
    .select({
      id: weeklyPlanReviews.id,
      model: weeklyPlanReviews.model,
      verdict: weeklyPlanReviews.verdict,
      summaryAr: weeklyPlanReviews.summaryAr,
      findings: weeklyPlanReviews.findings,
      checks: weeklyPlanReviews.checks,
      createdAt: weeklyPlanReviews.createdAt,
    })
    .from(weeklyPlanReviews)
    .where(and(eq(weeklyPlanReviews.clinicId, clinicId), eq(weeklyPlanReviews.planId, planId)))
    .orderBy(desc(weeklyPlanReviews.createdAt))
    .limit(1);

  if (!row) return null;

  return {
    ...row,
    // `jsonb` comes back as `unknown`, and what was written is what is read.
    findings: (row.findings ?? []) as ReviewFinding[],
    checks: (row.checks ?? []) as string[],
  };
}

/** One client's plans, newest week first, for the header pills and the Past tab. */
export async function listPlans(clinicId: string, clientId: string): Promise<PlanListEntry[]> {
  return db
    .select({
      id: weeklyPlans.id,
      weekStartDate: weeklyPlans.weekStartDate,
      status: weeklyPlans.status,
      updatedAt: weeklyPlans.updatedAt,
      kcalTargetSnapshot: weeklyPlans.kcalTargetSnapshot,
      summaryAr: weeklyPlans.summaryAr,
      // Counted in SQL rather than by loading the meals: the panel shows a number,
      // and fetching 35 rows per plan to take their length would make this the
      // page's largest read by a wide margin.
      mealCount: sql<number>`cast(count(${weeklyPlanMeals.id}) as int)`,
    })
    .from(weeklyPlans)
    // Left, not inner: a plan with no meals is a plan, and an inner join would drop
    // it from the history entirely rather than showing it as empty.
    .leftJoin(weeklyPlanMeals, eq(weeklyPlanMeals.planId, weeklyPlans.id))
    .where(and(eq(weeklyPlans.clinicId, clinicId), eq(weeklyPlans.clientId, clientId)))
    .groupBy(weeklyPlans.id)
    .orderBy(desc(weeklyPlans.weekStartDate), desc(weeklyPlans.updatedAt));
}

/**
 * One plan's dishes, keyed the way `planSkeleton` fills slots.
 *
 * Clinic-scoped in the same query rather than after it: the plan id arrives from a
 * form, and a copy that read another clinic's plan would leak its menu one dish at
 * a time. An unfilled slot contributes no entry — copying a gap forward as a gap is
 * what leaving it out already achieves.
 */
export async function planDishesBySlot(
  clinicId: string,
  planId: string,
): Promise<Map<string, SlotFill>> {
  const parsed = planIdSchema.safeParse(planId);
  if (!parsed.success) return new Map();

  const rows = await db
    .select({
      dayOfWeek: weeklyPlanMeals.dayOfWeek,
      slotKey: weeklyPlanMeals.slotKey,
      dishId: weeklyPlanMeals.dishId,
      servings: weeklyPlanMeals.servings,
    })
    .from(weeklyPlanMeals)
    .innerJoin(weeklyPlans, eq(weeklyPlans.id, weeklyPlanMeals.planId))
    .where(and(eq(weeklyPlans.id, parsed.data), eq(weeklyPlans.clinicId, clinicId)));

  const fill = new Map<string, SlotFill>();

  for (const row of rows) {
    if (!row.dishId) continue;
    fill.set(slotFillKey(row.dayOfWeek, row.slotKey), {
      dishId: row.dishId,
      servings: row.servings,
    });
  }

  return fill;
}

export type ComparisonPlan = {
  planId: string;
  weekStartDate: string;
  /** Dish name per `dayOfWeek:slotKey`, for the ghost line under each card. */
  slots: Record<string, { dishId: string; nameAr: string; nameEn: string }>;
};

/**
 * The plan immediately before this one, reduced to what a ghost line needs.
 *
 * A dedicated read rather than a second `getBoard`: the board wants a dish name
 * per slot, and assembling a fully costed week to render one muted line per card
 * would double the page's query cost for nothing.
 *
 * "Before" is by week, then by recency within the week — the same ordering
 * `getLatestBoard` uses, so "previous" means the same thing everywhere.
 */
export async function previousPlanSlots(
  clinicId: string,
  clientId: string,
  weekStartDate: string,
): Promise<ComparisonPlan | null> {
  const [previous] = await db
    .select({ id: weeklyPlans.id, weekStartDate: weeklyPlans.weekStartDate })
    .from(weeklyPlans)
    .where(
      and(
        eq(weeklyPlans.clinicId, clinicId),
        eq(weeklyPlans.clientId, clientId),
        lt(weeklyPlans.weekStartDate, weekStartDate),
      ),
    )
    .orderBy(desc(weeklyPlans.weekStartDate), desc(weeklyPlans.updatedAt))
    .limit(1);

  if (!previous) return null;

  const rows = await db
    .select({
      dayOfWeek: weeklyPlanMeals.dayOfWeek,
      slotKey: weeklyPlanMeals.slotKey,
      dishId: weeklyPlanMeals.dishId,
      // Both names: the ghost line under a card renders in the reader's locale
      // like every other dish name on the board.
      nameAr: dishes.nameAr,
      nameEn: dishes.nameEn,
    })
    .from(weeklyPlanMeals)
    .innerJoin(dishes, eq(dishes.id, weeklyPlanMeals.dishId))
    .where(eq(weeklyPlanMeals.planId, previous.id));

  const slots: ComparisonPlan['slots'] = {};

  for (const row of rows) {
    if (!row.dishId) continue;
    slots[slotFillKey(row.dayOfWeek, row.slotKey)] = {
      dishId: row.dishId,
      nameAr: row.nameAr,
      nameEn: row.nameEn,
    };
  }

  return { planId: previous.id, weekStartDate: previous.weekStartDate, slots };
}

/**
 * One plan, fully populated and costed.
 *
 * Three queries — plan, meals, options — assembled in memory, plus the catalog for
 * recipes. Nutrition is computed here so no component ever has to.
 */
export async function getBoard(clinicId: string, planId: string): Promise<Board | null> {
  const parsed = planIdSchema.safeParse(planId);
  if (!parsed.success) return null;

  const [plan] = await db
    .select({
      id: weeklyPlans.id,
      clientId: weeklyPlans.clientId,
      clientName: clients.fullName,
      weekStartDate: weeklyPlans.weekStartDate,
      status: weeklyPlans.status,
      publishedAt: weeklyPlans.publishedAt,
      weekInstructions: weeklyPlans.weekInstructions,
      kcalTargetSnapshot: weeklyPlans.kcalTargetSnapshot,
      proteinTargetSnapshot: weeklyPlans.proteinTargetSnapshot,
      goalSnapshot: weeklyPlans.goalSnapshot,
      generatedBy: weeklyPlans.generatedBy,
      model: weeklyPlans.model,
      updatedAt: weeklyPlans.updatedAt,
    })
    .from(weeklyPlans)
    .innerJoin(clients, eq(clients.id, weeklyPlans.clientId))
    .where(and(eq(weeklyPlans.id, parsed.data), eq(weeklyPlans.clinicId, clinicId)))
    .limit(1);

  if (!plan) return null;

  return assembleBoard(plan);
}

/** The newest plan for a client, which is what the board opens by default. */
export async function getLatestBoard(clinicId: string, clientId: string): Promise<Board | null> {
  const [row] = await db
    .select({ id: weeklyPlans.id })
    .from(weeklyPlans)
    .where(and(eq(weeklyPlans.clinicId, clinicId), eq(weeklyPlans.clientId, clientId)))
    .orderBy(desc(weeklyPlans.weekStartDate), desc(weeklyPlans.updatedAt))
    .limit(1);

  return row ? getBoard(clinicId, row.id) : null;
}

/**
 * The client's own view: the published plan for the week they are standing in,
 * and nothing else.
 *
 * Scoped by `client_id` and `status` only — a portal session has no clinic, and
 * adding one would mean trusting a value the client's session does not carry. The
 * plan is reachable because it belongs to them, which is the actual authorisation
 * rule.
 *
 * **Two conditions, and both are absolute: published, and covering `today`.**
 *
 * `published` is the dietitian's decision to show it at all. A draft is their
 * working copy, and a client following a plan that is still being edited is the
 * failure the status column exists to prevent.
 *
 * The week is what makes the screen behave. The tick on a meal card renders
 * only for `dayStanding === 'today'`, and the home screen's commitment figure
 * counts only today's meals — so a plan whose week does not contain today gives
 * a client seven days they cannot report on and a percentage with no
 * denominator. Requiring the week means the rule is simple to state in both
 * directions: **if a plan is on screen, its meals can be ticked today.**
 *
 * Two consequences worth knowing, because both were chosen rather than fallen
 * into:
 *
 * - Unpublishing this week's plan clears the client's home screen at once, even
 *   when an older plan is still marked published. An expired plan surfacing
 *   from underneath a take-down is what made unpublishing look like it had done
 *   nothing.
 * - A plan published for a week that has not started yet is not shown either.
 *   It appears on the first day of its own week. `loadPlanPage` used to treat a
 *   future plan's seven `future` days as the honest answer; the honest answer
 *   now is that the client has no plan for *this* week.
 */
export async function getPublishedBoard(clientId: string, today: string): Promise<Board | null> {
  // Every published plan's header row, newest week first. The rows are small —
  // no meals, no dishes — and a client accumulates one per week, so reading
  // them and choosing here costs less than a second round trip and keeps the
  // rule readable instead of buried in a WHERE clause of date arithmetic.
  const candidates = await db
    .select({
      id: weeklyPlans.id,
      clientId: weeklyPlans.clientId,
      clientName: clients.fullName,
      weekStartDate: weeklyPlans.weekStartDate,
      status: weeklyPlans.status,
      publishedAt: weeklyPlans.publishedAt,
      weekInstructions: weeklyPlans.weekInstructions,
      kcalTargetSnapshot: weeklyPlans.kcalTargetSnapshot,
      proteinTargetSnapshot: weeklyPlans.proteinTargetSnapshot,
      goalSnapshot: weeklyPlans.goalSnapshot,
      generatedBy: weeklyPlans.generatedBy,
      model: weeklyPlans.model,
      updatedAt: weeklyPlans.updatedAt,
    })
    .from(weeklyPlans)
    .innerJoin(clients, eq(clients.id, weeklyPlans.clientId))
    .where(and(eq(weeklyPlans.clientId, clientId), eq(weeklyPlans.status, 'published')))
    .orderBy(desc(weeklyPlans.weekStartDate));

  // `weekDates` walks the plan's own seven dates from its `week_start_date`, so
  // this holds for a plan starting on any weekday — the same reckoning
  // `planWeekDays` gives the day strip, rather than a second guess at it. No
  // fallback: a plan that does not cover today is not this week's plan, and
  // there is nothing else for the portal to mean by "your plan".
  const covering = candidates.find((plan) => weekDates(plan.weekStartDate).includes(today));

  return covering ? assembleBoard(covering) : null;
}

/**
 * The same question as `getPublishedBoard`, asked when only the answer's *date*
 * is wanted: which published week covers `today`, or none.
 *
 * It exists because two callers were paying for a whole board to read one field
 * off it. `buildNotifications` takes a `currentWeekPlanStartDate` and nothing
 * else from the plan — it needs to know whether to say "your plan is ready" —
 * and `assembleBoard` behind `getPublishedBoard` reads every meal and every dish
 * in the week to get there. That was tolerable on the notifications screen; it
 * became untenable when the portal's bell started counting the same feed, since
 * the bell renders on all five tabs.
 *
 * ⚠ **The covering rule is duplicated nowhere — it is the same two lines, and it
 * must stay that way.** A plan is this week's plan when its own seven days
 * include `today`; the long note on `getPublishedBoard` above is the whole
 * argument for that and applies here unchanged. If the rule moves, both readers
 * move together or the bell will offer a plan the home screen does not show.
 */
export async function getPublishedPlanWeekStart(
  clientId: string,
  today: string,
): Promise<string | null> {
  // Header rows only — the same small select `getPublishedBoard` opens with,
  // minus every column that exists to build a board out of.
  const candidates = await db
    .select({ weekStartDate: weeklyPlans.weekStartDate })
    .from(weeklyPlans)
    .where(and(eq(weeklyPlans.clientId, clientId), eq(weeklyPlans.status, 'published')))
    .orderBy(desc(weeklyPlans.weekStartDate));

  const covering = candidates.find((plan) => weekDates(plan.weekStartDate).includes(today));

  return covering?.weekStartDate ?? null;
}

type PlanRow = Omit<Board, 'days' | 'totals' | 'unfilled'>;

/** Shared by the three readers above — the plan row differs, the assembly does not. */
async function assembleBoard(plan: PlanRow): Promise<Board> {
  const mealRows = await db
    .select({
      id: weeklyPlanMeals.id,
      dayOfWeek: weeklyPlanMeals.dayOfWeek,
      slotKey: weeklyPlanMeals.slotKey,
      label: weeklyPlanMeals.label,
      timeOfDay: weeklyPlanMeals.timeOfDay,
      budgetKcal: weeklyPlanMeals.budgetKcal,
      sortOrder: weeklyPlanMeals.sortOrder,
      dishId: weeklyPlanMeals.dishId,
      servings: weeklyPlanMeals.servings,
      rationaleAr: weeklyPlanMeals.rationaleAr,
      nutritionSnapshot: weeklyPlanMeals.nutritionSnapshot,
    })
    .from(weeklyPlanMeals)
    .where(eq(weeklyPlanMeals.planId, plan.id))
    .orderBy(asc(weeklyPlanMeals.dayOfWeek), asc(weeklyPlanMeals.sortOrder), asc(weeklyPlanMeals.timeOfDay));

  const mealIds = mealRows.map((meal) => meal.id);

  const optionRows = mealIds.length
    ? await db
        .select({
          id: weeklyPlanMealOptions.id,
          mealId: weeklyPlanMealOptions.mealId,
          dishId: weeklyPlanMealOptions.dishId,
          servings: weeklyPlanMealOptions.servings,
        })
        .from(weeklyPlanMealOptions)
        .where(inArray(weeklyPlanMealOptions.mealId, mealIds))
        .orderBy(asc(weeklyPlanMealOptions.sortOrder))
    : [];

  const sideRows = mealIds.length
    ? await db
        .select({
          mealId: weeklyPlanMealSides.mealId,
          dishId: weeklyPlanMealSides.dishId,
        })
        .from(weeklyPlanMealSides)
        .where(inArray(weeklyPlanMealSides.mealId, mealIds))
        .orderBy(asc(weeklyPlanMealSides.sortOrder))
    : [];

  // Only the dishes this plan references, and by id rather than through the catalog:
  // a plan may hold a dish the client has since become allergic to, or one that has
  // since been retired, and either way the card must show what is actually planned
  // rather than a blank the dietitian cannot explain.
  const referenced = new Set<string>();
  for (const meal of mealRows) if (meal.dishId) referenced.add(meal.dishId);
  for (const option of optionRows) referenced.add(option.dishId);
  for (const side of sideRows) referenced.add(side.dishId);

  const dishById = new Map((await loadDishesByIds([...referenced])).map((dish) => [dish.id, dish]));

  // The hand-set amounts, for the meals that have any. One query for the week.
  const ownAmounts = await ownAmountsByMeal(mealIds);

  // Each meal carries the budget it was generated against, so the board shows the
  // same figure the model was given even after the client's profile has moved on.
  const budgetByMeal = new Map(mealRows.map((meal) => [meal.id, meal.budgetKcal]));

  const sidesByMeal = new Map<string, SideRecipe[]>();
  for (const side of sideRows) {
    const dish = dishById.get(side.dishId);
    if (!dish) continue;

    const entry: SideRecipe = { id: dish.id, nameAr: dish.nameAr, recipe: dish.ingredients };
    const bucket = sidesByMeal.get(side.mealId);
    if (bucket) bucket.push(entry);
    else sidesByMeal.set(side.mealId, [entry]);
  }

  const optionsByMeal = new Map<string, BoardOption[]>();
  for (const option of optionRows) {
    const dish = dishById.get(option.dishId);
    if (!dish) continue;

    // Portioned, not multiplied: this is the figure beside a swap the dietitian is
    // deciding on, and it has to be what the meal would hold if she took it.
    const kcal = mealTotals(scaleRecipe(dish.ingredients, option.servings)).kcal.value;
    const budget = budgetByMeal.get(option.mealId) ?? 0;

    const entry: BoardOption = {
      id: option.id,
      dishId: dish.id,
      slug: dish.slug,
      nameAr: dish.nameAr,
      nameEn: dish.nameEn,
      servings: option.servings,
      kcal,
      isSimilar: budget > 0 ? Math.abs((kcal - budget) / budget) <= 0.15 : true,
    };

    const bucket = optionsByMeal.get(option.mealId);
    if (bucket) bucket.push(entry);
    else optionsByMeal.set(option.mealId, [entry]);
  }

  // Seven buckets up front, so a day with no meals still gets a column.
  const days: BoardDay[] = DAYS_OF_WEEK.map((dayOfWeek) => ({
    dayOfWeek,
    meals: [],
    totals: emptyTotals(),
    unfilled: 0,
  }));

  for (const meal of mealRows) {
    const dish = meal.dishId ? dishById.get(meal.dishId) : undefined;
    const stored = ownAmounts.get(meal.id);

    // What this meal contains, decided once. Everything below — the calories, the
    // weight, the ingredient list the dietitian and the patient both read — is
    // built from this one array, so the numbers and the list cannot describe two
    // different meals.
    const lines = dish
      ? mealIngredientLines({
          recipe: dish.ingredients,
          servings: meal.servings,
          stored,
          sides: sidesByMeal.get(meal.id) ?? [],
        })
      : [];

    // The one branch between a frozen record and a live calculation. Keyed on the
    // snapshot rather than on `plan.status`, so the rule is stated once and the
    // three readers above (staff board, latest board, patient portal) cannot
    // disagree about what a published plan contains. See `nutrition-snapshot.ts`.
    const nutrition = resolveMealNutrition({
      snapshot: readMealSnapshot(meal.nutritionSnapshot),
      // The status decides what a *missing or damaged* snapshot means. A draft
      // recalculates; a published plan with nothing readable to show throws rather
      // than quietly producing today's numbers under yesterday's prescription.
      requiresSnapshot: requiresFrozenNutrition(plan.status),
      lines: dish ? lines : null,
    });

    days[meal.dayOfWeek]?.meals.push({
      id: meal.id,
      slotKey: meal.slotKey,
      label: meal.label,
      timeOfDay: toTimeInput(meal.timeOfDay),
      dish: dish ? { ...dish, servings: meal.servings } : null,
      lines,
      hasOwnAmounts: hasOwnAmounts(stored),
      rationaleAr: meal.rationaleAr,
      totals: nutrition.totals,
      grams: nutrition.grams,
      nutritionFrozen: nutrition.frozen,
      budgetKcal: meal.budgetKcal,
      options: optionsByMeal.get(meal.id) ?? [],
    });
  }

  let unfilled = 0;

  for (const day of days) {
    day.totals = combineTotals(day.meals.map((meal) => meal.totals));
    day.unfilled = day.meals.filter((meal) => meal.dish === null).length;
    unfilled += day.unfilled;
  }

  return {
    ...plan,
    days,
    totals: combineTotals(days.map((day) => day.totals)),
    unfilled,
  };
}

// ---------------------------------------------------------------------------
// Swapping
// ---------------------------------------------------------------------------

export type SwapCandidate = SimilarMatch<{
  slug: string;
  mealTypes: readonly string[];
  allergenTags: readonly string[];
  baseKcal: number;
  id: string;
  nameAr: string;
  nameEn: string;
}>;

/**
 * Dishes that could stand in for one meal.
 *
 * Deterministic — see `similar.ts`. Runs against the allergen-filtered catalog, so
 * a swap can never introduce something the AI was forbidden from choosing.
 */
export async function findSwapCandidates({
  clinicId,
  slotKey,
  budgetKcal,
  allergens,
  excludeSlugs,
}: {
  clinicId: string;
  slotKey: string;
  budgetKcal: number;
  allergens: readonly string[];
  excludeSlugs: readonly string[];
}): Promise<SwapCandidate[]> {
  const catalog = await loadCatalog(clinicId, allergens);

  const candidates = catalog.map((dish) => ({
    id: dish.id,
    slug: dish.slug,
    nameAr: dish.nameAr,
    nameEn: dish.nameEn,
    mealTypes: dish.mealTypes,
    allergenTags: dish.allergenTags,
    baseKcal: baseServingKcal(dish.ingredients),
  }));

  return findSimilar({
    candidates,
    mealType: mealTypeForSlot(slotKey),
    budgetKcal,
    allergens,
    excludeSlugs,
  });
}

/**
 * Swap candidates for every meal on a board, keyed by meal id.
 *
 * Computed once for the whole board rather than per meal on demand: the catalog is
 * loaded a single time and the ranking is a pure in-memory pass, so 35 meals cost
 * one query. Doing it lazily would mean a round trip every time the dietitian opens
 * a card.
 */
export function swapCandidatesByMealFromCatalog(
  board: Board,
  catalog: readonly DishDetail[],
): Record<string, SwapCandidate[]> {
  const candidates = catalog.map((dish) => ({
    id: dish.id,
    slug: dish.slug,
    nameAr: dish.nameAr,
    nameEn: dish.nameEn,
    mealTypes: dish.mealTypes,
    allergenTags: dish.allergenTags,
    baseKcal: baseServingKcal(dish.ingredients),
  }));

  const byMeal: Record<string, SwapCandidate[]> = {};

  for (const day of board.days) {
    for (const meal of day.meals) {
      byMeal[meal.id] = findSimilar({
        candidates,
        mealType: mealTypeForSlot(meal.slotKey),
        budgetKcal: meal.budgetKcal,
        allergens: [],
        // Neither the dish already in the slot nor anything already offered as an
        // alternative — the list must never suggest what is on screen.
        excludeSlugs: [
          ...(meal.dish ? [meal.dish.slug] : []),
          ...meal.options.map((option) => option.slug),
        ],
      });
    }
  }

  return byMeal;
}

export async function swapCandidatesByMeal(
  board: Board,
  clinicId: string,
  allergens: readonly string[],
): Promise<Record<string, SwapCandidate[]>> {
  return swapCandidatesByMealFromCatalog(board, await loadCatalog(clinicId, allergens));
}

/** Dish slugs used in the client's most recent plan, fed to the prompt for variety. */
export async function previousPlanSlugs(
  clinicId: string,
  clientId: string,
  excludePlanId?: string,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ slug: dishes.slug })
    .from(weeklyPlans)
    .innerJoin(weeklyPlanMeals, eq(weeklyPlanMeals.planId, weeklyPlans.id))
    .innerJoin(dishes, eq(dishes.id, weeklyPlanMeals.dishId))
    .where(
      and(
        eq(weeklyPlans.clinicId, clinicId),
        eq(weeklyPlans.clientId, clientId),
        excludePlanId ? ne(weeklyPlans.id, excludePlanId) : undefined,
      ),
    )
    .orderBy(asc(dishes.slug))
    .limit(60);

  return rows.map((row) => row.slug);
}

/**
 * Who a plan belongs to, and which week it covers — the two facts a
 * notification about it needs, and nothing else.
 *
 * `getBoard` above answers the same question, but it assembles a fully costed
 * seven-day board to do it. This is read by `publishPlanAction` in an
 * `after()` continuation whose entire job is to send one notification, so it
 * reads two columns.
 *
 * Scoped to the clinic like every other read here: the caller has proved which
 * clinic it is acting for, and a plan id from a form must not reach across
 * that boundary even for something as small as this.
 */
export async function getPlanNotificationTarget(
  clinicId: string,
  planId: string,
): Promise<{ clientId: string; weekStartDate: string } | null> {
  const parsed = planIdSchema.safeParse(planId);
  if (!parsed.success) return null;

  const [row] = await db
    .select({ clientId: weeklyPlans.clientId, weekStartDate: weeklyPlans.weekStartDate })
    .from(weeklyPlans)
    .where(and(eq(weeklyPlans.id, parsed.data), eq(weeklyPlans.clinicId, clinicId)))
    .limit(1);

  return row ?? null;
}
