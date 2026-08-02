import { beforeEach, describe, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { pgConstraintName, pgErrorCode, UNIQUE_VIOLATION } from '@/db/errors';
import { clients, dishIngredients, dishes, foods, weeklyPlanMeals, weeklyPlans } from '@/db/schema';
import { createTestClient, createTestClinic, resetDatabase } from '../../../tests/helpers';

import type { ReconciledMeal } from './generate';
import {
  createPlanFromGeneration,
  publishPlan,
  replaceMeals,
  saveNutritionProfile,
  swapMealDish,
  unpublishPlan,
} from './mutations';
import { getBoard, getPublishedBoard, listPlannableClients, loadCatalog } from './queries';
import { DEFAULT_MEAL_SCHEDULE } from './schema';

/**
 * Integration tests against `TEST_DATABASE_URL`.
 *
 * What these are for: the tenant scope, the publish transaction and the constraint
 * behind it, and the guarantee that replacing one meal touches only that meal. All
 * three are properties of the database, not of a pure function, so they cannot be
 * asserted anywhere else.
 */

let clinicId: string;
let otherClinicId: string;
let clientId: string;
let dishIds: string[];

/** Two dishes with real recipes, so nutrition is derived rather than invented. */
async function seedDishes(): Promise<string[]> {
  const [food] = await db
    .insert(foods)
    .values({
      fdcId: 999001,
      description: 'Test staple, raw',
      category: 'Test',
      kcal: 300,
      protein: 12,
      fat: 5,
      carbs: 50,
    })
    .returning({ id: foods.id });

  const inserted = await db
    .insert(dishes)
    .values([
      {
        slug: 'test-lunch-a',
        nameAr: 'طبق أ',
        nameEn: 'Dish A',
        mealTypes: ['lunch'],
        tags: ['cheap'],
        allergenTags: [],
        baseServingLabel: 'حصة',
      },
      {
        slug: 'test-lunch-b',
        nameAr: 'طبق ب',
        nameEn: 'Dish B',
        mealTypes: ['lunch'],
        tags: [],
        allergenTags: ['nuts'],
        baseServingLabel: 'حصة',
      },
    ])
    .returning({ id: dishes.id });

  await db.insert(dishIngredients).values(
    inserted.map((dish) => ({ dishId: dish.id, foodId: food!.id, quantityGrams: 200, sortOrder: 0 })),
  );

  return inserted.map((dish) => dish.id);
}

/** One reconciled meal, ready to persist. */
function meal(overrides: Partial<ReconciledMeal> = {}): ReconciledMeal {
  return {
    dayOfWeek: 0,
    slotKey: 'lunch',
    label: 'غداء',
    timeOfDay: '14:00',
    budgetKcal: 600,
    sortOrder: 0,
    dishId: dishIds[0]!,
    servings: 1,
    rationaleAr: 'سبب',
    options: [{ dishId: dishIds[1]!, slug: 'test-lunch-b', servings: 1, isSimilar: true }],
    ...overrides,
  };
}

function outcome(meals: ReconciledMeal[]) {
  return {
    meals,
    warnings: [],
    unfilled: meals.filter((entry) => entry.dishId === null).length,
    model: 'test-model',
    usage: { promptTokens: 10, completionTokens: 20 },
    durationMs: 5,
  };
}

/**
 * Asserts a write is refused, and hands back its SQLSTATE and constraint name.
 *
 * Same helper and same reasoning as `src/features/booking/constraints.test.ts`:
 * `expect(promise).rejects.toThrow()` never settles for a rejected postgres.js
 * query under Bun 1.3.14, which hangs the file — the connection keeps its lock and
 * every later `beforeEach` blocks on TRUNCATE behind it. Checking the code also
 * proves *which* constraint fired, rather than merely that something threw.
 */
async function expectRejected(
  write: () => Promise<unknown>,
): Promise<{ code: string | null; constraint: string | null }> {
  try {
    await write();
  } catch (error) {
    return { code: pgErrorCode(error), constraint: pgConstraintName(error) };
  }

  throw new Error('expected the database to reject this write, but it succeeded');
}

/**
 * Creates a plan, or fails the test.
 *
 * Throws rather than returning `string | null`: a null here means the fixture is
 * broken, not that the case under test failed, and propagating it would put a `!` on
 * every call site and hide the real problem behind a downstream assertion.
 */
async function createPlan(
  meals: ReconciledMeal[] = [meal()],
  weekStartDate = '2026-08-02',
): Promise<string> {
  const planId = await createPlanFromGeneration({
    clinicId,
    clientId,
    weekStartDate,
    kcalTarget: 1800,
    weekInstructions: 'تكلفة أقل',
    outcome: outcome(meals),
  });

  if (!planId) throw new Error('fixture failed: createPlanFromGeneration returned null');

  return planId;
}

beforeEach(async () => {
  await resetDatabase();
  clinicId = await createTestClinic();
  otherClinicId = await createTestClinic('Other Clinic');
  clientId = await createTestClient(clinicId, 'سارة عبد الله');
  dishIds = await seedDishes();
});

describe('saveNutritionProfile', () => {
  test('creates a profile, then updates it in place', async () => {
    const input = {
      clientId,
      allergenTags: ['nuts' as const],
      weightKg: 84,
      dailyKcalTarget: 1800,
      proteinTargetGrams: 130,
      preferences: 'نباتي',
      dislikes: 'سمك',
      permanentInstructions: 'سكري',
      mealSchedule: DEFAULT_MEAL_SCHEDULE,
    };

    expect(await saveNutritionProfile(clinicId, input)).toBe(true);
    expect(await saveNutritionProfile(clinicId, { ...input, weightKg: 82 })).toBe(true);

    const context = await import('./queries').then((m) => m.getClientContext(clinicId, clientId));

    expect(context?.profile?.weightKg).toBe(82);
    expect(context?.profile?.allergenTags).toEqual(['nuts']);
  });

  test('refuses a client belonging to another clinic', async () => {
    const saved = await saveNutritionProfile(otherClinicId, {
      clientId,
      allergenTags: [],
      mealSchedule: DEFAULT_MEAL_SCHEDULE,
    });

    expect(saved).toBe(false);
  });
});

describe('createPlanFromGeneration', () => {
  test('writes the plan, its meals and their options', async () => {
    const planId = await createPlan();
    const board = await getBoard(clinicId, planId);

    expect(board?.status).toBe('draft');
    expect(board?.kcalTargetSnapshot).toBe(1800);
    expect(board?.model).toBe('test-model');
    expect(board?.weekInstructions).toBe('تكلفة أقل');

    const sunday = board!.days[0]!;
    expect(sunday.meals).toHaveLength(1);
    expect(sunday.meals[0]!.dish?.slug).toBe('test-lunch-a');
    expect(sunday.meals[0]!.budgetKcal).toBe(600);
    expect(sunday.meals[0]!.options.map((option) => option.slug)).toEqual(['test-lunch-b']);
  });

  test('derives nutrition from the recipe rather than storing it', async () => {
    // 200 g of a 300 kcal/100 g food at 1.5 servings = 900 kcal.
    const planId = await createPlan([meal({ servings: 1.5 })]);
    const board = await getBoard(clinicId, planId);

    expect(board!.days[0]!.meals[0]!.totals.kcal.value).toBeCloseTo(900, 6);
    expect(board!.totals.kcal.value).toBeCloseTo(900, 6);
  });

  test('refuses a client belonging to another clinic', async () => {
    const planId = await createPlanFromGeneration({
      clinicId: otherClinicId,
      clientId,
      weekStartDate: '2026-08-02',
      kcalTarget: 1800,
      weekInstructions: null,
      outcome: outcome([meal()]),
    });

    expect(planId).toBeNull();
  });

  test('replaces an existing draft for the same week rather than accumulating', async () => {
    await createPlan();
    await createPlan();

    const rows = await db
      .select({ id: weeklyPlans.id })
      .from(weeklyPlans)
      .where(and(eq(weeklyPlans.clientId, clientId), eq(weeklyPlans.status, 'draft')));

    expect(rows).toHaveLength(1);
  });

  test('leaves a published plan for the same week alone', async () => {
    const published = await createPlan();
    await publishPlan(clinicId, published!);

    await createPlan();

    const rows = await db.select({ status: weeklyPlans.status }).from(weeklyPlans);
    expect(rows.map((row) => row.status).sort()).toEqual(['draft', 'published']);
  });

  test('stores an unfillable slot as an empty meal', async () => {
    const planId = await createPlan([meal({ dishId: null, rationaleAr: null, options: [] })]);
    const board = await getBoard(clinicId, planId);

    expect(board!.days[0]!.meals[0]!.dish).toBeNull();
    expect(board!.unfilled).toBe(1);
  });
});

describe('listPlannableClients', () => {
  /**
   * These exist because the first version of this query shipped broken: a `group by`
   * subquery joined back to `weekly_plans` emitted an unqualified column that
   * PostgreSQL rejected, and the page crashed on load. Nothing here asserted the
   * query ran at all, so nothing caught it.
   */
  test('runs, and lists active clients of this clinic only', async () => {
    const otherClientId = await createTestClient(otherClinicId, 'عميل عيادة أخرى');

    const rows = await listPlannableClients(clinicId);

    expect(rows.map((row) => row.id)).toEqual([clientId]);
    expect(rows.map((row) => row.id)).not.toContain(otherClientId);
  });

  test('reports whether a nutrition profile exists', async () => {
    expect((await listPlannableClients(clinicId))[0]?.hasProfile).toBe(false);

    await saveNutritionProfile(clinicId, {
      clientId,
      allergenTags: [],
      mealSchedule: DEFAULT_MEAL_SCHEDULE,
    });

    expect((await listPlannableClients(clinicId))[0]?.hasProfile).toBe(true);
  });

  test('carries no plan status for a client with no plans', async () => {
    const [row] = await listPlannableClients(clinicId);

    expect(row?.latestPlanStatus).toBeNull();
    expect(row?.latestWeekStartDate).toBeNull();
  });

  test('reports the newest week, not the newest row', async () => {
    await createPlan([meal()], '2026-08-02');
    const older = await createPlan([meal()], '2026-07-26');
    // The older week was written most recently, so a query ordering by `updated_at`
    // alone would pick the wrong one.
    await publishPlan(clinicId, older);

    const [row] = await listPlannableClients(clinicId);

    expect(row?.latestWeekStartDate).toBe('2026-08-02');
    expect(row?.latestPlanStatus).toBe('draft');
  });

  test('excludes an archived client', async () => {
    await db.update(clients).set({ status: 'archived' }).where(eq(clients.id, clientId));

    expect(await listPlannableClients(clinicId)).toEqual([]);
  });
});

describe('getBoard', () => {
  test('is invisible to another clinic, not forbidden', async () => {
    const planId = await createPlan();

    expect(await getBoard(otherClinicId, planId)).toBeNull();
  });

  test('returns null for a malformed id rather than throwing', async () => {
    expect(await getBoard(clinicId, 'not-a-uuid')).toBeNull();
  });

  test('always returns seven days, even for a plan with one meal', async () => {
    const planId = await createPlan();
    const board = await getBoard(clinicId, planId);

    expect(board!.days).toHaveLength(7);
    expect(board!.days.map((day) => day.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe('replaceMeals', () => {
  test('replaces only the meals it is given', async () => {
    const planId = await createPlan([
      meal({ dayOfWeek: 0 }),
      meal({ dayOfWeek: 1 }),
      meal({ dayOfWeek: 2 }),
    ]);

    const replaced = await replaceMeals(
      clinicId,
      planId,
      [meal({ dayOfWeek: 1, dishId: dishIds[1]!, rationaleAr: 'جديد', options: [] })],
      'test-model-2',
    );

    expect(replaced).toBe(true);

    const board = await getBoard(clinicId, planId);

    expect(board!.days[0]!.meals[0]!.dish?.slug).toBe('test-lunch-a');
    expect(board!.days[1]!.meals[0]!.dish?.slug).toBe('test-lunch-b');
    expect(board!.days[1]!.meals[0]!.rationaleAr).toBe('جديد');
    expect(board!.days[2]!.meals[0]!.dish?.slug).toBe('test-lunch-a');
  });

  test('refuses a plan belonging to another clinic', async () => {
    const planId = await createPlan();

    expect(await replaceMeals(otherClinicId, planId, [meal()], 'x')).toBe(false);
  });

  test('refuses to touch a published plan', async () => {
    const planId = await createPlan();
    await publishPlan(clinicId, planId);

    expect(await replaceMeals(clinicId, planId, [meal()], 'x')).toBe(false);
  });
});

describe('swapMealDish', () => {
  test('swaps the dish and keeps the old one as an alternative', async () => {
    const planId = await createPlan();
    const board = await getBoard(clinicId, planId);
    const mealId = board!.days[0]!.meals[0]!.id;

    expect(await swapMealDish(clinicId, planId, mealId, dishIds[1]!, 1.5)).toBe(true);

    const after = await getBoard(clinicId, planId);
    const swapped = after!.days[0]!.meals[0]!;

    expect(swapped.dish?.slug).toBe('test-lunch-b');
    expect(swapped.dish?.servings).toBe(1.5);
    // The rationale explained the previous dish, so it must not survive the swap.
    expect(swapped.rationaleAr).toBeNull();
    expect(swapped.options.map((option) => option.slug)).toEqual(['test-lunch-a']);
  });

  test('never leaves the chosen dish in its own options', async () => {
    const planId = await createPlan();
    const board = await getBoard(clinicId, planId);
    const mealId = board!.days[0]!.meals[0]!.id;

    // Dish B starts as the alternative; swapping to it must remove it from there.
    await swapMealDish(clinicId, planId, mealId, dishIds[1]!, 1);

    const after = await getBoard(clinicId, planId);
    const slugs = after!.days[0]!.meals[0]!.options.map((option) => option.slug);

    expect(slugs).not.toContain('test-lunch-b');
  });

  test('refuses a meal belonging to another clinic plan', async () => {
    const planId = await createPlan();
    const board = await getBoard(clinicId, planId);

    expect(
      await swapMealDish(otherClinicId, planId, board!.days[0]!.meals[0]!.id, dishIds[1]!, 1),
    ).toBe(false);
  });
});

describe('publishPlan', () => {
  test('publishes a complete draft and makes it visible to the client', async () => {
    const planId = await createPlan();

    expect(await publishPlan(clinicId, planId)).toEqual({ ok: true });

    const portal = await getPublishedBoard(clientId);

    expect(portal?.id).toBe(planId);
    expect(portal?.status).toBe('published');
    expect(portal?.publishedAt).toBeInstanceOf(Date);
  });

  test('refuses a plan with an unfilled slot', async () => {
    const planId = await createPlan([meal(), meal({ dayOfWeek: 1, dishId: null, options: [] })]);

    expect(await publishPlan(clinicId, planId)).toEqual({ ok: false, reason: 'unfilled' });
    expect(await getPublishedBoard(clientId)).toBeNull();
  });

  test('archives the previous plan for the same week instead of colliding with it', async () => {
    const first = await createPlan();
    await publishPlan(clinicId, first);

    // A second draft for the same week, then published over the first.
    const second = await createPlan([meal({ dishId: dishIds[1]!, options: [] })]);
    expect(await publishPlan(clinicId, second)).toEqual({ ok: true });

    const rows = await db
      .select({ id: weeklyPlans.id, status: weeklyPlans.status })
      .from(weeklyPlans)
      .where(eq(weeklyPlans.clientId, clientId));

    expect(rows.find((row) => row.id === first)?.status).toBe('archived');
    expect(rows.find((row) => row.id === second)?.status).toBe('published');

    // And the client sees exactly one plan — the new one.
    expect((await getPublishedBoard(clientId))?.id).toBe(second);
  });

  test('refuses to publish a plan twice', async () => {
    const planId = await createPlan();
    await publishPlan(clinicId, planId);

    expect(await publishPlan(clinicId, planId)).toEqual({ ok: false, reason: 'not_draft' });
  });

  test('is invisible to another clinic', async () => {
    const planId = await createPlan();

    expect(await publishPlan(otherClinicId, planId)).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('unpublishPlan', () => {
  test('takes the plan away from the client immediately', async () => {
    const planId = await createPlan();
    await publishPlan(clinicId, planId);

    expect(await unpublishPlan(clinicId, planId)).toBe(true);
    expect(await getPublishedBoard(clientId)).toBeNull();
  });
});

describe('loadCatalog', () => {
  test('excludes dishes carrying a blocked allergen, in SQL', async () => {
    const all = await loadCatalog();
    expect(all.map((dish) => dish.slug).sort()).toEqual(['test-lunch-a', 'test-lunch-b']);

    const safe = await loadCatalog(['nuts']);
    expect(safe.map((dish) => dish.slug)).toEqual(['test-lunch-a']);
  });

  test('carries the recipe so nutrition can be derived', async () => {
    const [dish] = await loadCatalog(['nuts']);

    expect(dish!.ingredients).toHaveLength(1);
    expect(dish!.ingredients[0]!.quantityGrams).toBe(200);
    expect(dish!.ingredients[0]!.food.kcal).toBe(300);
  });
});

describe('the published-week constraint', () => {
  test('the database itself rejects two published plans for one client and week', async () => {
    const first = await createPlan();
    await publishPlan(clinicId, first);

    const second = await createPlan([meal({ options: [] })]);

    // Bypassing `publishPlan` entirely: the partial unique index is the safety net
    // that makes the archive-then-publish ordering mandatory rather than tidy.
    const rejection = await expectRejected(async () => {
      await db
        .update(weeklyPlans)
        .set({ status: 'published', publishedAt: new Date() })
        .where(eq(weeklyPlans.id, second));
    });

    expect(rejection).toEqual({
      code: UNIQUE_VIOLATION,
      constraint: 'weekly_plans_published_week_idx',
    });
  });
});

describe('the meal slot constraint', () => {
  test('the database rejects two meals in one slot of one day', async () => {
    const planId = await createPlan();

    const rejection = await expectRejected(async () => {
      await db.insert(weeklyPlanMeals).values({
        planId: planId,
        dayOfWeek: 0,
        slotKey: 'lunch',
        label: 'غداء',
        timeOfDay: '14:00',
        budgetKcal: 600,
        sortOrder: 1,
        dishId: dishIds[1]!,
        servings: 1,
      });
    });

    expect(rejection).toEqual({
      code: UNIQUE_VIOLATION,
      constraint: 'weekly_plan_meals_slot_idx',
    });
  });
});
