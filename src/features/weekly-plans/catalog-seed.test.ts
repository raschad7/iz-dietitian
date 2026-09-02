import { beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/db';
import { catalogFoodAliases, catalogFoodPortions, catalogFoods, dishIngredients, dishes } from '@/db/schema';

import { seedCatalogFoods, readCatalogDataset } from '../../../scripts/seed-catalog-foods';
import { seedDishes } from '../../../scripts/seed-dishes';
import { createTestCatalogFood, createTestClinic, resetDatabase } from '../../../tests/helpers';

import { normalizeArabic } from './arabic-normalize';
import { dishTotals, NUTRIENT_KEYS, type FoodNutrients } from './nutrition';
import { loadCatalog, searchFoods } from './queries';

/**
 * The seed, against a real database.
 *
 * Two properties matter most and neither is visible from the file alone: that a
 * fresh database ends up servable with nothing but `db:seed:catalog` and
 * `db:seed:dishes` — no USDA table to load first — and that running it a second
 * time changes nothing.
 */

const CURATED = readCatalogDataset();

beforeEach(async () => {
  await resetDatabase();
});

describe('a fresh database', () => {
  test('is seeded from the committed dataset alone, with no legacy food table', async () => {
    // The `foods` table is gone. Stated here because "self-contained" is exactly
    // the claim: 91 canonical foods without first loading 7,793 USDA rows.
    const legacy = await db.execute<{ table_name: string }>(sql`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_name in ('foods', 'food_aliases')
    `);
    expect(legacy).toHaveLength(0);

    const report = await seedCatalogFoods({ apply: true });

    expect(report.rejected).toEqual([]);
    expect(report.foodsCreated).toBe(CURATED.length);
    expect(report.foodsUpdated).toBe(0);
    expect(report.foodsUnchanged).toBe(0);

    const [foods] = await db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(catalogFoods)
      .where(isNull(catalogFoods.clinicId));
    expect(foods!.n).toBe(CURATED.length);

    const [portions] = await db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(catalogFoodPortions);
    expect(portions!.n).toBe(CURATED.reduce((total, food) => total + food.portions.length, 0));
  });

  test('then takes the dish catalog, every ingredient resolving to a canonical food', async () => {
    await seedCatalogFoods({ apply: true });
    const result = await seedDishes();

    expect(result.dishes).toBe(114);
    expect(result.ingredients).toBe(481);

    // `catalog_food_id` is NOT NULL since Phase 2, so this asserts the join
    // resolves rather than merely that a column is populated.
    const rows = await db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(dishIngredients)
      .innerJoin(catalogFoods, eq(catalogFoods.id, dishIngredients.catalogFoodId));
    expect(rows[0]!.n).toBe(481);

    // And the whole catalog reads back through the app's own loader, recipes intact.
    const catalog = await loadCatalog(await createTestClinic());
    expect(catalog).toHaveLength(114);
    expect(catalog.every((dish) => dish.ingredients.length > 0)).toBe(true);
  });

  test('copies nutrition and portions verbatim, nulls included', async () => {
    await seedCatalogFoods({ apply: true });

    const curated = CURATED.find((food) => food.slug === 'rice-white-cooked')!;
    const [stored] = await db
      .select()
      .from(catalogFoods)
      .where(and(eq(catalogFoods.slug, curated.slug), isNull(catalogFoods.clinicId)));

    expect(stored!.kcal).toBe(curated.nutrition.kcal!);
    expect(stored!.verificationStatus).toBe('verified');
    expect(stored!.sourceRef).toBe(curated.sourceRef);

    // A food whose fibre was never measured must store null, not 0 — the whole
    // unmeasured/absent distinction depends on it.
    const unmeasured = CURATED.filter((food) => food.nutrition.fiber === null);
    expect(unmeasured.length).toBeGreaterThan(0);
    const [row] = await db
      .select({ fiber: catalogFoods.fiber })
      .from(catalogFoods)
      .where(and(eq(catalogFoods.slug, unmeasured[0]!.slug), isNull(catalogFoods.clinicId)));
    expect(row!.fiber).toBeNull();

    const portions = await db
      .select({ labelAr: catalogFoodPortions.labelAr, labelEn: catalogFoodPortions.labelEn, grams: catalogFoodPortions.grams })
      .from(catalogFoodPortions)
      .innerJoin(catalogFoods, eq(catalogFoods.id, catalogFoodPortions.foodId))
      .where(eq(catalogFoods.slug, 'olive-oil'))
      .orderBy(catalogFoodPortions.sortOrder);

    expect(portions).toEqual([
      { labelAr: 'ملعقة كبيرة', labelEn: 'Tablespoon', grams: 13.5 },
      { labelAr: 'ملعقة صغيرة', labelEn: 'Teaspoon', grams: 4.5 },
    ]);
  });
});

describe('dish nutrition after the migration', () => {
  /**
   * Parity, for all 114 dishes at once.
   *
   * "Before and after" cannot mean "against the old `foods` table" any more — that
   * table is gone. What it means instead is the stronger statement: every total the
   * application computes out of the database equals the total computed directly
   * from the committed dataset and `data/dishes.json`, nutrient by nutrient. Any
   * drift introduced by the seed, the join, or the portion columns shows up here.
   */
  test('every dish totals exactly what the committed data says it should', async () => {
    await seedCatalogFoods({ apply: true });
    await seedDishes();

    const nutritionByRef = new Map(CURATED.map((food) => [food.sourceRef, food.nutrition]));
    const recipes = (
      JSON.parse(readFileSync('data/dishes.json', 'utf8')) as {
        dishes: { slug: string; ingredients: { fdcId: number; grams: number }[] }[];
      }
    ).dishes;

    const catalog = await loadCatalog(await createTestClinic());
    expect(catalog).toHaveLength(recipes.length);

    const fromDatabase = new Map(catalog.map((dish) => [dish.slug, dishTotals(dish.ingredients, 1)]));

    for (const recipe of recipes) {
      const expected = dishTotals(
        recipe.ingredients.map((ingredient) => ({
          quantityGrams: ingredient.grams,
          food: {
            id: String(ingredient.fdcId),
            nameAr: '',
            nameEn: '',
            ...(nutritionByRef.get(String(ingredient.fdcId)) as unknown as FoodNutrients),
          },
        })),
        1,
      );

      const actual = fromDatabase.get(recipe.slug);
      expect(actual).toBeDefined();

      for (const key of NUTRIENT_KEYS) {
        expect(actual![key].value).toBeCloseTo(expected[key].value, 4);
        // The unmeasured counts have to match too: a null read back as 0 would
        // agree on the total and lie about how much of it is known.
        expect(actual![key].unmeasured).toBe(expected[key].unmeasured);
      }
    }
  });
});

describe('re-running the seed', () => {
  test('changes nothing and reports every row as unchanged', async () => {
    await seedCatalogFoods({ apply: true });
    await seedDishes();

    const before = await db.select().from(catalogFoods).orderBy(catalogFoods.slug);
    const beforePortions = await db.select().from(catalogFoodPortions).orderBy(catalogFoodPortions.id);

    const second = await seedCatalogFoods({ apply: true });

    expect(second.foodsCreated).toBe(0);
    expect(second.foodsUpdated).toBe(0);
    expect(second.foodsUnchanged).toBe(CURATED.length);
    expect(second.portionsRemoved).toBe(0);
    expect(second.rejected).toEqual([]);

    const after = await db.select().from(catalogFoods).orderBy(catalogFoods.slug);
    const afterPortions = await db.select().from(catalogFoodPortions).orderBy(catalogFoodPortions.id);

    // Ids especially: a re-seed that replaced rows would orphan every recipe.
    expect(after.map((row) => row.id)).toEqual(before.map((row) => row.id));
    expect(after.map((row) => row.kcal)).toEqual(before.map((row) => row.kcal));
    expect(afterPortions.map((row) => [row.id, row.grams])).toEqual(
      beforePortions.map((row) => [row.id, row.grams]),
    );
  });

  test('re-seeding dishes keeps them pointing at the same catalog rows', async () => {
    await seedCatalogFoods({ apply: true });
    await seedDishes();

    const before = await db
      .select({ dishId: dishes.id, slug: dishes.slug })
      .from(dishes)
      .orderBy(dishes.slug);

    await seedDishes();

    const after = await db
      .select({ dishId: dishes.id, slug: dishes.slug })
      .from(dishes)
      .orderBy(dishes.slug);

    expect(after).toEqual(before);
  });
});

describe('an alias the dataset has dropped', () => {
  /**
   * The Phase 2 correction, end to end. A database seeded before مفتول was removed
   * still holds that alias, and an upsert-only seed would leave it there forever —
   * so a search for مفتول would go on quietly answering with couscous nutrition.
   */
  test('is removed on the next seed, so مفتول stops resolving to couscous', async () => {
    await seedCatalogFoods({ apply: true });

    const [couscous] = await db
      .select({ id: catalogFoods.id })
      .from(catalogFoods)
      .where(and(eq(catalogFoods.slug, 'couscous-dry'), isNull(catalogFoods.clinicId)));

    // Re-introduce it the way a pre-Phase-2 database would have it.
    await db.insert(catalogFoodAliases).values({
      foodId: couscous!.id,
      name: 'مفتول',
      normalizedName: normalizeArabic('مفتول'),
      locale: 'ar',
    });

    const clinicId = await createTestClinic();
    expect((await searchFoods(clinicId, 'مفتول')).map((food) => food.nameEn)).toEqual([
      'Couscous, dry',
    ]);

    await seedCatalogFoods({ apply: true });

    expect(await searchFoods(clinicId, 'مفتول')).toEqual([]);
    // And no maftoul row was invented to fill the gap: no result is the answer.
    expect(await searchFoods(clinicId, 'كسكس')).not.toEqual([]);
  });
});

describe('report-only mode', () => {
  test('writes nothing', async () => {
    const report = await seedCatalogFoods();

    expect(report.applied).toBe(false);
    expect(report.foodsCreated).toBe(CURATED.length);

    const [count] = await db.select({ n: sql<number>`cast(count(*) as int)` }).from(catalogFoods);
    expect(count!.n).toBe(0);
  });

  test('counts a clinic-owned food as untouched rather than as anything to write', async () => {
    const clinicId = await createTestClinic();
    await createTestCatalogFood({ clinicId, nameAr: 'جميد بلدي', nameEn: 'Homemade jameed' });

    const report = await seedCatalogFoods();

    expect(report.clinicFoodsUntouched).toBe(1);
  });
});
