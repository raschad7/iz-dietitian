import { beforeEach, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { normalizeArabic } from '@/features/weekly-plans/arabic-normalize';
import {
  appointments,
  catalogFoods,
  clinicHiddenDishes,
  dishIngredients,
  dishes,
  weeklyPlanMeals,
  weeklyPlans,
} from '@/db/schema';
import {
  createTestCatalogFood,
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
        slug: 'retired-lunch',
        nameAr: 'طبق متقاعد',
        nameEn: 'Retired dish',
        mealTypes: ['lunch'],
        allergenTags: [],
        baseServingLabel: 'حصة',
      })
      .returning({ id: dishes.id });

    await db
      .insert(dishIngredients)
      .values({ dishId: dish!.id, catalogFoodId: food!.id, quantityGrams: 200, sortOrder: 0 });

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

describe('searchFoods over the canonical catalog', () => {
  test('finds shared catalog foods and this clinic own foods', async () => {
    const shared = await createTestCatalogFood({
      slug: 'chicken-breast-raw',
      nameAr: 'صدر دجاج ني',
      nameEn: 'Chicken breast, skinless, raw',
      category: 'poultry',
    });
    const mine = await createTestCatalogFood({
      clinicId,
      slug: 'clinic-chicken-shawarma',
      nameAr: 'شاورما دجاج',
      nameEn: 'Chicken shawarma',
      category: 'poultry',
    });
    const apple = await createTestCatalogFood({
      slug: 'apple-raw',
      nameAr: 'تفاح',
      nameEn: 'Apple, raw',
      category: 'fruits',
    });

    const ids = (await searchFoods(clinicId, 'دجاج', 10)).map((f) => f.id);

    expect(ids).toContain(shared);
    expect(ids).toContain(mine);
    expect(ids).not.toContain(apple);
  });

  test('the clinic own food is ranked ahead of the shared catalog', async () => {
    await createTestCatalogFood({
      slug: 'chicken-breast-raw',
      nameAr: 'صدر دجاج ني',
      nameEn: 'Chicken breast, skinless, raw',
      category: 'poultry',
    });
    const mine = await createTestCatalogFood({
      clinicId,
      slug: 'clinic-chicken-shawarma',
      nameAr: 'شاورما دجاج',
      nameEn: 'Chicken shawarma',
      category: 'poultry',
    });

    const results = await searchFoods(clinicId, 'دجاج', 10);

    expect(results[0]?.id).toBe(mine);
  });

  test('does not return another clinic custom food', async () => {
    const other = await createTestClinic();
    await createTestCatalogFood({
      clinicId: other,
      slug: 'clinic-secret-chicken',
      nameAr: 'دجاج سري',
      nameEn: 'Chicken secret',
    });

    expect(await searchFoods(clinicId, 'دجاج سري', 10)).toHaveLength(0);
  });

  /**
   * The cutover, still asserted after the legacy tables are gone.
   *
   * Before Phase 1 the picker searched 7,793 USDA SR Legacy rows by English
   * substring, so restaurant meals, baby food and alcohol were one keystroke from a
   * meal plan. Phase 2 dropped the `foods` and `food_aliases` tables outright — the
   * seed no longer needs them — so the strongest statement available is that the
   * search reaches nothing but `catalog_foods`, and that those descriptions match
   * nothing in it.
   */
  test('cannot reach USDA-style noise: the catalog is the only source', async () => {
    const tables = await db.execute<{ table_name: string }>(sql`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_name in ('foods', 'food_aliases')
    `);
    expect(tables).toHaveLength(0);

    for (const noise of ['egg rolls', 'Babyfood', 'beer', 'Restaurant']) {
      expect(await searchFoods(clinicId, noise, 20)).toHaveLength(0);
    }
  });
});

describe('searchFoodsById', () => {
  test("returns the food row by id, or empty for another clinic's", async () => {
    const shared = await createTestCatalogFood({ slug: 'shared-food', nameEn: 'Shared food' });
    const other = await createTestClinic();
    const theirs = await createTestCatalogFood({
      clinicId: other,
      slug: 'their-food',
      nameEn: 'Other clinic food',
    });

    expect((await searchFoodsById(clinicId, shared)).map((f) => f.id)).toEqual([shared]);
    expect(await searchFoodsById(clinicId, theirs)).toEqual([]);
  });
});

describe('clinic food library', () => {
  test('listClinicFoods returns only this clinic own foods, ordered by nameAr', async () => {
    const other = await createTestClinic();

    await createTestCatalogFood({ slug: 'shared-food', nameAr: 'مشترك', nameEn: 'Shared food' });
    await createTestCatalogFood({ clinicId, slug: 'clinic-banana', nameAr: 'موز', nameEn: 'Banana custom' });
    await createTestCatalogFood({ clinicId, slug: 'clinic-rice', nameAr: 'أرز', nameEn: 'Rice custom' });
    await createTestCatalogFood({ clinicId: other, slug: 'other-bread', nameAr: 'خبز', nameEn: 'Other clinic bread' });

    const result = await listClinicFoods(clinicId);

    expect(result.map((f) => f.nameAr)).toEqual(['أرز', 'موز']);
  });

  test('searchClinicFoods matches by Arabic name, scoped to the clinic', async () => {
    const other = await createTestClinic();
    await createTestCatalogFood({ clinicId, slug: 'clinic-chicken', nameAr: 'دجاج', nameEn: 'Chicken custom' });

    expect((await searchClinicFoods(clinicId, 'دجاج')).map((f) => f.nameAr)).toEqual(['دجاج']);
    expect(await searchClinicFoods(other, 'دجاج')).toEqual([]);
  });

  test('searchClinicFoods with an empty query returns the clinic library', async () => {
    await createTestCatalogFood({ clinicId, slug: 'clinic-banana', nameAr: 'موز', nameEn: 'Banana custom' });
    await createTestCatalogFood({ clinicId, slug: 'clinic-rice', nameAr: 'أرز', nameEn: 'Rice custom' });

    const results = await searchClinicFoods(clinicId, '');

    expect(results.map((f) => f.nameAr)).toEqual(['أرز', 'موز']);
  });
});
