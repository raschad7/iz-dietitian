import { beforeEach, describe, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { dishIngredients, dishes, foods, weeklyPlanMeals, weeklyPlans } from '@/db/schema';
import { createTestClient, createTestClinic, resetDatabase } from '../../../tests/helpers';

import { createPlanFromSkeleton } from './editor-mutations';
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
      .insert(foods)
      .values({
        fdcId: 999201,
        description: 'Staple',
        category: 'Test',
        kcal: 300,
        protein: 12,
        fat: 5,
        carbs: 50,
      })
      .returning({ id: foods.id });

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
      .values({ dishId: dish!.id, foodId: food!.id, quantityGrams: 200, sortOrder: 0 });

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
