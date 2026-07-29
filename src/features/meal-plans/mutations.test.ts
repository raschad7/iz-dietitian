import { beforeEach, describe, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { foods, mealPlanItems, mealPlanMeals, mealPlans } from '@/db/schema';
import { createClient } from '@/features/clients/mutations';

import { createTestClinic, resetDatabase } from '../../../tests/helpers';
import {
  addItem,
  addMeal,
  clearDay,
  copyDay,
  createPlan,
  deleteItem,
  deleteMeal,
  deletePlan,
  updateItemQuantity,
  updateMeal,
  updatePlan,
} from './mutations';
import { getFood, getPlan, listFoods, listPlans, searchFoods } from './queries';

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

/** One day's meals, in the order the UI shows them. */
function dayMeals(planId: string, dayOfWeek: number) {
  return db
    .select()
    .from(mealPlanMeals)
    .where(and(eq(mealPlanMeals.planId, planId), eq(mealPlanMeals.dayOfWeek, dayOfWeek)))
    .orderBy(mealPlanMeals.timeOfDay, mealPlanMeals.sortOrder);
}

/** 7 days × 5 default blocks — what `createPlan` lays down. */
const MEALS_PER_PLAN = 35;

describe('createPlan', () => {
  test('creates the plan with a skeleton for all seven days', async () => {
    const plan = await createPlan(clinicId, { clientId, title: 'Week 1' });
    expect(plan).not.toBeNull();

    const meals = await db.select().from(mealPlanMeals).where(eq(mealPlanMeals.planId, plan!.id));
    expect(meals).toHaveLength(MEALS_PER_PLAN);

    // Every day gets the same five blocks.
    for (const dayOfWeek of [0, 1, 2, 3, 4, 5, 6]) {
      const day = meals.filter((meal) => meal.dayOfWeek === dayOfWeek);

      expect(day.map((meal) => meal.label).sort()).toEqual([
        'Afternoon snack',
        'Breakfast',
        'Dinner',
        'Lunch',
        'Morning snack',
      ]);
    }
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

    mealId = (await dayMeals(planId, 0))[0]!.id;

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
    expect(await addMeal(otherClinic, planId, 0, { label: 'Nope', timeOfDay: '23:00' })).toBe(false);
    expect(await updateMeal(otherClinic, mealId, { label: 'Nope', timeOfDay: '23:00' })).toBe(false);
    expect(await deleteMeal(otherClinic, mealId)).toBe(false);

    const meals = await db.select().from(mealPlanMeals).where(eq(mealPlanMeals.planId, planId));
    expect(meals).toHaveLength(MEALS_PER_PLAN);
    expect(meals.some((meal) => meal.label === 'Nope')).toBe(false);
  });

  test('another clinic cannot copy or clear a day', async () => {
    await addItem(clinicId, mealId, { foodId, quantityGrams: 100 });

    expect(await copyDay(otherClinic, planId, { fromDay: 0, toDay: 1 })).toBe(false);
    expect(await clearDay(otherClinic, planId, 0)).toBe(false);

    // Sunday still has its item, and Monday was not overwritten.
    expect(await db.select().from(mealPlanItems)).toHaveLength(1);
    expect(await dayMeals(planId, 1)).toHaveLength(5);
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
    mealId = (await dayMeals(planId, 0))[0]!.id;
  });

  test('adds a meal to the day it was asked for, and no other', async () => {
    expect(await addMeal(clinicId, planId, 3, { label: 'Supper', timeOfDay: '21:30' })).toBe(true);

    const wednesday = await dayMeals(planId, 3);
    expect(wednesday).toHaveLength(6);
    expect(wednesday.find((meal) => meal.label === 'Supper')?.timeOfDay).toBe('21:30:00');

    // The other six days are untouched.
    expect(await dayMeals(planId, 0)).toHaveLength(5);
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
  test('computes totals at all three levels from the stored grams', async () => {
    const plan = await createPlan(clinicId, { clientId, title: 'Week 1' });
    const sunday = await dayMeals(plan!.id, 0);
    const monday = await dayMeals(plan!.id, 1);

    // 100 g at Sunday breakfast, 50 g at Sunday lunch, 100 g at Monday breakfast.
    await addItem(clinicId, sunday[0]!.id, { foodId, quantityGrams: 100 });
    await addItem(clinicId, sunday[2]!.id, { foodId, quantityGrams: 50 });
    await addItem(clinicId, monday[0]!.id, { foodId, quantityGrams: 100 });

    const detail = await getPlan(clinicId, plan!.id);

    // Meal.
    expect(detail?.days[0]?.meals[0]?.totals.kcal.value).toBeCloseTo(143, 5);
    expect(detail?.days[0]?.meals[2]?.totals.kcal.value).toBeCloseTo(71.5, 5);
    // Day.
    expect(detail?.days[0]?.totals.kcal.value).toBeCloseTo(214.5, 5);
    expect(detail?.days[1]?.totals.kcal.value).toBeCloseTo(143, 5);
    expect(detail?.days[2]?.totals.kcal.value).toBe(0);
    // Week.
    expect(detail?.totals.kcal.value).toBeCloseTo(357.5, 5);
    expect(detail?.totals.protein.value).toBeCloseTo(31.4, 5);
  });

  test('always returns seven days, indexed by day, even when empty', async () => {
    const plan = await createPlan(clinicId, { clientId, title: 'Week 1' });
    const detail = await getPlan(clinicId, plan!.id);

    expect(detail?.days).toHaveLength(7);
    expect(detail?.days.map((day) => day.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test('reports an unmeasured nutrient rather than counting it as zero', async () => {
    const plan = await createPlan(clinicId, { clientId, title: 'Week 1' });
    const [meal] = await dayMeals(plan!.id, 0);

    await addItem(clinicId, meal!.id, { foodId, quantityGrams: 100 });

    const detail = await getPlan(clinicId, plan!.id);

    expect(detail?.totals.sugar.unmeasured).toBe(1);
    // Fibre is a measured 0 on this food, so it is not a gap.
    expect(detail?.totals.fiber.unmeasured).toBe(0);
  });

  test('trims the time to what a time input expects', async () => {
    const plan = await createPlan(clinicId, { clientId, title: 'Week 1' });
    const detail = await getPlan(clinicId, plan!.id);

    expect(detail?.days[0]?.meals[0]?.timeOfDay).toBe('07:00');
  });

  test('orders meals through the day, within each day', async () => {
    const plan = await createPlan(clinicId, { clientId, title: 'Week 1' });
    await addMeal(clinicId, plan!.id, 0, { label: 'Supper', timeOfDay: '21:30' });

    const detail = await getPlan(clinicId, plan!.id);

    expect(detail?.days[0]?.meals.map((meal) => meal.timeOfDay)).toEqual([
      '07:00',
      '10:00',
      '13:00',
      '16:00',
      '19:00',
      '21:30',
    ]);
    // The added meal landed on Sunday only.
    expect(detail?.days[1]?.meals).toHaveLength(5);
  });

  test('returns null for a malformed id instead of throwing', async () => {
    expect(await getPlan(clinicId, 'not-a-uuid')).toBeNull();
  });

  test('a plan with no items totals zero', async () => {
    const plan = await createPlan(clinicId, { clientId, title: 'Week 1' });
    const detail = await getPlan(clinicId, plan!.id);

    expect(detail?.totals.kcal.value).toBe(0);
    expect(detail?.days[0]?.meals).toHaveLength(5);
  });
});

describe('copyDay', () => {
  let planId: string;

  beforeEach(async () => {
    const plan = await createPlan(clinicId, { clientId, title: 'Week 1' });
    planId = plan!.id;
  });

  test('reproduces the source day, meals and items alike', async () => {
    const sunday = await dayMeals(planId, 0);
    await updateMeal(clinicId, sunday[0]!.id, { label: 'إفطار', timeOfDay: '06:30' });
    await addItem(clinicId, sunday[0]!.id, { foodId, quantityGrams: 120 });
    await addItem(clinicId, sunday[2]!.id, { foodId, quantityGrams: 80 });

    expect(await copyDay(clinicId, planId, { fromDay: 0, toDay: 2 })).toBe(true);

    const detail = await getPlan(clinicId, planId);
    const source = detail!.days[0]!;
    const copy = detail!.days[2]!;

    expect(copy.meals.map((meal) => [meal.label, meal.timeOfDay])).toEqual(
      source.meals.map((meal) => [meal.label, meal.timeOfDay]),
    );
    expect(copy.totals.kcal.value).toBeCloseTo(source.totals.kcal.value, 5);
  });

  test('pairs each copied item with the right meal, not the first one', async () => {
    const sunday = await dayMeals(planId, 0);
    // Different quantities in different blocks — a mis-paired copy would show up
    // as the wrong grams against the wrong meal.
    await addItem(clinicId, sunday[0]!.id, { foodId, quantityGrams: 100 });
    await addItem(clinicId, sunday[4]!.id, { foodId, quantityGrams: 250 });

    await copyDay(clinicId, planId, { fromDay: 0, toDay: 5 });

    const copy = (await getPlan(clinicId, planId))!.days[5]!;

    expect(copy.meals[0]?.items.map((item) => item.quantityGrams)).toEqual([100]);
    expect(copy.meals[1]?.items).toHaveLength(0);
    expect(copy.meals[4]?.items.map((item) => item.quantityGrams)).toEqual([250]);
  });

  test('replaces the target rather than merging into it', async () => {
    const sunday = await dayMeals(planId, 0);
    await addItem(clinicId, sunday[0]!.id, { foodId, quantityGrams: 100 });

    const monday = await dayMeals(planId, 1);
    await addMeal(clinicId, planId, 1, { label: 'Late supper', timeOfDay: '23:00' });
    await addItem(clinicId, monday[0]!.id, { foodId, quantityGrams: 999 });

    await copyDay(clinicId, planId, { fromDay: 0, toDay: 1 });

    const copy = (await getPlan(clinicId, planId))!.days[1]!;

    expect(copy.meals).toHaveLength(5);
    expect(copy.meals.some((meal) => meal.label === 'Late supper')).toBe(false);
    expect(copy.totals.kcal.value).toBeCloseTo(143, 5);
  });

  test('leaves the source day untouched', async () => {
    const sunday = await dayMeals(planId, 0);
    await addItem(clinicId, sunday[0]!.id, { foodId, quantityGrams: 100 });

    await copyDay(clinicId, planId, { fromDay: 0, toDay: 1 });

    const detail = await getPlan(clinicId, planId);
    expect(detail?.days[0]?.totals.kcal.value).toBeCloseTo(143, 5);
    expect(detail?.days[0]?.meals).toHaveLength(5);
  });

  test('copying an empty day clears the target', async () => {
    const monday = await dayMeals(planId, 1);
    await addItem(clinicId, monday[0]!.id, { foodId, quantityGrams: 100 });

    // Saturday was never touched, so it still holds only the empty skeleton.
    await clearDay(clinicId, planId, 6);
    await copyDay(clinicId, planId, { fromDay: 6, toDay: 1 });

    const detail = await getPlan(clinicId, planId);
    expect(detail?.days[1]?.meals).toHaveLength(0);
    expect(detail?.days[1]?.totals.kcal.value).toBe(0);
  });

  test('does not disturb the other five days', async () => {
    const sunday = await dayMeals(planId, 0);
    await addItem(clinicId, sunday[0]!.id, { foodId, quantityGrams: 100 });

    await copyDay(clinicId, planId, { fromDay: 0, toDay: 1 });

    const detail = await getPlan(clinicId, planId);
    for (const dayOfWeek of [2, 3, 4, 5, 6]) {
      expect(detail?.days[dayOfWeek]?.meals).toHaveLength(5);
      expect(detail?.days[dayOfWeek]?.totals.kcal.value).toBe(0);
    }
  });
});

describe('clearDay', () => {
  test('empties one day and leaves the rest of the week alone', async () => {
    const plan = await createPlan(clinicId, { clientId, title: 'Week 1' });
    const sunday = await dayMeals(plan!.id, 0);
    await addItem(clinicId, sunday[0]!.id, { foodId, quantityGrams: 100 });

    expect(await clearDay(clinicId, plan!.id, 0)).toBe(true);

    const detail = await getPlan(clinicId, plan!.id);
    expect(detail?.days[0]?.meals).toHaveLength(0);
    expect(detail?.days[1]?.meals).toHaveLength(5);
    // The cascade took the item with the meal.
    expect(await db.select().from(mealPlanItems)).toHaveLength(0);
  });
});

describe('listPlans', () => {
  test('aggregates the week energy and the planned-day count in SQL', async () => {
    const plan = await createPlan(clinicId, { clientId, title: 'Week 1' });
    const [sunday] = await dayMeals(plan!.id, 0);
    const [wednesday] = await dayMeals(plan!.id, 3);

    await addItem(clinicId, sunday!.id, { foodId, quantityGrams: 200 });
    await addItem(clinicId, wednesday!.id, { foodId, quantityGrams: 100 });

    const [row] = await listPlans(clinicId);

    expect(row?.plannedDays).toBe(2);
    expect(row?.kcal).toBeCloseTo(429, 5);
    expect(row?.clientName).toBe('سارة');
  });

  test('a day of empty blocks does not count as planned', async () => {
    // Every plan starts with 35 empty blocks; none of them is a planned day.
    await createPlan(clinicId, { clientId, title: 'Week 1' });

    const [row] = await listPlans(clinicId);

    expect(row?.plannedDays).toBe(0);
    expect(row?.kcal).toBe(0);
  });

  test('narrows to one client when asked, for the card on their profile', async () => {
    const { id: otherClient } = await createClient(clinicId, {
      fullName: 'Someone else',
      preferredLocale: 'en',
    });

    await createPlan(clinicId, { clientId, title: 'Hers' });
    await createPlan(clinicId, { clientId: otherClient, title: 'Theirs' });

    expect(await listPlans(clinicId)).toHaveLength(2);

    const mine = await listPlans(clinicId, clientId);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.title).toBe('Hers');
  });

  test('the client filter never widens the clinic scope', async () => {
    const otherClinic = await createTestClinic('Other Clinic');
    await createPlan(clinicId, { clientId, title: 'Hers' });

    // The client id is real, but belongs to a different clinic than the caller.
    expect(await listPlans(otherClinic, clientId)).toHaveLength(0);
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

describe('listFoods', () => {
  beforeEach(async () => {
    await createTestFood('Chicken, broilers or fryers, breast, meat only, raw', 171077);
    await createTestFood('Butter, salted', 173410);
  });

  test('reports the total alongside the page', async () => {
    const result = await listFoods({ page: 1 });

    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(3);
    expect(result.pageCount).toBe(1);
  });

  test('counts the matches, not the table, when filtered', async () => {
    const result = await listFoods({ q: 'butter', page: 1 });

    expect(result.total).toBe(1);
    expect(result.items[0]?.description).toBe('Butter, salted');
  });

  test('a page past the end is empty but does not throw', async () => {
    const result = await listFoods({ page: 500 });

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(3);
  });
});

describe('getFood', () => {
  test('returns the food with its nutrients', async () => {
    const food = await getFood(foodId);

    expect(food?.description).toBe('Egg, whole, raw, fresh');
    expect(food?.kcal).toBe(143);
    // Null must survive the round trip as null, not become 0.
    expect(food?.sugar).toBeNull();
  });

  test('returns null for a malformed id instead of throwing', async () => {
    expect(await getFood('not-a-uuid')).toBeNull();
  });

  test('returns null for an id that does not exist', async () => {
    expect(await getFood('00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});
