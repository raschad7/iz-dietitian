import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { foods, mealPlanItems, mealPlanMeals, mealPlans } from '@/db/schema';
import { createClient } from '@/features/clients/mutations';

import { createTestClinic, resetDatabase } from '../../../tests/helpers';
import {
  addItem,
  addMeal,
  createPlan,
  deleteItem,
  deleteMeal,
  deletePlan,
  updateItemQuantity,
  updateMeal,
  updatePlan,
} from './mutations';
import { getPlan, listPlans, searchFoods } from './queries';

let clinicId: string;
let clientId: string;
let foodId: string;

/** A stand-in for the seeded reference table; the tests must not depend on the seed. */
async function createTestFood(description = 'Egg, whole, raw, fresh', fdcId = 171287): Promise<string> {
  const [food] = await db
    .insert(foods)
    .values({
      fdcId,
      description,
      category: 'Dairy and Egg Products',
      kcal: 143,
      protein: 12.56,
      fat: 9.51,
      carbs: 0.72,
      // Deliberately left null: the analysis must treat this as unmeasured.
      sugar: null,
      fiber: 0,
    })
    .returning({ id: foods.id });

  if (!food) throw new Error('insert into foods returned no row');

  return food.id;
}

beforeEach(async () => {
  await resetDatabase();
  clinicId = await createTestClinic();
  ({ id: clientId } = await createClient(clinicId, { fullName: 'سارة', preferredLocale: 'ar' }));
  foodId = await createTestFood();
});

describe('createPlan', () => {
  test('creates the plan with a full default day', async () => {
    const plan = await createPlan(clinicId, { clientId, title: 'Week 1' });
    expect(plan).not.toBeNull();

    const meals = await db.select().from(mealPlanMeals).where(eq(mealPlanMeals.planId, plan!.id));

    expect(meals).toHaveLength(5);
    expect(meals.map((meal) => meal.label).sort()).toEqual(
      ['Afternoon snack', 'Breakfast', 'Dinner', 'Lunch', 'Morning snack'],
    );
  });

  test('stores the clinic on the plan so queries need no join to scope', async () => {
    const plan = await createPlan(clinicId, { clientId, title: 'Week 1' });

    const [row] = await db.select().from(mealPlans).where(eq(mealPlans.id, plan!.id));
    expect(row?.clinicId).toBe(clinicId);
  });

  test('refuses a client belonging to another clinic', async () => {
    const otherClinic = await createTestClinic('Other Clinic');
    const { id: otherClient } = await createClient(otherClinic, {
      fullName: 'Someone else',
      preferredLocale: 'en',
    });

    expect(await createPlan(clinicId, { clientId: otherClient, title: 'Nope' })).toBeNull();
    expect(await db.select().from(mealPlans)).toHaveLength(0);
  });
});

describe('tenant isolation', () => {
  let planId: string;
  let mealId: string;
  let otherClinic: string;

  beforeEach(async () => {
    const plan = await createPlan(clinicId, { clientId, title: 'Week 1' });
    planId = plan!.id;

    const meals = await db.select().from(mealPlanMeals).where(eq(mealPlanMeals.planId, planId));
    mealId = meals[0]!.id;

    otherClinic = await createTestClinic('Other Clinic');
  });

  test('another clinic cannot read the plan', async () => {
    expect(await getPlan(otherClinic, planId)).toBeNull();
    expect(await listPlans(otherClinic)).toHaveLength(0);
  });

  test('another clinic cannot update or delete the plan', async () => {
    expect(await updatePlan(otherClinic, planId, { clientId, title: 'Hijacked' })).toBe(false);
    expect(await deletePlan(otherClinic, planId)).toBe(false);

    const [row] = await db.select().from(mealPlans).where(eq(mealPlans.id, planId));
    expect(row?.title).toBe('Week 1');
  });

  test('another clinic cannot add, edit or delete a meal', async () => {
    expect(await addMeal(otherClinic, planId, { label: 'Nope', timeOfDay: '23:00' })).toBe(false);
    expect(await updateMeal(otherClinic, mealId, { label: 'Nope', timeOfDay: '23:00' })).toBe(false);
    expect(await deleteMeal(otherClinic, mealId)).toBe(false);

    const meals = await db.select().from(mealPlanMeals).where(eq(mealPlanMeals.planId, planId));
    expect(meals).toHaveLength(5);
    expect(meals.some((meal) => meal.label === 'Nope')).toBe(false);
  });

  test('another clinic cannot add or remove an item', async () => {
    expect(await addItem(otherClinic, mealId, { foodId, quantityGrams: 100 })).toBe(false);

    await addItem(clinicId, mealId, { foodId, quantityGrams: 100 });
    const [item] = await db.select().from(mealPlanItems);

    expect(await updateItemQuantity(otherClinic, item!.id, 999)).toBe(false);
    expect(await deleteItem(otherClinic, item!.id)).toBe(false);

    const [after] = await db.select().from(mealPlanItems);
    expect(after?.quantityGrams).toBe(100);
  });
});

describe('meals and items', () => {
  let planId: string;
  let mealId: string;

  beforeEach(async () => {
    const plan = await createPlan(clinicId, { clientId, title: 'Week 1' });
    planId = plan!.id;
    mealId = (await db.select().from(mealPlanMeals).where(eq(mealPlanMeals.planId, planId)))[0]!.id;
  });

  test('adds a meal to the plan', async () => {
    expect(await addMeal(clinicId, planId, { label: 'Supper', timeOfDay: '21:30' })).toBe(true);

    const meals = await db.select().from(mealPlanMeals).where(eq(mealPlanMeals.planId, planId));
    expect(meals).toHaveLength(6);
    expect(meals.find((meal) => meal.label === 'Supper')?.timeOfDay).toBe('21:30:00');
  });

  test('renames and reschedules a meal', async () => {
    await updateMeal(clinicId, mealId, { label: 'إفطار', timeOfDay: '06:15' });

    const [meal] = await db.select().from(mealPlanMeals).where(eq(mealPlanMeals.id, mealId));
    expect(meal?.label).toBe('إفطار');
    expect(meal?.timeOfDay).toBe('06:15:00');
  });

  test('deleting a meal takes its items with it', async () => {
    await addItem(clinicId, mealId, { foodId, quantityGrams: 100 });
    expect(await db.select().from(mealPlanItems)).toHaveLength(1);

    await deleteMeal(clinicId, mealId);
    expect(await db.select().from(mealPlanItems)).toHaveLength(0);
  });

  test('deleting a plan takes its meals and items with it', async () => {
    await addItem(clinicId, mealId, { foodId, quantityGrams: 100 });

    await deletePlan(clinicId, planId);

    expect(await db.select().from(mealPlanMeals)).toHaveLength(0);
    expect(await db.select().from(mealPlanItems)).toHaveLength(0);
  });

  test('changes an item quantity', async () => {
    await addItem(clinicId, mealId, { foodId, quantityGrams: 100 });
    const [item] = await db.select().from(mealPlanItems);

    expect(await updateItemQuantity(clinicId, item!.id, 250)).toBe(true);

    const [after] = await db.select().from(mealPlanItems);
    expect(after?.quantityGrams).toBe(250);
  });
});

describe('getPlan', () => {
  test('computes per-meal and whole-day totals from the stored grams', async () => {
    const plan = await createPlan(clinicId, { clientId, title: 'Week 1' });
    const meals = await db
      .select()
      .from(mealPlanMeals)
      .where(eq(mealPlanMeals.planId, plan!.id))
      .orderBy(mealPlanMeals.timeOfDay);

    // 100 g at breakfast + 50 g at lunch = 1.5x the per-100 g figures.
    await addItem(clinicId, meals[0]!.id, { foodId, quantityGrams: 100 });
    await addItem(clinicId, meals[2]!.id, { foodId, quantityGrams: 50 });

    const detail = await getPlan(clinicId, plan!.id);

    expect(detail?.meals[0]?.totals.kcal.value).toBeCloseTo(143, 5);
    expect(detail?.meals[2]?.totals.kcal.value).toBeCloseTo(71.5, 5);
    expect(detail?.totals.kcal.value).toBeCloseTo(214.5, 5);
    expect(detail?.totals.protein.value).toBeCloseTo(18.84, 5);
  });

  test('reports an unmeasured nutrient rather than counting it as zero', async () => {
    const plan = await createPlan(clinicId, { clientId, title: 'Week 1' });
    const [meal] = await db.select().from(mealPlanMeals).where(eq(mealPlanMeals.planId, plan!.id));

    await addItem(clinicId, meal!.id, { foodId, quantityGrams: 100 });

    const detail = await getPlan(clinicId, plan!.id);

    expect(detail?.totals.sugar.unmeasured).toBe(1);
    // Fibre is a measured 0 on this food, so it is not a gap.
    expect(detail?.totals.fiber.unmeasured).toBe(0);
  });

  test('trims the time to what a time input expects', async () => {
    const plan = await createPlan(clinicId, { clientId, title: 'Week 1' });
    const detail = await getPlan(clinicId, plan!.id);

    expect(detail?.meals[0]?.timeOfDay).toBe('07:00');
  });

  test('orders meals through the day', async () => {
    const plan = await createPlan(clinicId, { clientId, title: 'Week 1' });
    await addMeal(clinicId, plan!.id, { label: 'Supper', timeOfDay: '21:30' });

    const detail = await getPlan(clinicId, plan!.id);

    expect(detail?.meals.map((meal) => meal.timeOfDay)).toEqual([
      '07:00',
      '10:00',
      '13:00',
      '16:00',
      '19:00',
      '21:30',
    ]);
  });

  test('returns null for a malformed id instead of throwing', async () => {
    expect(await getPlan(clinicId, 'not-a-uuid')).toBeNull();
  });

  test('a plan with no items totals zero', async () => {
    const plan = await createPlan(clinicId, { clientId, title: 'Week 1' });
    const detail = await getPlan(clinicId, plan!.id);

    expect(detail?.totals.kcal.value).toBe(0);
    expect(detail?.meals).toHaveLength(5);
  });
});

describe('listPlans', () => {
  test('aggregates the energy and meal count in SQL', async () => {
    const plan = await createPlan(clinicId, { clientId, title: 'Week 1' });
    const [meal] = await db.select().from(mealPlanMeals).where(eq(mealPlanMeals.planId, plan!.id));

    await addItem(clinicId, meal!.id, { foodId, quantityGrams: 200 });

    const [row] = await listPlans(clinicId);

    expect(row?.mealCount).toBe(5);
    expect(row?.kcal).toBeCloseTo(286, 5);
    expect(row?.clientName).toBe('سارة');
  });

  test('a plan with no items reports zero rather than null', async () => {
    await createPlan(clinicId, { clientId, title: 'Week 1' });

    const [row] = await listPlans(clinicId);
    expect(row?.kcal).toBe(0);
  });
});

describe('searchFoods', () => {
  beforeEach(async () => {
    await createTestFood('Chicken, broilers or fryers, breast, meat only, raw', 171077);
    await createTestFood('Butter, salted', 173410);
  });

  test('matches every term separately, in any position', async () => {
    const results = await searchFoods({ q: 'chicken breast' });

    expect(results).toHaveLength(1);
    expect(results[0]?.description).toContain('breast');
  });

  test('is case insensitive', async () => {
    expect(await searchFoods({ q: 'BUTTER' })).toHaveLength(1);
  });

  test('filters by category', async () => {
    expect(await searchFoods({ category: 'Dairy and Egg Products' })).toHaveLength(3);
    expect(await searchFoods({ category: 'Spices and Herbs' })).toHaveLength(0);
  });

  test('treats a LIKE wildcard as a literal, not a match-everything', async () => {
    // Without escaping, '%' would match all three foods.
    expect(await searchFoods({ q: '%' })).toHaveLength(0);
  });

  test('ranks the plainer description first', async () => {
    const results = await searchFoods({ q: 'butter' });
    expect(results[0]?.description).toBe('Butter, salted');
  });
});
