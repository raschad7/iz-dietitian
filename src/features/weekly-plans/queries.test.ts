import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { dishIngredients, dishes, foods, weeklyPlanMeals, weeklyPlans } from '@/db/schema';
import { createTestClient, createTestClinic, resetDatabase } from '../../../tests/helpers';

import { getBoard, listPlannableClients } from './queries';

let clinicId: string;
let clientId: string;

beforeEach(async () => {
  await resetDatabase();
  clinicId = await createTestClinic();
  clientId = await createTestClient(clinicId, 'Test Client');
});

describe('listPlannableClients', () => {
  test('returns each client with the status and date of their latest plan', async () => {
    await db.insert(weeklyPlans).values([
      {
        clinicId,
        clientId,
        weekStartDate: '2026-07-19',
        status: 'published',
        kcalTargetSnapshot: 1800,
      },
      {
        clinicId,
        clientId,
        weekStartDate: '2026-07-26',
        status: 'draft',
        kcalTargetSnapshot: 1800,
      },
    ]);

    expect(await listPlannableClients(clinicId)).toEqual([
      {
        id: clientId,
        fullName: 'Test Client',
        color: '#64748b',
        hasProfile: false,
        latestPlanStatus: 'draft',
        latestWeekStartDate: '2026-07-26',
      },
    ]);
  });
});

describe('getBoard', () => {
  test('renders a dish that has since been retired, and does not count it unfilled', async () => {
    const [food] = await db
      .insert(foods)
      .values({
        fdcId: 999101,
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
        slug: 'retired-lunch',
        nameAr: 'طبق متقاعد',
        nameEn: 'Retired dish',
        mealTypes: ['lunch'],
        tags: [],
        allergenTags: [],
        baseServingLabel: 'حصة',
      })
      .returning({ id: dishes.id });

    await db
      .insert(dishIngredients)
      .values({ dishId: dish!.id, foodId: food!.id, quantityGrams: 200, sortOrder: 0 });

    const [plan] = await db
      .insert(weeklyPlans)
      .values({
        clinicId,
        clientId,
        weekStartDate: '2026-08-02',
        status: 'draft',
        kcalTargetSnapshot: 1800,
      })
      .returning({ id: weeklyPlans.id });

    await db.insert(weeklyPlanMeals).values({
      planId: plan!.id,
      dayOfWeek: 0,
      slotKey: 'lunch',
      label: 'غداء',
      timeOfDay: '14:00',
      budgetKcal: 600,
      sortOrder: 0,
      dishId: dish!.id,
      servings: 1,
    });

    await db.update(dishes).set({ isActive: false }).where(eq(dishes.id, dish!.id));

    const board = await getBoard(clinicId, plan!.id);

    expect(board?.unfilled).toBe(0);
    expect(board?.days[0]?.meals[0]?.dish?.slug).toBe('retired-lunch');
    expect(board?.days[0]?.meals[0]?.dish?.isActive).toBe(false);
  });
});
