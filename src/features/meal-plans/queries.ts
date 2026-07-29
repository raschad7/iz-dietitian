import { and, asc, count, desc, eq, ilike, inArray, sql, type SQL } from 'drizzle-orm';

import { db } from '@/db';
import { clients, foods, mealPlanItems, mealPlanMeals, mealPlans } from '@/db/schema';

import {
  combineTotals,
  sumNutrients,
  type FoodNutrients,
  type NutrientTotals,
} from './nutrition';
import {
  FOOD_SEARCH_LIMIT,
  FOODS_PAGE_SIZE,
  foodIdParamSchema,
  planIdSchema,
  toTimeInput,
  type FoodSearchInput,
  type ListFoodsInput,
} from './schema';

/**
 * Reads for the meal-plans feature. Like `src/features/clients/queries.ts`, this
 * imports nothing from Next.js so the functions can be called directly from a
 * test or a script.
 *
 * `clinicId` is a required first argument on everything that touches a plan, so
 * forgetting the tenant scope is a type error rather than a silent leak.
 */

/** A food as the UI needs it: identity, composition, and its household measure. */
export type FoodSummary = {
  id: string;
  fdcId: number;
  description: string;
  category: string;
  portionGrams: number | null;
  portionLabel: string | null;
} & FoodNutrients;

export type PlanItem = {
  id: string;
  quantityGrams: number;
  food: FoodSummary;
};

export type PlanMeal = {
  id: string;
  label: string;
  /** `HH:MM`, already trimmed from PostgreSQL's `HH:MM:SS`. */
  timeOfDay: string;
  items: PlanItem[];
  /** This block alone — what the analysis panel shows when the block is selected. */
  totals: NutrientTotals;
};

export type PlanDetail = {
  id: string;
  title: string;
  notes: string | null;
  clientId: string;
  clientName: string;
  meals: PlanMeal[];
  /** Every meal combined — the default view of the analysis panel. */
  totals: NutrientTotals;
};

export type PlanListItem = {
  id: string;
  title: string;
  clientId: string;
  clientName: string;
  mealCount: number;
  kcal: number;
  updatedAt: Date;
};

/** The columns that make up a {@link FoodSummary}, shared by both readers below. */
const foodColumns = {
  id: foods.id,
  fdcId: foods.fdcId,
  description: foods.description,
  category: foods.category,
  portionGrams: foods.portionGrams,
  portionLabel: foods.portionLabel,
  kcal: foods.kcal,
  protein: foods.protein,
  carbs: foods.carbs,
  fat: foods.fat,
  fiber: foods.fiber,
  sugar: foods.sugar,
  saturatedFat: foods.saturatedFat,
  sodium: foods.sodium,
  cholesterol: foods.cholesterol,
  calcium: foods.calcium,
  iron: foods.iron,
  potassium: foods.potassium,
} as const;

/**
 * Every plan in the clinic, with the two facts worth showing before opening one.
 *
 * The energy total is aggregated in SQL rather than by loading each plan's items
 * — one query for the whole list instead of one per row.
 *
 * `clientId` narrows it to one client's plans, for the card on their profile.
 * It is an extra filter on top of the clinic scope, never a replacement for it.
 */
export async function listPlans(clinicId: string, clientId?: string): Promise<PlanListItem[]> {
  const scope = clientId
    ? and(eq(mealPlans.clinicId, clinicId), eq(mealPlans.clientId, clientId))
    : eq(mealPlans.clinicId, clinicId);

  const rows = await db
    .select({
      id: mealPlans.id,
      title: mealPlans.title,
      clientId: mealPlans.clientId,
      clientName: clients.fullName,
      updatedAt: mealPlans.updatedAt,
      mealCount: sql<number>`count(distinct ${mealPlanMeals.id})::int`,
      // Same per-100 g unwinding as `scaleNutrients`, expressed in SQL.
      kcal: sql<number>`coalesce(sum(${foods.kcal} * ${mealPlanItems.quantityGrams} / 100), 0)::float8`,
    })
    .from(mealPlans)
    .innerJoin(clients, eq(clients.id, mealPlans.clientId))
    .leftJoin(mealPlanMeals, eq(mealPlanMeals.planId, mealPlans.id))
    .leftJoin(mealPlanItems, eq(mealPlanItems.mealId, mealPlanMeals.id))
    .leftJoin(foods, eq(foods.id, mealPlanItems.foodId))
    .where(scope)
    .groupBy(mealPlans.id, clients.fullName)
    .orderBy(desc(mealPlans.updatedAt));

  return rows;
}

/**
 * One plan, fully populated and costed.
 *
 * Three queries — plan, meals, items — assembled in memory rather than one join
 * that would repeat the plan's columns across every item row. Nutrition totals
 * are computed here, so a page or a component never has to.
 *
 * Returns null for a plan belonging to another clinic, indistinguishable from
 * one that does not exist.
 */
export async function getPlan(clinicId: string, id: string): Promise<PlanDetail | null> {
  const parsed = planIdSchema.safeParse(id);
  if (!parsed.success) return null;

  const [plan] = await db
    .select({
      id: mealPlans.id,
      title: mealPlans.title,
      notes: mealPlans.notes,
      clientId: mealPlans.clientId,
      clientName: clients.fullName,
    })
    .from(mealPlans)
    .innerJoin(clients, eq(clients.id, mealPlans.clientId))
    .where(and(eq(mealPlans.id, parsed.data), eq(mealPlans.clinicId, clinicId)))
    .limit(1);

  if (!plan) return null;

  const mealRows = await db
    .select({
      id: mealPlanMeals.id,
      label: mealPlanMeals.label,
      timeOfDay: mealPlanMeals.timeOfDay,
    })
    .from(mealPlanMeals)
    .where(eq(mealPlanMeals.planId, plan.id))
    .orderBy(asc(mealPlanMeals.timeOfDay), asc(mealPlanMeals.sortOrder));

  const mealIds = mealRows.map((meal) => meal.id);

  // `inArray` with an empty list produces `in ()`, which is not valid SQL — and
  // a plan with no meals has nothing to look up anyway.
  const itemRows = mealIds.length
    ? await db
        .select({
          id: mealPlanItems.id,
          mealId: mealPlanItems.mealId,
          quantityGrams: mealPlanItems.quantityGrams,
          food: foodColumns,
        })
        .from(mealPlanItems)
        .innerJoin(foods, eq(foods.id, mealPlanItems.foodId))
        .where(inArray(mealPlanItems.mealId, mealIds))
        .orderBy(asc(mealPlanItems.sortOrder), asc(mealPlanItems.createdAt))
    : [];

  const itemsByMeal = new Map<string, PlanItem[]>();
  for (const { mealId, ...item } of itemRows) {
    const bucket = itemsByMeal.get(mealId);
    if (bucket) bucket.push(item);
    else itemsByMeal.set(mealId, [item]);
  }

  const meals: PlanMeal[] = mealRows.map((meal) => {
    const items = itemsByMeal.get(meal.id) ?? [];

    return {
      ...meal,
      timeOfDay: toTimeInput(meal.timeOfDay),
      items,
      totals: sumNutrients(items),
    };
  });

  return {
    ...plan,
    meals,
    // The day is the sum of its blocks, computed from the same numbers the
    // blocks show — so the panel can never disagree with itself.
    totals: combineTotals(meals.map((meal) => meal.totals)),
  };
}

/**
 * Matches a food search.
 *
 * Each whitespace-separated term must appear somewhere in the description, so
 * "chicken breast" finds "Chicken, broilers or fryers, breast, meat only, raw" —
 * which a single `ilike '%chicken breast%'` would miss, because the source
 * writes descriptions with the qualifiers in between.
 *
 * `ilike` is already case-insensitive, so there is no normalised column to keep
 * in sync: the USDA descriptions are English, and the Arabic folding that
 * `clients.search_name` exists for does not apply.
 */
function buildFoodFilter(input: FoodSearchInput): SQL | undefined {
  const conditions: SQL[] = [];

  if (input.category) conditions.push(eq(foods.category, input.category));

  for (const term of input.q?.split(/\s+/).filter(Boolean) ?? []) {
    // `%` and `_` are wildcards inside LIKE; someone searching for "100%" must
    // not silently match everything.
    conditions.push(ilike(foods.description, `%${term.replace(/[\\%_]/g, '\\$&')}%`));
  }

  return conditions.length ? and(...conditions) : undefined;
}

/**
 * Shortest description first: the plain ingredient ("Butter, salted") ranks
 * above the elaborated variant ("Butter, salted, with added vitamin D").
 */
const foodOrder = [sql`length(${foods.description})`, asc(foods.description)] as const;

/** The food picker's backing search. Capped, never paginated — it is a typeahead. */
export async function searchFoods(input: FoodSearchInput): Promise<FoodSummary[]> {
  return db
    .select(foodColumns)
    .from(foods)
    .where(buildFoodFilter(input))
    .orderBy(...foodOrder)
    .limit(FOOD_SEARCH_LIMIT);
}

export type FoodListResult = {
  items: FoodSummary[];
  total: number;
  page: number;
  pageCount: number;
};

/**
 * The browsable food table.
 *
 * Same matching as the picker, but paginated and with a total — this is the
 * reference view, where "how many foods are there" is part of the answer.
 */
export async function listFoods(input: ListFoodsInput): Promise<FoodListResult> {
  const where = buildFoodFilter(input);

  const [totals] = await db.select({ value: count() }).from(foods).where(where);
  const total = totals?.value ?? 0;

  const items = await db
    .select(foodColumns)
    .from(foods)
    .where(where)
    .orderBy(...foodOrder)
    .limit(FOODS_PAGE_SIZE)
    .offset((input.page - 1) * FOODS_PAGE_SIZE);

  return {
    items,
    total,
    page: input.page,
    pageCount: Math.max(1, Math.ceil(total / FOODS_PAGE_SIZE)),
  };
}

/**
 * One food, for its detail page.
 *
 * Not scoped to a clinic — `foods` is shared reference data. Validates the id
 * first so a malformed route param is a 404 rather than a failed uuid cast.
 */
export async function getFood(id: string): Promise<FoodSummary | null> {
  const parsed = foodIdParamSchema.safeParse(id);
  if (!parsed.success) return null;

  const [row] = await db.select(foodColumns).from(foods).where(eq(foods.id, parsed.data)).limit(1);

  return row ?? null;
}

/** The category filter's options, read from the data rather than hardcoded. */
export async function listFoodCategories(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ category: foods.category })
    .from(foods)
    .orderBy(asc(foods.category));

  return rows.map((row) => row.category);
}

/** Whether the reference table has been seeded — the page warns when it has not. */
export async function countFoods(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(foods);
  return row?.value ?? 0;
}

/** Clients to offer when creating a plan. Active only: you do not plan for an archived record. */
export async function listPlannableClients(clinicId: string): Promise<{ id: string; fullName: string }[]> {
  return db
    .select({ id: clients.id, fullName: clients.fullName })
    .from(clients)
    .where(and(eq(clients.clinicId, clinicId), eq(clients.status, 'active')))
    .orderBy(asc(clients.fullName));
}
