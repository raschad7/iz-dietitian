import { beforeEach, describe, expect, test } from 'bun:test';
import { eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { catalogFoodPortions, catalogFoods, weeklyPlanMeals, weeklyPlans } from '@/db/schema';
import { checkCatalogReadiness, readExpectation } from '../../../scripts/check-catalog-readiness';
import {
  createTestCatalogFood,
  createTestCatalogPortion,
  createTestClient,
  createTestClinic,
  resetDatabase,
} from '../../../tests/helpers';

import { buildMealSnapshot } from './nutrition-snapshot';

/**
 * `bun run db:check` — the gate between "migrated" and "servable".
 *
 * The check it replaced answered "are there more than zero shared foods", which a
 * database holding a single food passes, and "is `nutrition_snapshot` not null",
 * which a database holding a corrupted blob passes. Both are exactly the shape of
 * failure this whole feature exists to make loud: nothing errors, the app boots,
 * and the numbers are quietly wrong.
 *
 * These tests run against an empty test database, so nearly every check fails —
 * which is the point. What is asserted is *which* one fails, and that a check
 * cannot be satisfied by a fragment of what it is supposed to be counting.
 */

const named = (checks: Awaited<ReturnType<typeof checkCatalogReadiness>>, needle: string) => {
  const check = checks.find((row) => row.name.includes(needle));
  if (!check) throw new Error(`no check named like "${needle}" — found: ${checks.map((c) => c.name).join(', ')}`);
  return check;
};

beforeEach(async () => {
  await resetDatabase();
});

describe('expected counts come from the committed datasets', () => {
  test('the dataset describes a whole catalog, not a placeholder', () => {
    const expected = readExpectation();

    // Deliberately loose bounds. The exact numbers live in the files and are
    // asserted in `catalog-dataset.test.ts`; what matters here is that this
    // reader is finding a real dataset rather than defaulting to zero.
    expect(expected.foods).toBeGreaterThan(50);
    expect(expected.portions).toBeGreaterThan(100);
    expect(expected.aliases).toBeGreaterThan(100);
    expect(expected.dishes).toBeGreaterThan(50);
    expect(expected.dishIngredients).toBeGreaterThan(expected.dishes);
    expect(expected.checksum).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('an incomplete catalog is not ready', () => {
  test('an empty database fails the food count and says so plainly', async () => {
    const checks = await checkCatalogReadiness();

    expect(named(checks, 'shared catalog holds all').problem).toContain('no shared foods');
  });

  /**
   * The regression this pass exists for. One food is not a catalog, and the old
   * `> 0` test called it ready.
   */
  test('a single food does not satisfy the catalog check', async () => {
    await createTestCatalogFood({
      slug: 'rice-white-cooked',
      nameAr: 'أرز أبيض مطبوخ',
      nameEn: 'White rice, cooked',
      category: 'grains',
    });

    const check = named(await checkCatalogReadiness(), 'shared catalog holds all');

    expect(check.problem).toContain('holds 1 shared food(s)');
    expect(check.fix).toBe('bun run db:seed:catalog --apply');
  });

  test('a catalog seeded without its portions is not ready', async () => {
    const check = named(await checkCatalogReadiness(), 'portions');

    expect(check.problem).toContain('catalog_food_portions holds 0 row(s)');
  });

  test('an unseeded dish catalog is not ready', async () => {
    const check = named(await checkCatalogReadiness(), 'shipped dish catalog');

    expect(check.problem).toContain('data/dishes.json describes');
  });
});

describe('structural invariants', () => {
  test('a clean but empty database still passes the invariants it can', async () => {
    const checks = await checkCatalogReadiness();

    // No rows means nothing can be crossed, so these are the checks that must
    // stay green — otherwise a failure here would say nothing about real damage.
    expect(named(checks, 'resolves to a catalog food').problem).toBeNull();
    expect(named(checks, 'belongs to its own ingredient food').problem).toBeNull();
    expect(named(checks, 'another clinic').problem).toBeNull();
  });

  test('a portion belonging to a different food is caught', async () => {
    const clinicId = await createTestClinic();
    const riceId = await createTestCatalogFood({
      slug: 'rice-white-cooked',
      nameAr: 'أرز',
      nameEn: 'Rice',
      category: 'grains',
    });
    const breadId = await createTestCatalogFood({
      slug: 'pita-white',
      nameAr: 'خبز',
      nameEn: 'Pita',
      category: 'grains',
    });
    const breadPortionId = await createTestCatalogPortion(breadId, {
      labelAr: 'رغيف',
      labelEn: 'Loaf',
      grams: 60,
    });

    // Written straight to SQL: `createClinicDish` refuses this, which is the
    // other half of the defence. This is the check that catches a row that got
    // in some other way.
    const [dish] = await db.execute<{ id: string }>(sql`
      insert into dishes (clinic_id, slug, name_ar, name_en, meal_types, allergen_tags, base_serving_label)
      values (${clinicId}, 'crossed', 'مطبخ', 'Crossed', ARRAY['lunch']::text[], ARRAY[]::text[], 'حصة')
      returning id
    `);
    await db.execute(sql`
      insert into dish_ingredients (dish_id, catalog_food_id, quantity_grams, portion_id, portion_quantity, sort_order)
      values (${dish!.id}, ${riceId}, 60, ${breadPortionId}, 1, 0)
    `);

    const check = named(await checkCatalogReadiness(), 'belongs to its own ingredient food');

    expect(check.problem).toContain('1 dish ingredient(s)');
  });

  test('a shared dish depending on a clinic-private food is caught', async () => {
    const clinicId = await createTestClinic();
    const privateFoodId = await createTestCatalogFood({
      slug: 'clinic-only',
      nameAr: 'خاص',
      nameEn: 'Private',
      clinicId,
      category: 'other',
    });

    const [dish] = await db.execute<{ id: string }>(sql`
      insert into dishes (clinic_id, slug, name_ar, name_en, meal_types, allergen_tags, base_serving_label)
      values (null, 'shared-leak', 'مشترك', 'Shared', ARRAY['lunch']::text[], ARRAY[]::text[], 'حصة')
      returning id
    `);
    await db.execute(sql`
      insert into dish_ingredients (dish_id, catalog_food_id, quantity_grams, sort_order)
      values (${dish!.id}, ${privateFoodId}, 100, 0)
    `);

    const check = named(await checkCatalogReadiness(), 'accessible food');

    expect(check.problem).toContain('1 dish ingredient(s)');
  });
});

describe('published plans must carry a readable snapshot', () => {
  const RECIPE = [
    {
      quantityGrams: 100,
      food: {
        id: 'x',
        nameAr: 'x',
        nameEn: 'x',
        kcal: 100,
        protein: 5,
        carbs: 10,
        fat: 2,
        fiber: null,
        sugar: null,
        saturatedFat: null,
        cholesterol: null,
        sodium: null,
        calcium: null,
        iron: null,
        potassium: null,
      },
    },
  ];

  async function publishedMealWith(snapshot: unknown): Promise<void> {
    const clinicId = await createTestClinic();
    const clientId = await createTestClient(clinicId);
    const foodId = await createTestCatalogFood({
      slug: 'rice-white-cooked',
      nameAr: 'أرز',
      nameEn: 'Rice',
      category: 'grains',
    });

    const [dish] = await db.execute<{ id: string }>(sql`
      insert into dishes (clinic_id, slug, name_ar, name_en, meal_types, allergen_tags, base_serving_label)
      values (null, 'plan-dish', 'طبق', 'Dish', ARRAY['lunch']::text[], ARRAY[]::text[], 'حصة')
      returning id
    `);
    await db.execute(sql`
      insert into dish_ingredients (dish_id, catalog_food_id, quantity_grams, sort_order)
      values (${dish!.id}, ${foodId}, 100, 0)
    `);

    const [plan] = await db
      .insert(weeklyPlans)
      .values({
        clinicId,
        clientId,
        weekStartDate: '2026-08-17',
        status: 'published',
        kcalTargetSnapshot: 1800,
      })
      .returning({ id: weeklyPlans.id });

    await db.insert(weeklyPlanMeals).values({
      planId: plan!.id,
      dayOfWeek: 0,
      slotKey: 'lunch',
      label: 'غداء',
      timeOfDay: '13:00',
      budgetKcal: 500,
      sortOrder: 0,
      dishId: dish!.id,
      servings: 1,
      nutritionSnapshot: snapshot as never,
    });
  }

  test('a valid snapshot passes', async () => {
    await publishedMealWith(buildMealSnapshot(RECIPE));

    expect(named(await checkCatalogReadiness(), 'frozen nutrition').problem).toBeNull();
  });

  test('a missing snapshot fails', async () => {
    await publishedMealWith(null);

    expect(named(await checkCatalogReadiness(), 'frozen nutrition').problem).toContain('1 missing');
  });

  /**
   * The one SQL alone could never see. `{}` is not null, so the old check said
   * ready while the reader treated the meal exactly as it treats a draft.
   */
  test('a malformed but non-null snapshot fails', async () => {
    await publishedMealWith({ version: 1, totals: {}, grams: 0 });

    const check = named(await checkCatalogReadiness(), 'frozen nutrition');

    expect(check.problem).toContain('1 malformed');
    expect(check.fix).toBe('bun run db:backfill:plan-snapshots --apply');
  });

  test('a snapshot from an unsupported version fails and is counted apart', async () => {
    await publishedMealWith({ ...buildMealSnapshot(RECIPE), version: 2 });

    expect(named(await checkCatalogReadiness(), 'frozen nutrition').problem).toContain(
      '1 of an unsupported version',
    );
  });
});

describe('clinic-owned rows are none of this check’s business', () => {
  test('a clinic food and its portion do not count towards the shared totals', async () => {
    const clinicId = await createTestClinic();
    const foodId = await createTestCatalogFood({
      slug: 'clinic-cheese',
      nameAr: 'جبنة',
      nameEn: 'Cheese',
      clinicId,
      category: 'dairy_eggs',
    });
    await createTestCatalogPortion(foodId, { labelAr: 'حبة', labelEn: 'Piece', grams: 30 });

    const checks = await checkCatalogReadiness();

    // Still "0 of N", not "1 of N": a clinic's own food is not part of the
    // shipped catalog and must never make an unseeded database look seeded.
    expect(named(checks, 'shared catalog holds all').problem).toContain('no shared foods');
    expect(named(checks, 'portions').problem).toContain('holds 0 row(s)');
  });

  /**
   * The regression that quarantined v0.5.0 on the production host.
   *
   * Checks 8 and 9 counted every row in `dish_ingredients`, while the number they
   * compare against describes the shipped dishes and nothing else. The first clinic
   * to save a recipe of its own in a household unit therefore read as extra shipped
   * lines — "67 of 63" — and failed the deploy gate over a dietitian doing her job.
   */
  test('a clinic’s own dish does not count towards the shipped ingredient totals', async () => {
    const expected = readExpectation();
    const clinicId = await createTestClinic();
    const foodId = await createTestCatalogFood({
      slug: 'pita-white',
      nameAr: 'خبز',
      nameEn: 'Pita',
      category: 'grains',
    });
    const portionId = await createTestCatalogPortion(foodId, {
      labelAr: 'رغيف',
      labelEn: 'Loaf',
      grams: 60,
    });

    const [dish] = await db.execute<{ id: string }>(sql`
      insert into dishes (clinic_id, slug, name_ar, name_en, meal_types, allergen_tags, base_serving_label)
      values (${clinicId}, 'clinic-own', 'طبق العيادة', 'Clinic dish', ARRAY['lunch']::text[], ARRAY[]::text[], 'حصة')
      returning id
    `);
    // `is_primary` is set here as well, which `createClinicDish` never does. That
    // is the only reason check 8 was passing on the same rows check 9 failed on,
    // so a test that left it false would lock in the accident rather than the fix.
    await db.execute(sql`
      insert into dish_ingredients (dish_id, catalog_food_id, quantity_grams, portion_id, portion_quantity, is_primary, sort_order)
      values (${dish!.id}, ${foodId}, 60, ${portionId}, 1, true, 0)
    `);

    const checks = await checkCatalogReadiness();

    expect(named(checks, 'household units').problem).toBe(
      `0 of ${expected.unitIngredients} ingredients kept the unit they were authored in`,
    );
    expect(named(checks, 'adjustable lines').problem).toBe(
      `0 of ${expected.primaryIngredients} adjustable ingredients are marked`,
    );
    expect(named(checks, 'shipped dishes carry all').problem).toContain(
      'shipped dishes hold 0 ingredient row(s)',
    );
  });

  test('the clinic food really is in the database', async () => {
    const clinicId = await createTestClinic();
    await createTestCatalogFood({
      slug: 'clinic-cheese',
      nameAr: 'جبنة',
      nameEn: 'Cheese',
      clinicId,
      category: 'dairy_eggs',
    });

    const rows = await db.select().from(catalogFoods).where(eq(catalogFoods.clinicId, clinicId));
    expect(rows).toHaveLength(1);
    expect(await db.select().from(catalogFoodPortions)).toHaveLength(0);
  });
});
