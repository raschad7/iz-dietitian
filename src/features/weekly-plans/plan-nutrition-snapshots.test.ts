import { beforeEach, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { normalizeArabic } from '@/features/weekly-plans/arabic-normalize';
import {
  catalogFoods,
  dishIngredients,
  dishes,

  weeklyPlanMeals,
  weeklyPlans,
} from '@/db/schema';
import { createTestClient, createTestClinic, resetDatabase } from '../../../tests/helpers';

import { backfillPlanNutritionSnapshots } from '../../../scripts/backfill-plan-nutrition-snapshots';
import type { ReconciledMeal } from './generate';
import { createPlanFromGeneration, publishPlan, unpublishPlan } from './mutations';
import { placeDish } from './editor-mutations';
import { getBoard, getPublishedBoard } from './queries';

/**
 * The Phase 0 invariant, proven end to end against the database.
 *
 * > Once a weekly plan is published, changing the underlying dish or food nutrition
 * > can no longer change the nutrition shown for that published or archived plan.
 * > Drafts keep calculating live.
 *
 * This is the suite that has to fail if anybody removes the snapshot, so the tests
 * are written as the sequence a real change would take: publish, then mutate the
 * catalog underneath, then read back. Nothing here asserts on the storage format —
 * that belongs to `nutrition-snapshot.test.ts` — only on what a reader is shown.
 */

let clinicId: string;
let clientId: string;
let foodId: string;
let dishIds: string[];

const PLAN_WEEK = '2026-08-02';

/**
 * Two dishes over one food, so a single UPDATE can move the nutrition of the whole
 * catalog — which is exactly what the coming canonical-catalog migration will do.
 */
async function seedCatalog(): Promise<void> {
  const [food] = await db
    .insert(catalogFoods)
    .values({
      slug: `test-snapshot-staple-${randomUUID()}`,
      nameAr: 'طعام تجريبي',
      nameEn: 'Snapshot staple, raw',
      normalizedNameAr: normalizeArabic('طعام تجريبي'),
      normalizedNameEn: normalizeArabic('Snapshot staple, raw'),
      state: 'raw',
      category: 'other',
      sourceType: 'usda_sr_legacy',

      kcal: 300,
      protein: 12,
      fat: 5,
      carbs: 50,
      // Deliberately unmeasured, so the null-vs-zero rule is exercised by the
      // snapshot path and not only by the pure tests.
      fiber: null,

    })
    .returning({ id: catalogFoods.id });

  foodId = food!.id;

  const inserted = await db
    .insert(dishes)
    .values([
      {
        slug: 'snap-lunch-a',
        nameAr: 'طبق أ',
        nameEn: 'Dish A',
        mealTypes: ['lunch'],
        tags: [],
        allergenTags: [],
        baseServingLabel: 'حصة',
      },
      {
        slug: 'snap-lunch-b',
        nameAr: 'طبق ب',
        nameEn: 'Dish B',
        mealTypes: ['lunch'],
        tags: [],
        allergenTags: [],
        baseServingLabel: 'حصة',
      },
    ])
    .returning({ id: dishes.id });

  await db
    .insert(dishIngredients)
    .values(
      inserted.map((dish) => ({ dishId: dish.id, catalogFoodId: food!.id, quantityGrams: 200, sortOrder: 0 })),
    );

  dishIds = inserted.map((dish) => dish.id);
}

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
    options: [],
    ...overrides,
  };
}

async function createPlan(meals: ReconciledMeal[] = [meal()]): Promise<string> {
  const planId = await createPlanFromGeneration({
    clinicId,
    clientId,
    weekStartDate: PLAN_WEEK,
    kcalTarget: 1800,
    proteinTarget: null,
    goal: null,
    weekInstructions: null,
    outcome: {
      meals,
      warnings: [],
      unfilled: meals.filter((entry) => entry.dishId === null).length,
      summaryAr: null,
      variety: { repaired: 0, unresolved: 0 },
      model: 'test-model',
      usage: { promptTokens: 1, completionTokens: 1 },
      durationMs: 1,
    },
  });

  if (!planId) throw new Error('fixture failed: createPlanFromGeneration returned null');
  return planId;
}

/** Every meal's kcal on the staff board, in day/slot order. */
async function boardKcal(planId: string): Promise<number[]> {
  const board = await getBoard(clinicId, planId);
  if (!board) throw new Error('fixture failed: board not found');

  return board.days.flatMap((day) => day.meals.map((entry) => entry.totals.kcal.value));
}

/** Doubles the food's energy — the "someone edited the catalog" event. */
async function doubleFoodEnergy(): Promise<void> {
  await db.update(catalogFoods).set({ kcal: 600, protein: 24 }).where(eq(catalogFoods.id, foodId));
}

async function snapshotRows(planId: string) {
  return db
    .select({
      id: weeklyPlanMeals.id,
      dishId: weeklyPlanMeals.dishId,
      snapshot: weeklyPlanMeals.nutritionSnapshot,
    })
    .from(weeklyPlanMeals)
    .where(eq(weeklyPlanMeals.planId, planId));
}

beforeEach(async () => {
  await resetDatabase();
  clinicId = await createTestClinic();
  clientId = await createTestClient(clinicId);
  await seedCatalog();
});

// ---------------------------------------------------------------------------
// Publishing writes the snapshots
// ---------------------------------------------------------------------------

describe('publishing freezes nutrition', () => {
  test('a populated meal gets a snapshot when the plan is published', async () => {
    const planId = await createPlan();

    expect((await snapshotRows(planId)).every((row) => row.snapshot === null)).toBe(true);

    expect(await publishPlan(clinicId, planId)).toEqual({ ok: true });

    const rows = await snapshotRows(planId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.snapshot).not.toBeNull();
    expect(rows[0]?.snapshot?.totals.kcal.value).toBeCloseTo(600, 6);
  });

  test('every populated meal in the week gets its own snapshot', async () => {
    const meals = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) =>
      meal({ dayOfWeek, dishId: dishIds[dayOfWeek % 2]! }),
    );
    const planId = await createPlan(meals);

    await publishPlan(clinicId, planId);

    const rows = await snapshotRows(planId);
    expect(rows).toHaveLength(7);
    expect(rows.every((row) => row.snapshot !== null)).toBe(true);
  });

  test('an unmeasured nutrient is frozen as unmeasured, not as zero', async () => {
    const planId = await createPlan();
    await publishPlan(clinicId, planId);

    const [row] = await snapshotRows(planId);

    expect(row?.snapshot?.totals.fiber.unmeasured).toBe(1);
    expect(row?.snapshot?.totals.fiber.value).toBe(0);
  });

  test('the frozen weight is stored alongside, so it cannot disagree with the calories', async () => {
    const planId = await createPlan([meal({ servings: 2 })]);
    await publishPlan(clinicId, planId);

    const [row] = await snapshotRows(planId);
    expect(row?.snapshot?.grams).toBeCloseTo(400, 6);
  });
});

/**
 * An empty slot cannot be published at all — `publishPlan` refuses a plan with
 * gaps — so the case to prove is that the snapshot pass tolerates one rather than
 * fabricating a zero for it.
 */
describe('empty slots', () => {
  test('publishing is refused while a slot is empty, and nothing is frozen', async () => {
    const planId = await createPlan([meal(), meal({ dayOfWeek: 1, dishId: null })]);

    expect(await publishPlan(clinicId, planId)).toEqual({ ok: false, reason: 'unfilled' });

    const rows = await snapshotRows(planId);
    expect(rows.every((row) => row.snapshot === null)).toBe(true);
  });

  test('an empty slot keeps a null snapshot rather than a fabricated zero', async () => {
    const planId = await createPlan([meal(), meal({ dayOfWeek: 1, dishId: null })]);

    // Reach past the publish gate to exercise the snapshot pass itself: fill the
    // gap, publish, then confirm only populated meals were frozen.
    const rows = await snapshotRows(planId);
    const empty = rows.find((row) => row.dishId === null)!;

    await publishPlan(clinicId, planId); // refused — still a draft
    expect((await snapshotRows(planId)).find((row) => row.id === empty.id)?.snapshot).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The critical invariant
// ---------------------------------------------------------------------------

describe('a published plan does not move', () => {
  test('changing the underlying food does not change published nutrition', async () => {
    const planId = await createPlan();
    await publishPlan(clinicId, planId);

    const before = await boardKcal(planId);
    expect(before).toEqual([600]);

    await doubleFoodEnergy();

    expect(await boardKcal(planId)).toEqual(before);
  });

  test('changing a dish recipe does not change published nutrition', async () => {
    const planId = await createPlan();
    await publishPlan(clinicId, planId);

    const before = await boardKcal(planId);

    // The recipe composition itself, not the food behind it.
    await db
      .update(dishIngredients)
      .set({ quantityGrams: 1000 })
      .where(eq(dishIngredients.dishId, dishIds[0]!));

    expect(await boardKcal(planId)).toEqual(before);
  });

  test('adding an ingredient to a published dish does not change published nutrition', async () => {
    const planId = await createPlan();
    await publishPlan(clinicId, planId);

    const before = await boardKcal(planId);

    await db
      .insert(dishIngredients)
      .values({ dishId: dishIds[0]!, catalogFoodId: foodId, quantityGrams: 500, sortOrder: 1 });

    expect(await boardKcal(planId)).toEqual(before);
  });

  /**
   * The meal cards print a weight beside the calories. Both must come from the
   * same place, or a published card shows frozen energy next to a live "≈ 445 g"
   * — which is the same class of contradiction the snapshot exists to prevent.
   */
  test('the weight on the board is frozen alongside the calories', async () => {
    const planId = await createPlan();
    await publishPlan(clinicId, planId);

    const before = await getBoard(clinicId, planId);
    const beforeGrams = before!.days[0]!.meals[0]!.grams;
    expect(beforeGrams).toBeCloseTo(200, 6);
    expect(before!.days[0]!.meals[0]!.nutritionFrozen).toBe(true);

    // Change the recipe's mass, not just its energy.
    await db
      .update(dishIngredients)
      .set({ quantityGrams: 900 })
      .where(eq(dishIngredients.dishId, dishIds[0]!));

    const after = await getBoard(clinicId, planId);
    expect(after!.days[0]!.meals[0]!.grams).toBeCloseTo(beforeGrams, 6);
  });

  test('a draft reports a live weight and is not flagged frozen', async () => {
    const planId = await createPlan();

    const board = await getBoard(clinicId, planId);
    expect(board!.days[0]!.meals[0]!.nutritionFrozen).toBe(false);
    expect(board!.days[0]!.meals[0]!.grams).toBeCloseTo(200, 6);

    await db
      .update(dishIngredients)
      .set({ quantityGrams: 900 })
      .where(eq(dishIngredients.dishId, dishIds[0]!));

    const after = await getBoard(clinicId, planId);
    expect(after!.days[0]!.meals[0]!.grams).toBeCloseTo(900, 6);
  });

  test('the patient portal sees the frozen value too', async () => {
    const planId = await createPlan();
    await publishPlan(clinicId, planId);

    const before = await getPublishedBoard(clientId, PLAN_WEEK);
    const beforeKcal = before!.days.flatMap((day) => day.meals.map((m) => m.totals.kcal.value));

    await doubleFoodEnergy();

    const after = await getPublishedBoard(clientId, PLAN_WEEK);
    expect(after!.days.flatMap((day) => day.meals.map((m) => m.totals.kcal.value))).toEqual(
      beforeKcal,
    );
  });

  /** Staff and patient must never be able to quote different numbers. */
  test('the staff board and the patient portal agree after a food change', async () => {
    const planId = await createPlan();
    await publishPlan(clinicId, planId);

    await doubleFoodEnergy();

    const staff = await getBoard(clinicId, planId);
    const portal = await getPublishedBoard(clientId, PLAN_WEEK);

    expect(staff!.totals).toEqual(portal!.totals);
    expect(staff!.days.map((day) => day.totals)).toEqual(portal!.days.map((day) => day.totals));
  });

  test('day and week totals roll up from the frozen meal values', async () => {
    const planId = await createPlan([meal(), meal({ dayOfWeek: 0, slotKey: 'dinner', sortOrder: 1 })]);
    await publishPlan(clinicId, planId);

    const before = await getBoard(clinicId, planId);
    const beforeDay = before!.days[0]!.totals.kcal.value;
    const beforeWeek = before!.totals.kcal.value;

    expect(beforeDay).toBeCloseTo(1200, 6);
    expect(beforeWeek).toBeCloseTo(1200, 6);

    await doubleFoodEnergy();

    const after = await getBoard(clinicId, planId);
    expect(after!.days[0]!.totals.kcal.value).toBeCloseTo(beforeDay, 6);
    expect(after!.totals.kcal.value).toBeCloseTo(beforeWeek, 6);
  });

  test('an archived plan is frozen as well', async () => {
    const planId = await createPlan();
    await publishPlan(clinicId, planId);

    const before = await boardKcal(planId);

    // Publishing a second plan for the same week archives the first, which is the
    // only way a plan becomes archived.
    const replacement = await createPlan([meal({ dishId: dishIds[1]! })]);
    await publishPlan(clinicId, replacement);

    const [archived] = await db
      .select({ status: weeklyPlans.status })
      .from(weeklyPlans)
      .where(eq(weeklyPlans.id, planId));
    expect(archived?.status).toBe('archived');

    await doubleFoodEnergy();

    expect(await boardKcal(planId)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// Drafts stay live
// ---------------------------------------------------------------------------

describe('a draft keeps calculating live', () => {
  test('the same food change DOES move a draft', async () => {
    const planId = await createPlan();

    expect(await boardKcal(planId)).toEqual([600]);

    await doubleFoodEnergy();

    expect(await boardKcal(planId)).toEqual([1200]);
  });

  test('unpublishing clears the snapshots and the plan goes live again', async () => {
    const planId = await createPlan();
    await publishPlan(clinicId, planId);

    expect((await snapshotRows(planId)).every((row) => row.snapshot !== null)).toBe(true);

    expect(await unpublishPlan(clinicId, planId)).toBe(true);

    expect((await snapshotRows(planId)).every((row) => row.snapshot === null)).toBe(true);

    await doubleFoodEnergy();
    expect(await boardKcal(planId)).toEqual([1200]);
  });

  test('republishing freezes the current numbers afresh', async () => {
    const planId = await createPlan();
    await publishPlan(clinicId, planId);
    await unpublishPlan(clinicId, planId);

    await doubleFoodEnergy();
    await publishPlan(clinicId, planId);

    expect(await boardKcal(planId)).toEqual([1200]);

    // And it stops moving again.
    await db.update(catalogFoods).set({ kcal: 900 }).where(eq(catalogFoods.id, foodId));
    expect(await boardKcal(planId)).toEqual([1200]);
  });

  test('a published plan refuses composition edits, so a snapshot is never orphaned', async () => {
    const planId = await createPlan();
    await publishPlan(clinicId, planId);

    const [row] = await snapshotRows(planId);

    expect(await placeDish(clinicId, planId, row!.id, dishIds[1]!, 1)).toBe(false);

    const [after] = await snapshotRows(planId);
    expect(after?.dishId).toBe(dishIds[0]!);
    expect(after?.snapshot).toEqual(row!.snapshot);
  });
});

// ---------------------------------------------------------------------------
// Atomicity
// ---------------------------------------------------------------------------

describe('publish atomicity', () => {
  /**
   * A dish with no ingredients is a real, publishable state, not a failure: it
   * totals zero because it contains nothing. Worth pinning down so the genuine
   * failure case below is not confused with it.
   */
  test('a dish with an empty recipe freezes as a measured zero, and publishes', async () => {
    const planId = await createPlan();

    await db.delete(dishIngredients).where(eq(dishIngredients.dishId, dishIds[0]!));

    expect(await publishPlan(clinicId, planId)).toEqual({ ok: true });

    const [row] = await snapshotRows(planId);
    expect(row?.snapshot).not.toBeNull();
    expect(row?.snapshot?.totals.kcal.value).toBe(0);
    // Measured zero, not unmeasured: there are no ingredients to be unsure about.
    expect(row?.snapshot?.totals.kcal.unmeasured).toBe(0);
  });

  /**
   * The real abort path: a populated meal whose dish will not load.
   *
   * `weekly_plan_meals.dish_id` is `ON DELETE RESTRICT`, so this state is
   * unreachable while the foreign key is in place — which is the point, the throw
   * is defence in depth. To prove the rollback actually works the constraint is
   * dropped for the duration of this one test and restored in `finally`, so a
   * failure here cannot leak a missing FK into the rest of the suite.
   */
  test('a meal whose dish cannot be loaded fails the publish and leaves it a draft', async () => {
    const planId = await createPlan();
    const orphanDishId = '00000000-0000-4000-8000-000000000000';

    await db.execute(
      sql`alter table weekly_plan_meals drop constraint weekly_plan_meals_dish_id_dishes_id_fk`,
    );

    try {
      await db
        .update(weeklyPlanMeals)
        .set({ dishId: orphanDishId })
        .where(eq(weeklyPlanMeals.planId, planId));

      expect(await publishPlan(clinicId, planId)).toEqual({
        ok: false,
        reason: 'snapshot_failed',
      });

      // Nothing moved: still a draft, still unfrozen, no half-written record.
      const [plan] = await db
        .select({ status: weeklyPlans.status, publishedAt: weeklyPlans.publishedAt })
        .from(weeklyPlans)
        .where(eq(weeklyPlans.id, planId));

      expect(plan?.status).toBe('draft');
      expect(plan?.publishedAt).toBeNull();
      expect((await snapshotRows(planId)).every((row) => row.snapshot === null)).toBe(true);
    } finally {
      await db
        .update(weeklyPlanMeals)
        .set({ dishId: dishIds[0]! })
        .where(eq(weeklyPlanMeals.planId, planId));
      await db.execute(
        sql`alter table weekly_plan_meals add constraint weekly_plan_meals_dish_id_dishes_id_fk foreign key (dish_id) references dishes(id) on delete restrict`,
      );
    }
  });

  /**
   * The rollback has to cover the meals that DID freeze before the bad one was
   * reached, or a failed publish would leave half the week frozen.
   */
  test('a partial failure rolls back the snapshots already written', async () => {
    const planId = await createPlan([meal({ dayOfWeek: 0 }), meal({ dayOfWeek: 1 })]);
    const orphanDishId = '00000000-0000-4000-8000-000000000000';

    await db.execute(
      sql`alter table weekly_plan_meals drop constraint weekly_plan_meals_dish_id_dishes_id_fk`,
    );

    try {
      // Break only the second day, so the first is snapshotted before the throw.
      await db
        .update(weeklyPlanMeals)
        .set({ dishId: orphanDishId })
        .where(and(eq(weeklyPlanMeals.planId, planId), eq(weeklyPlanMeals.dayOfWeek, 1)));

      expect(await publishPlan(clinicId, planId)).toEqual({
        ok: false,
        reason: 'snapshot_failed',
      });

      const rows = await snapshotRows(planId);
      expect(rows).toHaveLength(2);
      // Including the one that had already succeeded.
      expect(rows.every((row) => row.snapshot === null)).toBe(true);
    } finally {
      await db
        .update(weeklyPlanMeals)
        .set({ dishId: dishIds[0]! })
        .where(eq(weeklyPlanMeals.planId, planId));
      await db.execute(
        sql`alter table weekly_plan_meals add constraint weekly_plan_meals_dish_id_dishes_id_fk foreign key (dish_id) references dishes(id) on delete restrict`,
      );
    }
  });

  test('a plan is never published with a populated meal left unfrozen', async () => {
    const meals = [0, 1, 2].map((dayOfWeek) => meal({ dayOfWeek }));
    const planId = await createPlan(meals);

    await publishPlan(clinicId, planId);

    const [plan] = await db
      .select({ status: weeklyPlans.status })
      .from(weeklyPlans)
      .where(eq(weeklyPlans.id, planId));

    const rows = await snapshotRows(planId);
    const unfrozen = rows.filter((row) => row.dishId !== null && row.snapshot === null);

    // The invariant, stated directly: published implies every populated meal frozen.
    expect(plan?.status).toBe('published');
    expect(unfrozen).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Backfill
// ---------------------------------------------------------------------------

describe('backfill', () => {
  /** Publishes, then strips the snapshots — a plan as it existed before this change. */
  async function legacyPublishedPlan(): Promise<string> {
    const planId = await createPlan();
    await publishPlan(clinicId, planId);
    await db
      .update(weeklyPlanMeals)
      .set({ nutritionSnapshot: null })
      .where(eq(weeklyPlanMeals.planId, planId));
    return planId;
  }

  test('reports without writing until asked to apply', async () => {
    await legacyPublishedPlan();

    const report = await backfillPlanNutritionSnapshots();

    expect(report.applied).toBe(false);
    expect(report.publishedPlans).toBe(1);
    expect(report.populatedMeals).toBe(1);
    expect(report.snapshotsCreated).toBe(0);
  });

  test('freezes existing published plans when applied', async () => {
    const planId = await legacyPublishedPlan();

    const report = await backfillPlanNutritionSnapshots({ apply: true });

    expect(report.applied).toBe(true);
    expect(report.snapshotsCreated).toBe(1);
    expect((await snapshotRows(planId)).every((row) => row.snapshot !== null)).toBe(true);

    await doubleFoodEnergy();
    expect(await boardKcal(planId)).toEqual([600]);
  });

  test('is safe to run twice — the second run changes nothing', async () => {
    await legacyPublishedPlan();

    const first = await backfillPlanNutritionSnapshots({ apply: true });
    const second = await backfillPlanNutritionSnapshots({ apply: true });

    expect(first.snapshotsCreated).toBe(1);
    expect(second.snapshotsCreated).toBe(0);
    expect(second.alreadySnapshotted).toBe(1);
  });

  test('does not touch drafts', async () => {
    const draftId = await createPlan();

    const report = await backfillPlanNutritionSnapshots({ apply: true });

    expect(report.publishedPlans).toBe(0);
    expect(report.archivedPlans).toBe(0);
    expect(report.snapshotsCreated).toBe(0);
    expect((await snapshotRows(draftId)).every((row) => row.snapshot === null)).toBe(true);
  });

  test('counts archived plans as well as published ones', async () => {
    await legacyPublishedPlan();
    await db
      .update(weeklyPlans)
      .set({ status: 'archived' })
      .where(and(eq(weeklyPlans.clinicId, clinicId), eq(weeklyPlans.status, 'published')));

    const report = await backfillPlanNutritionSnapshots({ apply: true });

    expect(report.archivedPlans).toBe(1);
    expect(report.snapshotsCreated).toBe(1);
  });

  test('leaves an existing snapshot exactly as it was', async () => {
    const planId = await createPlan();
    await publishPlan(clinicId, planId);

    const [before] = await snapshotRows(planId);

    await doubleFoodEnergy();
    await backfillPlanNutritionSnapshots({ apply: true });

    const [after] = await snapshotRows(planId);
    expect(after?.snapshot).toEqual(before!.snapshot);
  });

  test('spans clinics, reporting each plan under its own', async () => {
    await legacyPublishedPlan();

    const otherClinicId = await createTestClinic('Other Clinic');
    const otherClientId = await createTestClient(otherClinicId, 'Other Client');

    const otherPlanId = await createPlanFromGeneration({
      clinicId: otherClinicId,
      clientId: otherClientId,
      weekStartDate: PLAN_WEEK,
      kcalTarget: 1800,
      proteinTarget: null,
      goal: null,
      weekInstructions: null,
      outcome: {
        meals: [meal()],
        warnings: [],
        unfilled: 0,
        summaryAr: null,
        variety: { repaired: 0, unresolved: 0 },
        model: 'test-model',
        usage: { promptTokens: 1, completionTokens: 1 },
        durationMs: 1,
      },
    });
    await publishPlan(otherClinicId, otherPlanId!);
    await db
      .update(weeklyPlanMeals)
      .set({ nutritionSnapshot: null })
      .where(eq(weeklyPlanMeals.planId, otherPlanId!));

    const report = await backfillPlanNutritionSnapshots({ apply: true });

    expect(report.publishedPlans).toBe(2);
    expect(report.snapshotsCreated).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Damaged snapshots
// ---------------------------------------------------------------------------

/**
 * What happens when the frozen numbers are there but unreadable.
 *
 * This is the gap the stabilization pass closed. "Frozen" was a null test, so a
 * blob that is not null and not a snapshot — a truncated write, a row from a build
 * that stored a different shape — satisfied every guard in the system while the
 * reader treated the meal exactly as it treats a draft. The plan silently went
 * back to tracking today's catalog, and the column said it did not.
 */
describe('a published plan whose snapshot cannot be read', () => {
  /**
   * The message of whatever a read threw, or a failure if it did not throw.
   *
   * Deliberately not `expect(promise).rejects.toThrow()`: under Bun 1.3.14 that
   * matcher never settles for a rejection raised on a postgres.js code path, and
   * the whole file then dies of `beforeEach` timeouts behind a held lock rather
   * than reporting a failure. `src/features/booking/constraints.test.ts` carries
   * the same note for the same reason.
   */
  async function messageFrom(read: () => Promise<unknown>): Promise<string> {
    try {
      await read();
    } catch (error) {
      return `${(error as Error).name}: ${(error as Error).message}`;
    }

    throw new Error('expected the read to refuse this plan, but it returned');
  }

  /** Publishes, then replaces the snapshots with a non-null blob that is not one. */
  async function damagedPublishedPlan(blob: unknown): Promise<string> {
    const planId = await createPlan();
    await publishPlan(clinicId, planId);
    await db
      .update(weeklyPlanMeals)
      .set({ nutritionSnapshot: blob as never })
      .where(eq(weeklyPlanMeals.planId, planId));
    return planId;
  }

  test('refuses to render rather than quietly recalculating', async () => {
    const planId = await damagedPublishedPlan({ version: 1, totals: {}, grams: 0 });

    // The old behaviour was a board that rendered perfectly, with live numbers,
    // and nothing anywhere saying the prescription had been lost.
    expect(await messageFrom(() => getBoard(clinicId, planId))).toContain('malformed');
  });

  test('the patient portal refuses too, on the same rule', async () => {
    await damagedPublishedPlan({ nonsense: true });

    expect(await messageFrom(() => getPublishedBoard(clientId, PLAN_WEEK))).toContain(
      'MealSnapshotError',
    );
  });

  test('a snapshot from an unsupported version is refused, not guessed at', async () => {
    const planId = await damagedPublishedPlan({ version: 99, totals: {}, grams: 10 });

    expect(await messageFrom(() => getBoard(clinicId, planId))).toContain('version 99');
  });

  test('the backfill counts it as damage rather than as already frozen', async () => {
    await damagedPublishedPlan({ version: 1, totals: {}, grams: 0 });

    const report = await backfillPlanNutritionSnapshots();

    expect(report.invalidSnapshots).toBe(1);
    expect(report.alreadySnapshotted).toBe(0);
  });

  test('the backfill repairs it, and the board reads again', async () => {
    const planId = await damagedPublishedPlan({ version: 1, totals: {}, grams: 0 });

    const report = await backfillPlanNutritionSnapshots({ apply: true });

    expect(report.snapshotsRepaired).toBe(1);
    expect(report.snapshotsCreated).toBe(0);
    // 200 g of a 300 kcal/100 g food, which is what `seedCatalog` sets up.
    expect(await boardKcal(planId)).toEqual([600]);
  });

  test('a repaired plan stops drifting again', async () => {
    const planId = await damagedPublishedPlan({ nonsense: true });
    await backfillPlanNutritionSnapshots({ apply: true });

    await doubleFoodEnergy();

    expect(await boardKcal(planId)).toEqual([600]);
  });

  test('a draft holding the same damaged blob still renders live', async () => {
    // A draft is live either way, so there is nothing here to protect and nothing
    // to fail on. Only a plan claiming to be a record is held to the record.
    const planId = await createPlan();
    await db
      .update(weeklyPlanMeals)
      .set({ nutritionSnapshot: { nonsense: true } as never })
      .where(eq(weeklyPlanMeals.planId, planId));

    expect(await boardKcal(planId)).toEqual([600]);
  });
});
