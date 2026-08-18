import { beforeEach, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { normalizeArabic } from '@/features/weekly-plans/arabic-normalize';
import {
  clientPlanAdherence,
  catalogFoods,
  dishIngredients,
  dishes,
  weeklyPlanMealOptions,
  weeklyPlanMeals,
  weeklyPlans,
} from '@/db/schema';
import { createTestClient, createTestClinic, resetDatabase } from '../../../tests/helpers';

import {
  addMeal,
  addMealToWeek,
  clearMeal,
  createPlanFromSkeleton,
  moveMealDish,
  placeDish,
  removeMeal,
  removeMealFromWeek,
  setMealServings,
} from './editor-mutations';
import { planDishesBySlot } from './queries';
import type { MealScheduleInput } from './schema';
import { planSkeleton } from './skeleton';

/**
 * Integration tests against `TEST_DATABASE_URL`.
 *
 * What these are for: the tenant scope on a write whose client id comes from a
 * form, and the draft-replacement rule — both properties of the database rather
 * than of a pure function.
 */

let clinicId: string;
let clientId: string;

const schedule: MealScheduleInput = [
  { slotKey: 'breakfast', label: 'فطور', timeOfDay: '07:30', kcalShare: 0.3 },
  { slotKey: 'lunch', label: 'غداء', timeOfDay: '14:00', kcalShare: 0.7 },
];

beforeEach(async () => {
  await resetDatabase();
  clinicId = await createTestClinic();
  clientId = await createTestClient(clinicId, 'Test Client');
});

function skeleton() {
  return planSkeleton({ schedule, dailyKcal: 1000 });
}

async function adherenceRow(
  forClientId: string,
  date: string,
): Promise<{ level: string; completedMeals: number; totalMeals: number } | null> {
  const [row] = await db
    .select({
      level: clientPlanAdherence.level,
      completedMeals: clientPlanAdherence.completedMeals,
      totalMeals: clientPlanAdherence.totalMeals,
    })
    .from(clientPlanAdherence)
    .where(and(eq(clientPlanAdherence.clientId, forClientId), eq(clientPlanAdherence.date, date)));

  return row ?? null;
}

describe('createPlanFromSkeleton', () => {
  test('writes a draft plan and one meal per slot per day', async () => {
    const planId = await createPlanFromSkeleton({
      clinicId,
      clientId,
      weekStartDate: '2026-08-02',
      kcalTarget: 1000,
      meals: skeleton(),
    });

    expect(planId).not.toBeNull();

    const [plan] = await db.select().from(weeklyPlans).where(eq(weeklyPlans.id, planId!));
    expect(plan?.status).toBe('draft');
    expect(plan?.generatedBy).toBe('manual');
    expect(plan?.model).toBeNull();
    expect(plan?.kcalTargetSnapshot).toBe(1000);

    const meals = await db.select().from(weeklyPlanMeals).where(eq(weeklyPlanMeals.planId, planId!));
    expect(meals).toHaveLength(14);
  });

  test('refuses a client belonging to another clinic', async () => {
    const otherClinicId = await createTestClinic('Other Clinic');
    const otherClientId = await createTestClient(otherClinicId, 'Other Client');

    const planId = await createPlanFromSkeleton({
      clinicId,
      clientId: otherClientId,
      weekStartDate: '2026-08-02',
      kcalTarget: 1000,
      meals: skeleton(),
    });

    expect(planId).toBeNull();
    expect(await db.select().from(weeklyPlans)).toHaveLength(0);
  });

  test('replaces an existing draft for the same week', async () => {
    const first = await createPlanFromSkeleton({
      clinicId,
      clientId,
      weekStartDate: '2026-08-02',
      kcalTarget: 1000,
      meals: skeleton(),
    });

    const second = await createPlanFromSkeleton({
      clinicId,
      clientId,
      weekStartDate: '2026-08-02',
      kcalTarget: 1200,
      meals: skeleton(),
    });

    expect(second).not.toBe(first);

    const plans = await db.select().from(weeklyPlans).where(eq(weeklyPlans.clientId, clientId));
    expect(plans).toHaveLength(1);
    expect(plans[0]?.kcalTargetSnapshot).toBe(1200);
  });

  test('leaves a published plan for the same week alone', async () => {
    await db.insert(weeklyPlans).values({
      clinicId,
      clientId,
      weekStartDate: '2026-08-02',
      status: 'published',
      kcalTargetSnapshot: 1800,
    });

    await createPlanFromSkeleton({
      clinicId,
      clientId,
      weekStartDate: '2026-08-02',
      kcalTarget: 1000,
      meals: skeleton(),
    });

    const published = await db
      .select()
      .from(weeklyPlans)
      .where(and(eq(weeklyPlans.clientId, clientId), eq(weeklyPlans.status, 'published')));

    expect(published).toHaveLength(1);
    expect(published[0]?.kcalTargetSnapshot).toBe(1800);
  });

  /**
   * The rule the copy door is built around: a copy takes its dishes from the
   * source plan and its skeleton from the client's profile as it stands now.
   *
   * Exercised through `planDishesBySlot` + `planSkeleton` + this mutation, which is
   * exactly what `startWeekFromPlanAction` composes — the action itself needs a
   * session, and the composition is where the behaviour lives.
   */
  test('a copy follows the current schedule, not the copied plan\'s', async () => {
    const [food] = await db
      .insert(catalogFoods)
    .values({
      slug: `test-staple-${randomUUID()}`,
      nameAr: 'طعام تجريبي',
      nameEn: 'Staple',
      normalizedNameAr: normalizeArabic('طعام تجريبي'),
      normalizedNameEn: normalizeArabic('Staple'),
      state: 'raw',
      category: 'other',
      sourceType: 'usda_sr_legacy',

        kcal: 300,
        protein: 12,
        fat: 5,
        carbs: 50,

    })
    .returning({ id: catalogFoods.id });

    const [dish] = await db
      .insert(dishes)
      .values({
        slug: 'copy-dish',
        nameAr: 'طبق',
        nameEn: 'Dish',
        mealTypes: ['lunch'],
        tags: [],
        allergenTags: [],
        baseServingLabel: 'حصة',
      })
      .returning({ id: dishes.id });

    await db
      .insert(dishIngredients)
      .values({ dishId: dish!.id, catalogFoodId: food!.id, quantityGrams: 200, sortOrder: 0 });

    // July's plan: three meals a day, all filled on Sunday.
    const [source] = await db
      .insert(weeklyPlans)
      .values({
        clinicId,
        clientId,
        weekStartDate: '2026-07-26',
        status: 'published',
        kcalTargetSnapshot: 1800,
      })
      .returning({ id: weeklyPlans.id });

    await db.insert(weeklyPlanMeals).values(
      ['breakfast', 'lunch', 'afternoon_snack'].map((slotKey, index) => ({
        planId: source!.id,
        dayOfWeek: 0,
        slotKey,
        label: slotKey,
        timeOfDay: '12:00',
        budgetKcal: 600,
        sortOrder: index,
        dishId: dish!.id,
        servings: 1.5,
      })),
    );

    // The client has since dropped the afternoon snack: two slots, not three.
    const fill = await planDishesBySlot(clinicId, source!.id);

    const planId = await createPlanFromSkeleton({
      clinicId,
      clientId,
      weekStartDate: '2026-08-02',
      kcalTarget: 1000,
      meals: planSkeleton({ schedule, dailyKcal: 1000, fill }),
    });

    const meals = await db
      .select()
      .from(weeklyPlanMeals)
      .where(and(eq(weeklyPlanMeals.planId, planId!), eq(weeklyPlanMeals.dayOfWeek, 0)));

    // The retired slot is gone, and its dish with it.
    expect(meals.map((entry) => entry.slotKey).sort()).toEqual(['breakfast', 'lunch']);

    // The surviving slots kept the source plan's dishes and servings...
    expect(meals.every((entry) => entry.dishId === dish!.id)).toBe(true);
    expect(meals.every((entry) => entry.servings === 1.5)).toBe(true);

    // ...but took their budgets from the current schedule and target, not July's.
    expect(meals.find((entry) => entry.slotKey === 'breakfast')?.budgetKcal).toBe(300);
    expect(meals.find((entry) => entry.slotKey === 'lunch')?.budgetKcal).toBe(700);
  });

  test('carries a fill map through to the stored meals', async () => {
    const planId = await createPlanFromSkeleton({
      clinicId,
      clientId,
      weekStartDate: '2026-08-02',
      kcalTarget: 1000,
      meals: skeleton(),
    });

    const meals = await db.select().from(weeklyPlanMeals).where(eq(weeklyPlanMeals.planId, planId!));

    // An empty week: every slot exists, none of them holds a dish.
    expect(meals.every((meal) => meal.dishId === null)).toBe(true);
    expect(new Set(meals.map((meal) => meal.slotKey))).toEqual(new Set(['breakfast', 'lunch']));
  });
});

describe('the edit writes', () => {
  let planId: string;
  let dishId: string;
  let sunday: { breakfast: string; lunch: string };

  /** A dish with a real recipe, so a placed meal has derivable nutrition. */
  async function seedDish(slug: string): Promise<string> {
    const [food] = await db
      .insert(catalogFoods)
    .values({
      slug: `test-food-${randomUUID()}`,
      nameAr: 'طعام تجريبي',
      nameEn: 'Test food',
      normalizedNameAr: normalizeArabic('طعام تجريبي'),
      normalizedNameEn: normalizeArabic('Test food'),
      state: 'raw',
      category: 'other',
      sourceType: 'usda_sr_legacy',

        kcal: 300,
        protein: 12,
        fat: 5,
        carbs: 50,

    })
    .returning({ id: catalogFoods.id });

    const [row] = await db
      .insert(dishes)
      .values({
        slug,
        nameAr: slug,
        nameEn: slug,
        mealTypes: ['lunch'],
        tags: [],
        allergenTags: [],
        baseServingLabel: 'حصة',
      })
      .returning({ id: dishes.id });

    await db
      .insert(dishIngredients)
      .values({ dishId: row!.id, catalogFoodId: food!.id, quantityGrams: 100, sortOrder: 0 });

    return row!.id;
  }

  async function slotsOnSunday(): Promise<{ breakfast: string; lunch: string }> {
    const meals = await db
      .select({ id: weeklyPlanMeals.id, slotKey: weeklyPlanMeals.slotKey })
      .from(weeklyPlanMeals)
      .where(and(eq(weeklyPlanMeals.planId, planId), eq(weeklyPlanMeals.dayOfWeek, 0)));

    return {
      breakfast: meals.find((meal) => meal.slotKey === 'breakfast')!.id,
      lunch: meals.find((meal) => meal.slotKey === 'lunch')!.id,
    };
  }

  beforeEach(async () => {
    dishId = await seedDish('edit-dish');
    planId = (await createPlanFromSkeleton({
      clinicId,
      clientId,
      weekStartDate: '2026-08-02',
      kcalTarget: 1000,
      meals: skeleton(),
    }))!;
    sunday = await slotsOnSunday();
  });

  async function readMeal(id: string) {
    const [row] = await db.select().from(weeklyPlanMeals).where(eq(weeklyPlanMeals.id, id));
    return row;
  }

  test('placeDish fills a slot and snaps the portion to a legal multiplier', async () => {
    expect(await placeDish(clinicId, planId, sunday.lunch, dishId, 1.3)).toBe(true);

    const meal = await readMeal(sunday.lunch);
    expect(meal?.dishId).toBe(dishId);
    expect(meal?.servings).toBe(1.25);
  });

  test('placeDish demotes the dish it replaced to an alternative', async () => {
    const second = await seedDish('edit-dish-two');

    await placeDish(clinicId, planId, sunday.lunch, dishId, 1);
    await placeDish(clinicId, planId, sunday.lunch, second, 1);

    const options = await db
      .select()
      .from(weeklyPlanMealOptions)
      .where(eq(weeklyPlanMealOptions.mealId, sunday.lunch));

    expect(options.map((option) => option.dishId)).toEqual([dishId]);
  });

  test('setMealServings clamps above the maximum', async () => {
    await placeDish(clinicId, planId, sunday.lunch, dishId, 1);
    expect(await setMealServings(clinicId, planId, sunday.lunch, 99)).toBe(true);

    expect((await readMeal(sunday.lunch))?.servings).toBe(3);
  });

  test('setMealServings clamps below the minimum', async () => {
    await placeDish(clinicId, planId, sunday.lunch, dishId, 1);
    await setMealServings(clinicId, planId, sunday.lunch, 0.01);

    expect((await readMeal(sunday.lunch))?.servings).toBe(0.25);
  });

  test('clearMeal empties the slot but keeps it', async () => {
    await placeDish(clinicId, planId, sunday.lunch, dishId, 2);
    expect(await clearMeal(clinicId, planId, sunday.lunch)).toBe(true);

    const meal = await readMeal(sunday.lunch);
    expect(meal).toBeDefined();
    expect(meal?.dishId).toBeNull();
    expect(meal?.servings).toBe(1);
  });

  test('removeMeal deletes only that slot on that day', async () => {
    expect(await removeMeal(clinicId, planId, sunday.lunch)).toBe(true);

    expect(await readMeal(sunday.lunch)).toBeUndefined();
    expect(await readMeal(sunday.breakfast)).toBeDefined();

    // Monday still has both of its slots — removing is per day, not per schedule.
    const monday = await db
      .select()
      .from(weeklyPlanMeals)
      .where(and(eq(weeklyPlanMeals.planId, planId), eq(weeklyPlanMeals.dayOfWeek, 1)));

    expect(monday).toHaveLength(2);
  });

  test('addMeal writes an unbudgeted slot after the existing ones', async () => {
    const id = await addMeal(clinicId, planId, {
      dayOfWeek: 0,
      slotKey: 'extra_1',
      label: 'سناك',
      timeOfDay: '17:00',
    });

    expect(id).not.toBeNull();

    const meal = await readMeal(id!);
    expect(meal?.budgetKcal).toBe(0);
    expect(meal?.dishId).toBeNull();
    expect(meal?.sortOrder).toBe(2);
  });

  test('addMeal refuses a slot key already used on that day', async () => {
    // Deliberately not `expect(promise).rejects`: under Bun 1.3.14 that matcher
    // never settles for a rejected postgres.js query, and the hung connection takes
    // the next test file down with it. Same reason as the helper in
    // `src/features/clients/portal-credentials.test.ts`.
    let rejected = false;

    try {
      await addMeal(clinicId, planId, {
        dayOfWeek: 0,
        slotKey: 'lunch',
        label: 'غداء ثانٍ',
        timeOfDay: '15:00',
      });
    } catch {
      rejected = true;
    }

    expect(rejected).toBe(true);
  });

  test('addMealToWeek gives every day the slot, each after its own last one', async () => {
    const added = await addMealToWeek(clinicId, planId, {
      slotKey: 'extra_1',
      label: 'سناك مسائي',
      timeOfDay: '19:00',
    });

    expect(added).toBe(7);

    const rows = await db
      .select()
      .from(weeklyPlanMeals)
      .where(and(eq(weeklyPlanMeals.planId, planId), eq(weeklyPlanMeals.slotKey, 'extra_1')));

    expect(rows).toHaveLength(7);
    expect(new Set(rows.map((row) => row.dayOfWeek)).size).toBe(7);
    // Appended, never interleaved: the row has to sort below the slots the
    // client's schedule already put on each day.
    expect(rows.every((row) => row.sortOrder === 2)).toBe(true);
    expect(rows.every((row) => row.dishId === null && row.budgetKcal === 0)).toBe(true);
  });

  test('addMealToWeek skips the days that already carry the slot', async () => {
    await addMeal(clinicId, planId, {
      dayOfWeek: 3,
      slotKey: 'extra_1',
      label: 'سناك مسائي',
      timeOfDay: '19:00',
    });

    // Six, not seven — and no duplicate on Wednesday, which would make the
    // board's row lookup ambiguous.
    const added = await addMealToWeek(clinicId, planId, {
      slotKey: 'extra_1',
      label: 'سناك مسائي',
      timeOfDay: '19:00',
    });

    expect(added).toBe(6);

    const rows = await db
      .select()
      .from(weeklyPlanMeals)
      .where(and(eq(weeklyPlanMeals.planId, planId), eq(weeklyPlanMeals.slotKey, 'extra_1')));

    expect(rows).toHaveLength(7);
    expect(rows.filter((row) => row.dayOfWeek === 3)).toHaveLength(1);
  });

  test('removeMealFromWeek drops the slot from all seven days at once', async () => {
    expect(await removeMealFromWeek(clinicId, planId, 'lunch')).toBe(7);

    const left = await db
      .select()
      .from(weeklyPlanMeals)
      .where(eq(weeklyPlanMeals.planId, planId));

    // The schedule has two slots a day, so seven breakfasts survive and no
    // lunch does.
    expect(left).toHaveLength(7);
    expect(left.every((row) => row.slotKey === 'breakfast')).toBe(true);
  });

  test('removeMealFromWeek leaves the other slots and their dishes alone', async () => {
    await placeDish(clinicId, planId, sunday.breakfast, dishId, 2);

    await removeMealFromWeek(clinicId, planId, 'lunch');

    const breakfast = await readMeal(sunday.breakfast);
    expect(breakfast?.dishId).toBe(dishId);
    expect(breakfast?.servings).toBe(2);
  });

  test('removeMealFromWeek reports nothing removed for a slot the plan does not have', async () => {
    expect(await removeMealFromWeek(clinicId, planId, 'extra_9')).toBe(0);
  });

  test('moveMealDish carries the dish and leaves the target its own budget', async () => {
    await placeDish(clinicId, planId, sunday.lunch, dishId, 2);

    expect(await moveMealDish(clinicId, planId, sunday.lunch, sunday.breakfast, 'move')).toBe(true);

    const to = await readMeal(sunday.breakfast);
    const from = await readMeal(sunday.lunch);

    expect(to?.dishId).toBe(dishId);
    expect(to?.servings).toBe(2);
    // 30% of 1000, from the schedule — not lunch's 700.
    expect(to?.budgetKcal).toBe(300);
    expect(to?.slotKey).toBe('breakfast');
    expect(from?.dishId).toBeNull();
  });

  test('moveMealDish swaps filled meals instead of discarding the target', async () => {
    const targetDishId = await seedDish('swap-target');
    await placeDish(clinicId, planId, sunday.lunch, dishId, 1.5);
    await placeDish(clinicId, planId, sunday.breakfast, targetDishId, 2);

    expect(await moveMealDish(clinicId, planId, sunday.lunch, sunday.breakfast, 'move')).toBe(true);

    const to = await readMeal(sunday.breakfast);
    const from = await readMeal(sunday.lunch);

    expect(to?.dishId).toBe(dishId);
    expect(to?.servings).toBe(1.5);
    expect(from?.dishId).toBe(targetDishId);
    expect(from?.servings).toBe(2);
  });

  test('moveMealDish in copy mode leaves the source filled', async () => {
    await placeDish(clinicId, planId, sunday.lunch, dishId, 1);
    await moveMealDish(clinicId, planId, sunday.lunch, sunday.breakfast, 'copy');

    expect((await readMeal(sunday.lunch))?.dishId).toBe(dishId);
    expect((await readMeal(sunday.breakfast))?.dishId).toBe(dishId);
  });

  test('moveMealDish refuses when the source holds no dish', async () => {
    expect(await moveMealDish(clinicId, planId, sunday.lunch, sunday.breakfast, 'move')).toBe(false);
  });

  test('every edit refuses a plan belonging to another clinic', async () => {
    const otherClinicId = await createTestClinic('Other Clinic');

    expect(await placeDish(otherClinicId, planId, sunday.lunch, dishId, 1)).toBe(false);
    expect(await setMealServings(otherClinicId, planId, sunday.lunch, 2)).toBe(false);
    expect(await clearMeal(otherClinicId, planId, sunday.lunch)).toBe(false);
    expect(await removeMeal(otherClinicId, planId, sunday.lunch)).toBe(false);
    expect(
      await addMealToWeek(otherClinicId, planId, {
        slotKey: 'extra_1',
        label: 'سناك',
        timeOfDay: '19:00',
      }),
    ).toBe(0);
    expect(await removeMealFromWeek(otherClinicId, planId, 'lunch')).toBe(0);
    expect(
      await addMeal(otherClinicId, planId, {
        dayOfWeek: 0,
        slotKey: 'extra_1',
        label: 'x',
        timeOfDay: '17:00',
      }),
    ).toBeNull();
    expect(await moveMealDish(otherClinicId, planId, sunday.lunch, sunday.breakfast, 'move')).toBe(
      false,
    );
  });

  test('every edit refuses an archived plan', async () => {
    await db.update(weeklyPlans).set({ status: 'archived' }).where(eq(weeklyPlans.id, planId));

    expect(await placeDish(clinicId, planId, sunday.lunch, dishId, 1)).toBe(false);
    expect(await clearMeal(clinicId, planId, sunday.lunch)).toBe(false);
    expect(await removeMeal(clinicId, planId, sunday.lunch)).toBe(false);
  });

  /**
   * A published plan's nutrition is frozen, so its composition has to be frozen
   * too — otherwise a swap would leave the previous dish's calories printed under
   * the new dish's name. The in-place "edit published" mode this replaced is gone;
   * the supported route is unpublish → edit → republish.
   */
  test('every edit refuses a published plan — it must be unpublished first', async () => {
    await db.update(weeklyPlans).set({ status: 'published' }).where(eq(weeklyPlans.id, planId));

    expect(await placeDish(clinicId, planId, sunday.lunch, dishId, 1)).toBe(false);
    expect(await clearMeal(clinicId, planId, sunday.lunch)).toBe(false);
    expect(await removeMeal(clinicId, planId, sunday.lunch)).toBe(false);
  });

  test('a published plan is left exactly as it was by a refused edit', async () => {
    const publishedAt = new Date('2026-08-01T09:00:00Z');
    const before = await readMeal(sunday.lunch);

    await db
      .update(weeklyPlans)
      .set({ status: 'published', publishedAt })
      .where(eq(weeklyPlans.id, planId));

    await placeDish(clinicId, planId, sunday.lunch, dishId, 1);

    const [plan] = await db.select().from(weeklyPlans).where(eq(weeklyPlans.id, planId));

    expect(plan?.status).toBe('published');
    expect(plan?.publishedAt?.toISOString()).toBe(publishedAt.toISOString());
    // The meal itself is untouched, not merely the plan header.
    expect((await readMeal(sunday.lunch))?.dishId).toBe(before?.dishId ?? null);
  });

  /**
   * Reproduces the bug seen live: a plan built by hand through this file's
   * writes had real `weekly_plan_meals` rows but no `client_plan_adherence`
   * row to match, so the dietitian dashboard's Progress tab read a week that
   * plainly had meals in it as a week with nothing recorded at all. Every
   * write here that adds or removes a meal must keep the day's adherence row
   * in step with the count it is actually built from.
   */
  describe('adherence sync', () => {
    test('createPlanFromSkeleton seeds every day, unfilled and unticked', async () => {
      // `planId` from the outer `beforeEach` already exercises this — two
      // slots a day, nothing completed yet.
      expect(await adherenceRow(clientId, '2026-08-02')).toEqual({
        level: 'missed',
        completedMeals: 0,
        totalMeals: 2,
      });
    });

    test('addMeal grows that day\'s total_meals', async () => {
      await addMeal(clinicId, planId, {
        dayOfWeek: 0,
        slotKey: 'extra_1',
        label: 'سناك',
        timeOfDay: '17:00',
      });

      expect((await adherenceRow(clientId, '2026-08-02'))?.totalMeals).toBe(3);
      // Monday is untouched.
      expect((await adherenceRow(clientId, '2026-08-03'))?.totalMeals).toBe(2);
    });

    test('removeMeal shrinks that day\'s total_meals', async () => {
      await removeMeal(clinicId, planId, sunday.lunch);

      expect((await adherenceRow(clientId, '2026-08-02'))?.totalMeals).toBe(1);
    });

    test('removeMeal to zero meals clears the day\'s row rather than leaving a stale one', async () => {
      await removeMeal(clinicId, planId, sunday.lunch);
      await removeMeal(clinicId, planId, sunday.breakfast);

      expect(await adherenceRow(clientId, '2026-08-02')).toBeNull();
    });

    test('addMealToWeek grows every day\'s total_meals', async () => {
      await addMealToWeek(clinicId, planId, {
        slotKey: 'extra_1',
        label: 'سناك مسائي',
        timeOfDay: '19:00',
      });

      expect((await adherenceRow(clientId, '2026-08-02'))?.totalMeals).toBe(3);
      expect((await adherenceRow(clientId, '2026-08-08'))?.totalMeals).toBe(3);
    });

    test('removeMealFromWeek shrinks every day\'s total_meals', async () => {
      await removeMealFromWeek(clinicId, planId, 'lunch');

      expect((await adherenceRow(clientId, '2026-08-02'))?.totalMeals).toBe(1);
      expect((await adherenceRow(clientId, '2026-08-08'))?.totalMeals).toBe(1);
    });
  });
});
