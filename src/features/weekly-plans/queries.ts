import { and, asc, count, desc, eq, ilike, inArray, ne, or, sql, type SQL } from 'drizzle-orm';

import { db } from '@/db';
import {
  clientNutritionProfiles,
  clients,
  dishIngredients,
  dishes,
  foods,
  weeklyPlanMealOptions,
  weeklyPlanMeals,
  weeklyPlans,
  type MealSlot,
} from '@/db/schema';
import { calculateAge } from '@/features/clients/age';

import type { CatalogDish } from './generate';
import {
  baseServingKcal,
  combineTotals,
  dishTotals,
  emptyTotals,
  type DishDetail,
  type NutrientTotals,
} from './nutrition';
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

/**
 * Reads for the weekly-plans feature.
 *
 * Imports nothing from Next.js, so every function here can be called from a test
 * or a script. `clinicId` is a required first argument on everything that touches
 * a plan or a profile, so forgetting the tenant scope is a type error rather than
 * a silent leak — the same rule V1 follows.
 */

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

/** The columns making up a food's composition, shared by the readers below. */
const foodColumns = {
  id: foods.id,
  description: foods.description,
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
export async function loadCatalog(allergens: readonly string[] = []): Promise<DishDetail[]> {
  const conditions: SQL[] = [eq(dishes.isActive, true)];

  if (allergens.length) {
    // `&&` is the array-overlap operator: true when the dish carries ANY of the
    // client's allergens. Negated, so only clean dishes survive.
    conditions.push(sql`not (${dishes.allergenTags} && ${textArray(allergens)})`);
  }

  const dishRows = await db
    .select({
      id: dishes.id,
      slug: dishes.slug,
      nameAr: dishes.nameAr,
      nameEn: dishes.nameEn,
      mealTypes: dishes.mealTypes,
      tags: dishes.tags,
      allergenTags: dishes.allergenTags,
      baseServingLabel: dishes.baseServingLabel,
      isActive: dishes.isActive,
    })
    .from(dishes)
    .where(and(...conditions))
    .orderBy(asc(dishes.slug));

  if (!dishRows.length) return [];

  const ingredientRows = await db
    .select({
      dishId: dishIngredients.dishId,
      quantityGrams: dishIngredients.quantityGrams,
      food: foodColumns,
    })
    .from(dishIngredients)
    .innerJoin(foods, eq(foods.id, dishIngredients.foodId))
    .where(
      inArray(
        dishIngredients.dishId,
        dishRows.map((dish) => dish.id),
      ),
    )
    .orderBy(asc(dishIngredients.sortOrder));

  const byDish = new Map<string, DishDetail['ingredients']>();
  for (const { dishId, ...ingredient } of ingredientRows) {
    const bucket = byDish.get(dishId);
    if (bucket) bucket.push(ingredient);
    else byDish.set(dishId, [ingredient]);
  }

  return dishRows.map((dish) => ({ ...dish, ingredients: byDish.get(dish.id) ?? [] }));
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
export async function loadDishesByIds(ids: readonly string[]): Promise<DishDetail[]> {
  if (!ids.length) return [];

  const dishRows = await db
    .select({
      id: dishes.id,
      slug: dishes.slug,
      nameAr: dishes.nameAr,
      nameEn: dishes.nameEn,
      mealTypes: dishes.mealTypes,
      tags: dishes.tags,
      allergenTags: dishes.allergenTags,
      baseServingLabel: dishes.baseServingLabel,
      isActive: dishes.isActive,
    })
    .from(dishes)
    .where(inArray(dishes.id, [...ids]))
    .orderBy(asc(dishes.slug));

  if (!dishRows.length) return [];

  const ingredientRows = await db
    .select({
      dishId: dishIngredients.dishId,
      quantityGrams: dishIngredients.quantityGrams,
      food: foodColumns,
    })
    .from(dishIngredients)
    .innerJoin(foods, eq(foods.id, dishIngredients.foodId))
    .where(
      inArray(
        dishIngredients.dishId,
        dishRows.map((dish) => dish.id),
      ),
    )
    .orderBy(asc(dishIngredients.sortOrder));

  const byDish = new Map<string, DishDetail['ingredients']>();
  for (const { dishId, ...ingredient } of ingredientRows) {
    const bucket = byDish.get(dishId);
    if (bucket) bucket.push(ingredient);
    else byDish.set(dishId, [ingredient]);
  }

  return dishRows.map((dish) => ({ ...dish, ingredients: byDish.get(dish.id) ?? [] }));
}

/** The catalog reduced to what generation needs: identity, tags, and energy per serving. */
export function toPromptCatalog(catalog: readonly DishDetail[]): CatalogDish[] {
  return catalog.map((dish) => ({
    id: dish.id,
    slug: dish.slug,
    nameAr: dish.nameAr,
    mealTypes: dish.mealTypes,
    tags: dish.tags,
    allergenTags: dish.allergenTags,
    baseKcal: baseServingKcal(dish.ingredients),
    baseProtein: dishTotals(dish.ingredients, 1).protein.value,
  }));
}

export type DishListResult = {
  items: (DishDetail & { baseKcal: number; totals: NutrientTotals })[];
  total: number;
  page: number;
  pageCount: number;
};

export const DISHES_PAGE_SIZE = 20;

/**
 * The browsable catalog.
 *
 * Read-only in this cut — there is no dish editor yet — so this exists to answer
 * "what was the AI choosing from", which is the first question anyone asks when a
 * generated plan looks wrong.
 */
export async function listDishes(input: {
  q?: string;
  mealType?: string;
  page: number;
}): Promise<DishListResult> {
  const conditions: SQL[] = [eq(dishes.isActive, true)];

  if (input.q) {
    const term = `%${input.q.replace(/[\\%_]/g, '\\$&')}%`;
    // Both names, because a dietitian will search in whichever language is to
    // hand and neither is authoritative.
    conditions.push(or(ilike(dishes.nameAr, term), ilike(dishes.nameEn, term), ilike(dishes.slug, term))!);
  }

  if (input.mealType) {
    conditions.push(sql`${dishes.mealTypes} && ${textArray([input.mealType])}`);
  }

  const where = and(...conditions);

  const [totals] = await db.select({ value: count() }).from(dishes).where(where);
  const total = totals?.value ?? 0;

  const page = await db
    .select({ id: dishes.id })
    .from(dishes)
    .where(where)
    .orderBy(asc(dishes.nameAr))
    .limit(DISHES_PAGE_SIZE)
    .offset((input.page - 1) * DISHES_PAGE_SIZE);

  const ids = new Set(page.map((row) => row.id));
  // Recipes come from the same loader the rest of the feature uses, so the
  // numbers on this page are the numbers a plan would use.
  const catalog = await loadCatalog();

  const items = catalog
    .filter((dish) => ids.has(dish.id))
    .map((dish) => ({
      ...dish,
      baseKcal: baseServingKcal(dish.ingredients),
      totals: dishTotals(dish.ingredients, 1),
    }))
    .sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'));

  return {
    items,
    total,
    page: input.page,
    pageCount: Math.max(1, Math.ceil(total / DISHES_PAGE_SIZE)),
  };
}

export async function listMealTypes(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ mealType: sql<string>`unnest(${dishes.mealTypes})` })
    .from(dishes)
    .where(eq(dishes.isActive, true));

  return rows.map((row) => row.mealType).sort();
}

// ---------------------------------------------------------------------------
// Clients and profiles
// ---------------------------------------------------------------------------

export type PlannableClient = {
  id: string;
  fullName: string;
  color: string;
  /** Whether a plan can be generated at all, so the rail can say so. */
  hasProfile: boolean;
  latestPlanStatus: string | null;
  latestWeekStartDate: string | null;
};

/**
 * Clients to offer in the rail. Active only — you do not plan for an archived record.
 *
 * Carries each client's latest plan status so the rail can show who has a live
 * plan and who has an untouched draft, which is what a dietitian opening the page
 * on a Sunday morning actually wants to know.
 */
export async function listPlannableClients(clinicId: string): Promise<PlannableClient[]> {
  const clientRows = await db
    .select({
      id: clients.id,
      fullName: clients.fullName,
      color: clients.color,
      profileId: clientNutritionProfiles.id,
    })
    .from(clients)
    .leftJoin(clientNutritionProfiles, eq(clientNutritionProfiles.clientId, clients.id))
    .where(and(eq(clients.clinicId, clinicId), eq(clients.status, 'active')))
    .orderBy(asc(clients.fullName));

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
  const planRows = await db
    .selectDistinctOn([weeklyPlans.clientId], {
      clientId: weeklyPlans.clientId,
      weekStartDate: weeklyPlans.weekStartDate,
      status: weeklyPlans.status,
    })
    .from(weeklyPlans)
    .where(eq(weeklyPlans.clinicId, clinicId))
    .orderBy(asc(weeklyPlans.clientId), desc(weeklyPlans.weekStartDate), desc(weeklyPlans.updatedAt));

  const latestByClient = new Map(planRows.map((row) => [row.clientId, row]));

  return clientRows.map((row) => {
    const latest = latestByClient.get(row.id);

    return {
      id: row.id,
      fullName: row.fullName,
      color: row.color,
      hasProfile: row.profileId !== null,
      latestPlanStatus: latest?.status ?? null,
      latestWeekStartDate: latest?.weekStartDate ?? null,
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
  rationaleAr: string | null;
  totals: NutrientTotals;
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
  generatedBy: string;
  model: string | null;
  updatedAt: Date;
  days: BoardDay[];
  totals: NutrientTotals;
  /** Slots with no dish, across the week. What the banner counts. */
  unfilled: number;
};

/** One client's plans, newest week first, for the history dropdown. */
export async function listPlans(
  clinicId: string,
  clientId: string,
): Promise<{ id: string; weekStartDate: string; status: string; updatedAt: Date }[]> {
  return db
    .select({
      id: weeklyPlans.id,
      weekStartDate: weeklyPlans.weekStartDate,
      status: weeklyPlans.status,
      updatedAt: weeklyPlans.updatedAt,
    })
    .from(weeklyPlans)
    .where(and(eq(weeklyPlans.clinicId, clinicId), eq(weeklyPlans.clientId, clientId)))
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
 * The client's own view: the published plan for the latest week.
 *
 * Scoped by `client_id` and `status` only — a portal session has no clinic, and
 * adding one would mean trusting a value the client's session does not carry. The
 * plan is reachable because it belongs to them, which is the actual authorisation
 * rule.
 */
export async function getPublishedBoard(clientId: string): Promise<Board | null> {
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
      generatedBy: weeklyPlans.generatedBy,
      model: weeklyPlans.model,
      updatedAt: weeklyPlans.updatedAt,
    })
    .from(weeklyPlans)
    .innerJoin(clients, eq(clients.id, weeklyPlans.clientId))
    .where(and(eq(weeklyPlans.clientId, clientId), eq(weeklyPlans.status, 'published')))
    .orderBy(desc(weeklyPlans.weekStartDate))
    .limit(1);

  return plan ? assembleBoard(plan) : null;
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

  // Only the dishes this plan references, and by id rather than through the catalog:
  // a plan may hold a dish the client has since become allergic to, or one that has
  // since been retired, and either way the card must show what is actually planned
  // rather than a blank the dietitian cannot explain.
  const referenced = new Set<string>();
  for (const meal of mealRows) if (meal.dishId) referenced.add(meal.dishId);
  for (const option of optionRows) referenced.add(option.dishId);

  const dishById = new Map((await loadDishesByIds([...referenced])).map((dish) => [dish.id, dish]));

  // Each meal carries the budget it was generated against, so the board shows the
  // same figure the model was given even after the client's profile has moved on.
  const budgetByMeal = new Map(mealRows.map((meal) => [meal.id, meal.budgetKcal]));

  const optionsByMeal = new Map<string, BoardOption[]>();
  for (const option of optionRows) {
    const dish = dishById.get(option.dishId);
    if (!dish) continue;

    const kcal = dishTotals(dish.ingredients, option.servings).kcal.value;
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

    days[meal.dayOfWeek]?.meals.push({
      id: meal.id,
      slotKey: meal.slotKey,
      label: meal.label,
      timeOfDay: toTimeInput(meal.timeOfDay),
      dish: dish ? { ...dish, servings: meal.servings } : null,
      rationaleAr: meal.rationaleAr,
      totals: dish ? dishTotals(dish.ingredients, meal.servings) : emptyTotals(),
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
  slotKey,
  budgetKcal,
  allergens,
  excludeSlugs,
}: {
  slotKey: string;
  budgetKcal: number;
  allergens: readonly string[];
  excludeSlugs: readonly string[];
}): Promise<SwapCandidate[]> {
  const catalog = await loadCatalog(allergens);

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
export async function swapCandidatesByMeal(
  board: Board,
  allergens: readonly string[],
): Promise<Record<string, SwapCandidate[]>> {
  const catalog = await loadCatalog(allergens);

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
        allergens,
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
