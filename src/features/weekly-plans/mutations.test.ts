import { beforeEach, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { normalizeArabic } from '@/features/weekly-plans/arabic-normalize';
import { pgConstraintName, pgErrorCode, UNIQUE_VIOLATION } from '@/db/errors';
import {
  catalogFoods,
  clientPlanAdherence,
  clients,
  dishIngredients,
  dishes,
  weeklyPlanMealCompletions,
  weeklyPlanMeals,
  weeklyPlans,
} from '@/db/schema';
import { toggleMealCompletion } from '@/features/portal/mutations';
import { createTestClient, createTestClinic, resetDatabase } from '../../../tests/helpers';

import type { ReconciledMeal } from './generate';
import { saveIntake } from '@/features/clients/mutations';

import {
  createPlanFromGeneration,
  deletePlan,
  publishPlan,
  replaceMeals,
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
    .insert(catalogFoods)
    .values({
      slug: `test-staple-${randomUUID()}`,
      nameAr: 'طعام تجريبي',
      nameEn: 'Test staple, raw',
      normalizedNameAr: normalizeArabic('طعام تجريبي'),
      normalizedNameEn: normalizeArabic('Test staple, raw'),
      state: 'raw',
      category: 'other',
      sourceType: 'usda_sr_legacy',

      kcal: 300,
      protein: 12,
      fat: 5,
      carbs: 50,

    })
    .returning({ id: catalogFoods.id });

  const inserted = await db
    .insert(dishes)
    .values([
      {
        slug: 'test-lunch-a',
        nameAr: 'طبق أ',
        nameEn: 'Dish A',
        mealTypes: ['lunch'],
        tags: ['economical'],
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
    inserted.map((dish) => ({ dishId: dish.id, catalogFoodId: food!.id, quantityGrams: 200, sortOrder: 0 })),
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
    sideDishIds: [],
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
    summaryAr: null,
    variety: { repaired: 0, unresolved: 0 },
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

/** The client's derived level for one day, or null when no row exists at all. */
async function adherenceLevel(forClientId: string, date: string): Promise<string | null> {
  const [row] = await db
    .select({ level: clientPlanAdherence.level })
    .from(clientPlanAdherence)
    .where(and(eq(clientPlanAdherence.clientId, forClientId), eq(clientPlanAdherence.date, date)));

  return row?.level ?? null;
}

/**
 * The week every fixture plan is built for, and the day the client is standing
 * in while reading it.
 *
 * They are the same date because `week_start_date` is day 0 of the plan and the
 * fixture meals default to `dayOfWeek: 0` — so a toggle against `PLAN_WEEK` is
 * a toggle against today, which is the only day `toggleMealCompletion` accepts.
 * `getPublishedBoard` now takes the same date for its own reason: it refuses a
 * plan whose week has already ended, so a caller has to say which day it is
 * asking about.
 */
const PLAN_WEEK = '2026-08-02';

/**
 * Creates a plan, or fails the test.
 *
 * Throws rather than returning `string | null`: a null here means the fixture is
 * broken, not that the case under test failed, and propagating it would put a `!` on
 * every call site and hide the real problem behind a downstream assertion.
 */
async function createPlan(
  meals: ReconciledMeal[] = [meal()],
  weekStartDate = PLAN_WEEK,
): Promise<string> {
  const planId = await createPlanFromGeneration({
    clinicId,
    clientId,
    weekStartDate,
    kcalTarget: 1800,
    proteinTarget: null,
    goal: null,
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
      proteinTarget: null,
      goal: null,
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

  test('leaves the per-week snapshots null when the week used the profile', async () => {
    const board = await getBoard(clinicId, await createPlan());

    expect(board?.proteinTargetSnapshot).toBeNull();
    expect(board?.goalSnapshot).toBeNull();
  });

  test('stores the per-week snapshots when the week overrode them', async () => {
    const planId = await createPlanFromGeneration({
      clinicId,
      clientId,
      weekStartDate: '2026-08-09',
      kcalTarget: 1700,
      proteinTarget: 120,
      goal: 'weight_loss',
      weekInstructions: null,
      outcome: outcome([meal()]),
    });

    const board = await getBoard(clinicId, planId!);

    expect(board?.kcalTargetSnapshot).toBe(1700);
    expect(board?.proteinTargetSnapshot).toBe(120);
    expect(board?.goalSnapshot).toBe('weight_loss');
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

    await saveIntake(clinicId, {
      clientId,
      allergenTags: [],
      customAllergens: [],
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

    const portal = await getPublishedBoard(clientId, PLAN_WEEK);

    expect(portal?.id).toBe(planId);
    expect(portal?.status).toBe('published');
    expect(portal?.publishedAt).toBeInstanceOf(Date);
  });

  test('refuses a plan with an unfilled slot', async () => {
    const planId = await createPlan([meal(), meal({ dayOfWeek: 1, dishId: null, options: [] })]);

    expect(await publishPlan(clinicId, planId)).toEqual({ ok: false, reason: 'unfilled' });
    expect(await getPublishedBoard(clientId, PLAN_WEEK)).toBeNull();
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
    expect((await getPublishedBoard(clientId, PLAN_WEEK))?.id).toBe(second);
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
    expect(await getPublishedBoard(clientId, PLAN_WEEK)).toBeNull();
  });

  /**
   * The live fault this rule was written for. Unpublishing the current week
   * used to *reveal* an older plan the dietitian had left published, so the
   * take-down appeared to do nothing — and only for clients who had an older
   * plan to fall back onto, which is what made it look account-specific.
   */
  test('clears the portal even when an older plan is still published', async () => {
    const lastWeek = await createPlan([meal()], '2026-07-26');
    await publishPlan(clinicId, lastWeek);

    const thisWeek = await createPlan([meal()], PLAN_WEEK);
    await publishPlan(clinicId, thisWeek);

    expect((await getPublishedBoard(clientId, PLAN_WEEK))?.id).toBe(thisWeek);

    await unpublishPlan(clinicId, thisWeek);

    expect(await getPublishedBoard(clientId, PLAN_WEEK)).toBeNull();
  });
});

/**
 * Which plan the portal shows, and when it shows none.
 *
 * The rule is deliberately absolute in both directions: published *and*
 * covering today. The tick on a meal card renders only for the day that is
 * today, and the home screen's commitment figure counts only today's meals — so
 * a plan for any other week is seven days a client cannot report on. See the
 * header on `getPublishedBoard`.
 */
describe('getPublishedBoard choice of week', () => {
  test('serves a plan on the last day of its own week', async () => {
    const planId = await createPlan();
    await publishPlan(clinicId, planId);

    // 2026-08-02 + 6 — the plan's seventh and final day, still its week.
    expect((await getPublishedBoard(clientId, '2026-08-08'))?.id).toBe(planId);
  });

  test('drops a published plan the day after its week ends', async () => {
    const planId = await createPlan();
    await publishPlan(clinicId, planId);

    expect(await getPublishedBoard(clientId, '2026-08-09')).toBeNull();
  });

  test('withholds a plan published for a week that has not started', async () => {
    const nextWeek = await createPlan([meal()], '2026-08-09');
    await publishPlan(clinicId, nextWeek);

    // It appears on 2026-08-09 and not a day sooner: until then the client has
    // no plan for the week they are actually in.
    expect(await getPublishedBoard(clientId, PLAN_WEEK)).toBeNull();
    expect((await getPublishedBoard(clientId, '2026-08-09'))?.id).toBe(nextWeek);
  });

  /**
   * A client holding both this week's plan and next week's is eating from this
   * week. A plain `ORDER BY week_start_date DESC` handed them the future one,
   * whose every day is `future` and therefore carries no tick at all.
   */
  test('takes the week containing today over one published for the week ahead', async () => {
    const thisWeek = await createPlan([meal()], PLAN_WEEK);
    await publishPlan(clinicId, thisWeek);

    const nextWeek = await createPlan([meal()], '2026-08-09');
    await publishPlan(clinicId, nextWeek);

    expect((await getPublishedBoard(clientId, '2026-08-05'))?.id).toBe(thisWeek);
  });

  test('takes the week containing today over one whose week has ended', async () => {
    const lastWeek = await createPlan([meal()], '2026-07-26');
    await publishPlan(clinicId, lastWeek);

    const thisWeek = await createPlan([meal()], PLAN_WEEK);
    await publishPlan(clinicId, thisWeek);

    expect((await getPublishedBoard(clientId, PLAN_WEEK))?.id).toBe(thisWeek);
  });
});

/**
 * Reproduces the bug found live in `dietitian_dev`: a client ticks meals
 * against a published plan, the dietitian unpublishes it to fix something,
 * and the edit that follows deletes the ticked meals out from under the
 * completions — cascading them away — while `client_plan_adherence` carried
 * no relation to either table and so was never told. The client's Progress
 * tab kept reporting a day as fully followed with zero completions behind
 * it, forever, because nothing but a live tick on that exact date ever wrote
 * to that table.
 */
describe('adherence recompute on plan edits', () => {
  test('replaceMeals clears stale adherence rather than leaving it behind', async () => {
    const planId = await createPlan([meal({ slotKey: 'breakfast' }), meal({ slotKey: 'lunch' })]);
    await publishPlan(clinicId, planId);

    const board = await getPublishedBoard(clientId, PLAN_WEEK);
    const mealIds = board!.days[0]!.meals.map((row) => row.id);

    for (const mealId of mealIds) {
      expect((await toggleMealCompletion({ clientId, clinicId, today: '2026-08-02' }, mealId, true)).ok).toBe(true);
    }

    expect(await adherenceLevel(clientId, '2026-08-02')).toBe('full');

    await unpublishPlan(clinicId, planId);
    expect(
      await replaceMeals(
        clinicId,
        planId,
        [
          meal({ slotKey: 'breakfast', dishId: dishIds[1]! }),
          meal({ slotKey: 'lunch', dishId: dishIds[1]! }),
        ],
        'test-model-2',
      ),
    ).toBe(true);

    const remaining = await db
      .select({ id: weeklyPlanMealCompletions.id })
      .from(weeklyPlanMealCompletions)
      .where(eq(weeklyPlanMealCompletions.clientId, clientId));

    expect(remaining).toHaveLength(0);
    expect(await adherenceLevel(clientId, '2026-08-02')).toBe('missed');
  });

  test('replaceMeals leaves days it did not touch alone', async () => {
    const planId = await createPlan([
      meal({ dayOfWeek: 0, slotKey: 'lunch' }),
      meal({ dayOfWeek: 1, slotKey: 'lunch' }),
    ]);
    await publishPlan(clinicId, planId);

    const board = await getPublishedBoard(clientId, PLAN_WEEK);
    await toggleMealCompletion({ clientId, clinicId, today: '2026-08-03' }, board!.days[1]!.meals[0]!.id, true);

    expect(await adherenceLevel(clientId, '2026-08-03')).toBe('full');

    await unpublishPlan(clinicId, planId);
    await replaceMeals(clinicId, planId, [meal({ dayOfWeek: 0, slotKey: 'lunch', dishId: dishIds[1]! })], 'x');

    // Only Sunday (day 0) was replaced — Monday's report must survive untouched.
    expect(await adherenceLevel(clientId, '2026-08-03')).toBe('full');
  });

  test('deletePlan clears every day of the plan’s week rather than leaving stale adherence behind', async () => {
    const planId = await createPlan([meal({ slotKey: 'breakfast' }), meal({ slotKey: 'lunch' })]);
    await publishPlan(clinicId, planId);

    const board = await getPublishedBoard(clientId, PLAN_WEEK);
    await toggleMealCompletion({ clientId, clinicId, today: '2026-08-02' }, board!.days[0]!.meals[0]!.id, true);

    expect(await adherenceLevel(clientId, '2026-08-02')).toBe('partial');

    await unpublishPlan(clinicId, planId);
    expect(await deletePlan(clinicId, planId)).toBe(true);

    expect(await adherenceLevel(clientId, '2026-08-02')).toBeNull();
  });

  test('createPlanFromGeneration clears stale adherence from the draft it replaces', async () => {
    const planId = await createPlan([meal({ slotKey: 'breakfast' }), meal({ slotKey: 'lunch' })]);
    await publishPlan(clinicId, planId);

    const board = await getPublishedBoard(clientId, PLAN_WEEK);
    for (const row of board!.days[0]!.meals) {
      await toggleMealCompletion({ clientId, clinicId, today: '2026-08-02' }, row.id, true);
    }

    expect(await adherenceLevel(clientId, '2026-08-02')).toBe('full');

    await unpublishPlan(clinicId, planId);

    // Regenerating the same client and week deletes the old draft — still
    // carrying the completions from when it was published — and replaces it
    // wholesale with a brand new plan and meals.
    const regeneratedId = await createPlan([meal({ slotKey: 'breakfast' })]);
    expect(regeneratedId).not.toBe(planId);

    expect(await adherenceLevel(clientId, '2026-08-02')).toBe('missed');
  });
});

describe('loadCatalog', () => {
  test('excludes dishes carrying a blocked allergen, in SQL', async () => {
    const all = await loadCatalog(clinicId);
    expect(all.map((dish) => dish.slug).sort()).toEqual(['test-lunch-a', 'test-lunch-b']);

    const safe = await loadCatalog(clinicId, ['nuts']);
    expect(safe.map((dish) => dish.slug)).toEqual(['test-lunch-a']);
  });

  test('carries the recipe so nutrition can be derived', async () => {
    const [dish] = await loadCatalog(clinicId, ['nuts']);

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
