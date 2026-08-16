import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import {
  appointments,
  clinicHiddenDishes,
  dishIngredients,
  dishes,
  foods,
  weeklyPlanMeals,
  weeklyPlans,
} from '@/db/schema';
import {
  createTestClient,
  createTestClinic,
  createTestPractitioner,
  resetDatabase,
} from '../../../tests/helpers';

import {
  getBoard,
  listClinicFoods,
  listPlannableClients,
  loadCatalog,
  planDishesBySlot,
  searchClinicFoods,
  searchFoods,
  searchFoodsById,
} from './queries';
import { slotFillKey } from './skeleton';

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
        // The clinic's first client, so position 0 — the number the rail's disc
        // and the calendar both colour this person from.
        seq: 0,
        hasProfile: false,
        latestPlanStatus: 'draft',
        latestWeekStartDate: '2026-07-26',
        nextAppointment: null,
        lastAppointment: null,
      },
    ]);
  });

  /**
   * The planner's first screen prints this date under the client's name, and it
   * is the one fact on that card the dietitian can check against their own
   * morning — so a visit that has already happened must not be offered as the
   * next one. The boundary is a moment, not a day.
   */
  test('splits today by the clock, not by the date', async () => {
    const practitionerId = await createTestPractitioner(clinicId);

    await db.insert(appointments).values([
      { clinicId, practitionerId, clientId, date: '2026-08-12', startMinute: 9 * 60, durationMinutes: 30 },
      { clinicId, practitionerId, clientId, date: '2026-08-13', startMinute: 10 * 60, durationMinutes: 30 },
    ]);

    const morning = await listPlannableClients(clinicId, { date: '2026-08-12', minute: 8 * 60 });
    expect(morning[0]?.nextAppointment).toEqual({ date: '2026-08-12', startMinute: 9 * 60 });
    expect(morning[0]?.lastAppointment).toBeNull();

    // Same day, after that appointment started: it is now the last visit, and
    // tomorrow's is the next one.
    const evening = await listPlannableClients(clinicId, { date: '2026-08-12', minute: 17 * 60 });
    expect(evening[0]?.nextAppointment).toEqual({ date: '2026-08-13', startMinute: 10 * 60 });
    expect(evening[0]?.lastAppointment).toEqual({ date: '2026-08-12', startMinute: 9 * 60 });
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

describe('planDishesBySlot', () => {
  test("keys a plan's filled slots, skipping the empty ones", async () => {
    const [dish] = await db
      .insert(dishes)
      .values({
        slug: 'copy-source',
        nameAr: 'مصدر',
        nameEn: 'Source',
        mealTypes: ['lunch'],
        tags: [],
        allergenTags: [],
        baseServingLabel: 'حصة',
      })
      .returning({ id: dishes.id });

    const [plan] = await db
      .insert(weeklyPlans)
      .values({
        clinicId,
        clientId,
        weekStartDate: '2026-07-26',
        status: 'published',
        kcalTargetSnapshot: 1800,
      })
      .returning({ id: weeklyPlans.id });

    await db.insert(weeklyPlanMeals).values([
      {
        planId: plan!.id,
        dayOfWeek: 1,
        slotKey: 'lunch',
        label: 'غداء',
        timeOfDay: '14:00',
        budgetKcal: 600,
        sortOrder: 0,
        dishId: dish!.id,
        servings: 1.25,
      },
      {
        planId: plan!.id,
        dayOfWeek: 1,
        slotKey: 'dinner',
        label: 'عشاء',
        timeOfDay: '20:00',
        budgetKcal: 400,
        sortOrder: 1,
        dishId: null,
        servings: 1,
      },
    ]);

    const fill = await planDishesBySlot(clinicId, plan!.id);

    expect(fill.size).toBe(1);
    expect(fill.get(slotFillKey(1, 'lunch'))).toEqual({ dishId: dish!.id, servings: 1.25 });
  });

  test('returns nothing for a plan belonging to another clinic', async () => {
    const otherClinicId = await createTestClinic('Other Clinic');
    const otherClientId = await createTestClient(otherClinicId, 'Other Client');

    const [plan] = await db
      .insert(weeklyPlans)
      .values({
        clinicId: otherClinicId,
        clientId: otherClientId,
        weekStartDate: '2026-07-26',
        status: 'draft',
        kcalTargetSnapshot: 1800,
      })
      .returning({ id: weeklyPlans.id });

    expect((await planDishesBySlot(clinicId, plan!.id)).size).toBe(0);
  });
});

describe('loadCatalog ownership', () => {
  async function seedSharedDish(slug: string) {
    const [dish] = await db
      .insert(dishes)
      .values({
        slug,
        nameAr: slug,
        nameEn: slug,
        mealTypes: ['lunch'],
        tags: [],
        allergenTags: [],
        baseServingLabel: 'serving',
      })
      .returning({ id: dishes.id });
    return dish!.id;
  }

  test('returns shared dishes plus the clinic own, and hides what the clinic hid', async () => {
    const otherClinic = await createTestClinic();

    const sharedId = await seedSharedDish('shared-dish');
    const hiddenSharedId = await seedSharedDish('shared-hidden');

    const [ownDish] = await db
      .insert(dishes)
      .values({
        clinicId,
        slug: 'own-dish',
        nameAr: 'own',
        nameEn: 'own',
        mealTypes: ['lunch'],
        tags: [],
        allergenTags: [],
        baseServingLabel: 'serving',
      })
      .returning({ id: dishes.id });
    await db.insert(dishes).values({
      clinicId: otherClinic,
      slug: 'other-clinic-dish',
      nameAr: 'other',
      nameEn: 'other',
      mealTypes: ['lunch'],
      tags: [],
      allergenTags: [],
      baseServingLabel: 'serving',
    });

    await db.insert(clinicHiddenDishes).values({ clinicId, dishId: hiddenSharedId });

    const slugs = (await loadCatalog(clinicId)).map((dish) => dish.slug).sort();

    expect(slugs).toEqual(['own-dish', 'shared-dish']);
    expect(slugs).not.toContain('shared-hidden');
    expect(slugs).not.toContain('other-clinic-dish');
    expect(sharedId).toBeDefined();
    expect(ownDish).toBeDefined();
  });

  test('another clinic still sees a dish this clinic hid', async () => {
    const otherClinic = await createTestClinic();
    const sharedId = await seedSharedDish('shared-dish');
    await db.insert(clinicHiddenDishes).values({ clinicId, dishId: sharedId });

    expect((await loadCatalog(clinicId)).map((d) => d.slug)).not.toContain('shared-dish');
    expect((await loadCatalog(otherClinic)).map((d) => d.slug)).toContain('shared-dish');
  });
});

describe('searchFoods', () => {
  test('finds shared library foods and this clinic own custom foods by description', async () => {
    await db.insert(foods).values([
      { description: 'Chicken breast, roasted', category: 'Poultry', kcal: 165, protein: 31, carbs: 0, fat: 3.6 },
      { description: 'Chicken thigh', category: 'Poultry', kcal: 209, protein: 26, carbs: 0, fat: 10 },
      { description: 'Apple, raw', category: 'Fruit', kcal: 52, protein: 0.3, carbs: 14, fat: 0.2 },
    ]);
    await db.insert(foods).values({
      clinicId,
      fdcId: null,
      description: 'Chicken village style',
      category: 'Clinic custom',
      kcal: 200, protein: 20, carbs: 0, fat: 12,
    });

    const results = await searchFoods(clinicId, 'chicken', 10);
    const descriptions = results.map((f) => f.description);
    expect(descriptions).toContain('Chicken breast, roasted');
    expect(descriptions).toContain('Chicken village style');
    expect(descriptions).not.toContain('Apple, raw');
  });

  test('does not return another clinic custom food', async () => {
    const other = await createTestClinic();
    await db.insert(foods).values({ clinicId: other, fdcId: null, description: 'Chicken secret', category: 'Clinic custom', kcal: 1, protein: 0, carbs: 0, fat: 0 });
    expect((await searchFoods(clinicId, 'chicken secret', 10)).length).toBe(0);
  });
});

describe('searchFoodsById', () => {
  test('returns the food row by id, or empty for another clinic\'s', async () => {
    const [food] = await db
      .insert(foods)
      .values({ description: 'Chicken breast', category: 'Poultry', kcal: 165, protein: 31, carbs: 0, fat: 3.6 })
      .returning({ id: foods.id });
    const other = await createTestClinic();
    const [customFood] = await db
      .insert(foods)
      .values({ clinicId: other, fdcId: null, description: 'Other clinic food', category: 'Clinic custom', kcal: 1, protein: 0, carbs: 0, fat: 0 })
      .returning({ id: foods.id });

    expect((await searchFoodsById(clinicId, food!.id)).map((f) => f.id)).toEqual([food!.id]);
    expect(await searchFoodsById(clinicId, customFood!.id)).toEqual([]);
  });
});

describe('clinic food library', () => {
  test('listClinicFoods returns only this clinic own foods, ordered by nameAr', async () => {
    const other = await createTestClinic();
    await db.insert(foods).values([
      { description: 'USDA shared food', category: 'Poultry', kcal: 100, protein: 1, carbs: 1, fat: 1 },
      {
        clinicId,
        fdcId: null,
        nameAr: 'موز',
        description: 'Banana custom',
        category: 'Clinic custom',
        kcal: 90,
        protein: 1,
        carbs: 20,
        fat: 0.3,
      },
      {
        clinicId,
        fdcId: null,
        nameAr: 'أرز',
        description: 'Rice custom',
        category: 'Clinic custom',
        kcal: 130,
        protein: 2.4,
        carbs: 28,
        fat: 0.3,
      },
      {
        clinicId: other,
        fdcId: null,
        nameAr: 'خبز',
        description: 'Other clinic bread',
        category: 'Clinic custom',
        kcal: 265,
        protein: 9,
        carbs: 49,
        fat: 3.2,
      },
    ]);

    const result = await listClinicFoods(clinicId);
    expect(result.map((f) => f.nameAr)).toEqual(['أرز', 'موز']);
    expect(result.every((f) => f.description !== 'USDA shared food')).toBe(true);
    expect(result.every((f) => f.description !== 'Other clinic bread')).toBe(true);
  });

  test('searchClinicFoods matches by Arabic name, scoped to the clinic', async () => {
    const other = await createTestClinic();
    await db.insert(foods).values({
      clinicId,
      fdcId: null,
      nameAr: 'دجاج',
      description: 'Chicken custom',
      category: 'Clinic custom',
      kcal: 165,
      protein: 31,
      carbs: 0,
      fat: 3.6,
    });

    const results = await searchClinicFoods(clinicId, 'دجاج');
    expect(results.map((f) => f.nameAr)).toEqual(['دجاج']);

    expect(await searchClinicFoods(other, 'دجاج')).toEqual([]);
  });

  test('searchClinicFoods with an empty query returns the clinic library', async () => {
    await db.insert(foods).values([
      {
        clinicId,
        fdcId: null,
        nameAr: 'موز',
        description: 'Banana custom',
        category: 'Clinic custom',
        kcal: 90,
        protein: 1,
        carbs: 20,
        fat: 0.3,
      },
      {
        clinicId,
        fdcId: null,
        nameAr: 'أرز',
        description: 'Rice custom',
        category: 'Clinic custom',
        kcal: 130,
        protein: 2.4,
        carbs: 28,
        fat: 0.3,
      },
    ]);

    const results = await searchClinicFoods(clinicId, '');
    expect(results.map((f) => f.nameAr)).toEqual(['أرز', 'موز']);
  });
});
