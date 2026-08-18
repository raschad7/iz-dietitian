import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { catalogFoods } from '@/db/schema';
import {
  createTestCatalogAlias,
  createTestCatalogFood,
  createTestClinic,
  resetDatabase,
} from '../../../tests/helpers';

import { createCustomFood, rememberFoodAlias } from './catalog-mutations';
import { searchIngredients } from './ingredient-search';
import { searchClinicFoods, searchFoods } from './queries';

/**
 * Ingredient search over the canonical catalog.
 *
 * Two things are being defended. **Fragmentation:** two spellings of the same
 * Arabic name must resolve to the same food, and adding one twice must not create a
 * second row — all of which leans on `normalizeArabic`. And **the cutover itself:**
 * the picker must reach the catalog and nothing else, because the path it replaced
 * searched 7,793 USDA rows by English substring and guessed Arabic labels back out
 * of them.
 */

let clinicId: string;

beforeEach(async () => {
  await resetDatabase();
  clinicId = await createTestClinic();
});

const rice = (nameAr: string) => ({
  description: 'White rice',
  nameAr,
  kcal: 130,
  protein: 2.7,
  carbs: 28,
  fat: 0.3,
});

/** The shared catalog rows most of these tests search against. */
async function seedSharedCatalog() {
  const riceId = await createTestCatalogFood({
    slug: 'rice-white-cooked',
    nameAr: 'أرز أبيض مطبوخ',
    nameEn: 'White rice, cooked',
    state: 'cooked',
    category: 'grains',
  });
  await createTestCatalogAlias(riceId, 'رز');
  await createTestCatalogAlias(riceId, 'ارز');

  const tomatoId = await createTestCatalogFood({
    slug: 'tomato-raw',
    nameAr: 'بندورة',
    nameEn: 'Tomato, raw',
    category: 'vegetables',
  });
  await createTestCatalogAlias(tomatoId, 'طماطم');

  const chickenId = await createTestCatalogFood({
    slug: 'chicken-breast-raw',
    nameAr: 'صدر دجاج ني',
    nameEn: 'Chicken breast, skinless, raw',
    category: 'poultry',
  });
  await createTestCatalogAlias(chickenId, 'دجاج');
  await createTestCatalogAlias(chickenId, 'جاج');

  const chickenThighId = await createTestCatalogFood({
    slug: 'chicken-thigh-raw',
    nameAr: 'فخذ دجاج ني',
    nameEn: 'Chicken thigh, meat only, raw',
    category: 'poultry',
  });
  await createTestCatalogAlias(chickenThighId, 'دجاج');

  const eggId = await createTestCatalogFood({
    slug: 'egg-raw',
    nameAr: 'بيض ني',
    nameEn: 'Egg, whole, raw',
    category: 'dairy_eggs',
  });
  await createTestCatalogAlias(eggId, 'بيض');

  const eggplantId = await createTestCatalogFood({
    slug: 'eggplant-raw',
    nameAr: 'باذنجان',
    nameEn: 'Eggplant, raw',
    category: 'vegetables',
  });

  return { riceId, tomatoId, chickenId, chickenThighId, eggId, eggplantId };
}

describe('canonical name search', () => {
  test('finds a food by its stored Arabic name', async () => {
    const ids = await seedSharedCatalog();

    const results = await searchFoods(clinicId, 'بندورة');

    expect(results.map((row) => row.id)).toContain(ids.tomatoId);
  });

  test('finds a food by its stored English name', async () => {
    const ids = await seedSharedCatalog();

    const results = await searchFoods(clinicId, 'Tomato');

    expect(results.map((row) => row.id)).toContain(ids.tomatoId);
  });

  test('a variant Arabic spelling still finds the food', async () => {
    const ids = await seedSharedCatalog();

    // Hamza + tashkeel + shadda: the same word, typed differently.
    const results = await searchFoods(clinicId, 'أَرزّ');

    expect(results.map((row) => row.id)).toContain(ids.riceId);
  });
});

describe('alias search', () => {
  test('طماطم finds بندورة', async () => {
    const ids = await seedSharedCatalog();

    const results = await searchFoods(clinicId, 'طماطم');

    expect(results.map((row) => row.id)).toEqual([ids.tomatoId]);
  });

  test('رز finds أرز أبيض', async () => {
    const ids = await seedSharedCatalog();

    const results = await searchFoods(clinicId, 'رز');

    expect(results.map((row) => row.id)).toContain(ids.riceId);
  });

  test('a food with several matching aliases is returned once', async () => {
    const ids = await seedSharedCatalog();

    const results = await searchFoods(clinicId, 'دجاج');
    const chickenHits = results.filter((row) => row.id === ids.chickenId);

    expect(chickenHits).toHaveLength(1);
  });

  test('دجاج returns the chicken entries and nothing else', async () => {
    const ids = await seedSharedCatalog();

    const results = await searchFoods(clinicId, 'دجاج');

    expect(results.map((row) => row.id).sort()).toEqual(
      [ids.chickenId, ids.chickenThighId].sort(),
    );
  });
});

/**
 * The heuristic this replaced matched `egg` before `eggplant` in `FOOD_BASES`, so
 * `Eggplant, raw` was labelled بيض and 94 USDA rows resolved to بيض that way.
 * Names are stored now, so the classification cannot happen at all.
 */
describe('eggplant is not egg', () => {
  test('searching بيض does not return eggplant', async () => {
    const ids = await seedSharedCatalog();

    const results = await searchFoods(clinicId, 'بيض');

    expect(results.map((row) => row.id)).toContain(ids.eggId);
    expect(results.map((row) => row.id)).not.toContain(ids.eggplantId);
  });

  test('eggplant is displayed as باذنجان, never as بيض', async () => {
    await seedSharedCatalog();

    const results = await searchIngredients(clinicId, 'باذنجان', 'ar');

    expect(results).toHaveLength(1);
    expect(results[0]!.nameAr).toBe('باذنجان');
    expect(results[0]!.nameEn).toBe('Eggplant, raw');
  });

  test('searching باذنجان does not return the egg', async () => {
    const ids = await seedSharedCatalog();

    const results = await searchFoods(clinicId, 'باذنجان');

    expect(results.map((row) => row.id)).toEqual([ids.eggplantId]);
  });
});

describe('raw and cooked stay distinct', () => {
  test('a raw and a cooked staple are separate entries with their own nutrition', async () => {
    const rawId = await createTestCatalogFood({
      slug: 'rice-white-dry',
      nameAr: 'أرز أبيض ناشف',
      nameEn: 'White rice, dry',
      state: 'dry',
      category: 'grains',
      kcal: 365,
    });
    const cookedId = await createTestCatalogFood({
      slug: 'rice-white-cooked',
      nameAr: 'أرز أبيض مطبوخ',
      nameEn: 'White rice, cooked',
      state: 'cooked',
      category: 'grains',
      kcal: 130,
    });

    const results = await searchFoods(clinicId, 'أرز');
    const ids = results.map((row) => row.id);

    expect(ids).toContain(rawId);
    expect(ids).toContain(cookedId);

    const rows = await db.select().from(catalogFoods);
    expect(rows.find((row) => row.id === rawId)?.kcal).toBe(365);
    expect(rows.find((row) => row.id === cookedId)?.kcal).toBe(130);
    expect(rows.find((row) => row.id === rawId)?.state).toBe('dry');
    expect(rows.find((row) => row.id === cookedId)?.state).toBe('cooked');
  });
});

describe('createCustomFood duplicate prevention', () => {
  test('adding the same food under a variant spelling returns the existing row, not a duplicate', async () => {
    const first = await createCustomFood(clinicId, rice('ارز'));
    const second = await createCustomFood(clinicId, rice('أرز'));

    expect(second).toBe(first!);

    const rows = await db.select().from(catalogFoods).where(eq(catalogFoods.clinicId, clinicId));
    expect(rows).toHaveLength(1);
  });

  test('genuinely different foods are still created separately', async () => {
    const first = await createCustomFood(clinicId, rice('ارز'));
    const second = await createCustomFood(clinicId, { ...rice('عدس'), description: 'Lentils' });

    expect(second).not.toBe(first!);

    const rows = await db.select().from(catalogFoods).where(eq(catalogFoods.clinicId, clinicId));
    expect(rows).toHaveLength(2);
  });

  test('reuses a shared catalog food rather than adding a clinic copy of it', async () => {
    const ids = await seedSharedCatalog();

    // The dietitian types a name the shared catalog already answers to.
    const created = await createCustomFood(clinicId, {
      description: 'Tomato',
      nameAr: 'طماطم',
      kcal: 18,
      protein: 0.9,
      carbs: 3.9,
      fat: 0.2,
    });

    expect(created).toBe(ids.tomatoId);

    const clinicRows = await db
      .select()
      .from(catalogFoods)
      .where(eq(catalogFoods.clinicId, clinicId));
    expect(clinicRows).toHaveLength(0);
  });

  test('a custom food is clinic-scoped and never verified', async () => {
    const id = await createCustomFood(clinicId, rice('ارز'));

    const [row] = await db.select().from(catalogFoods).where(eq(catalogFoods.id, id!));

    expect(row?.clinicId).toBe(clinicId);
    expect(row?.sourceType).toBe('clinic_entered');
    expect(row?.verificationStatus).toBe('provisional');
  });
});

describe('rememberFoodAlias', () => {
  test('a normalized-equal alias is not stored twice', async () => {
    const foodId = await createCustomFood(clinicId, rice('ارز'));

    await rememberFoodAlias(clinicId, foodId!, 'أَرزّ');
    await rememberFoodAlias(clinicId, foodId!, 'ارز');

    const results = await searchFoods(clinicId, 'ارز');
    expect(results.filter((row) => row.id === foodId)).toHaveLength(1);
  });

  test('refuses to add a synonym to a shared catalog food', async () => {
    const ids = await seedSharedCatalog();

    // One clinic's vocabulary must not become every clinic's.
    await rememberFoodAlias(clinicId, ids.tomatoId, 'قوطة');

    const results = await searchFoods(clinicId, 'قوطة');
    expect(results).toHaveLength(0);
  });
});

describe('clinic isolation', () => {
  test('a clinic does not see another clinic custom food of the same name', async () => {
    const otherClinicId = await createTestClinic('Other Clinic');

    const mine = await createCustomFood(clinicId, rice('ارز'));
    const theirs = await createCustomFood(otherClinicId, rice('ارز'));

    expect(theirs).not.toBe(mine!);

    const myResults = await searchFoods(clinicId, 'ارز');
    expect(myResults.map((row) => row.id)).toEqual([mine!]);

    const theirResults = await searchFoods(otherClinicId, 'ارز');
    expect(theirResults.map((row) => row.id)).toEqual([theirs!]);
  });

  test('an alias on one clinic food does not resolve in another', async () => {
    const otherClinicId = await createTestClinic('Other Clinic');
    const foodId = await createCustomFood(clinicId, rice('ارز'));

    await rememberFoodAlias(clinicId, foodId!, 'تمن');

    expect((await searchFoods(clinicId, 'تمن')).map((row) => row.id)).toEqual([foodId!]);
    expect(await searchFoods(otherClinicId, 'تمن')).toHaveLength(0);
  });

  test('shared catalog foods are visible to every clinic', async () => {
    const ids = await seedSharedCatalog();
    const otherClinicId = await createTestClinic('Other Clinic');

    expect((await searchFoods(clinicId, 'بندورة')).map((row) => row.id)).toContain(ids.tomatoId);
    expect((await searchFoods(otherClinicId, 'بندورة')).map((row) => row.id)).toContain(
      ids.tomatoId,
    );
  });

  test('searchClinicFoods returns only this clinic own foods', async () => {
    await seedSharedCatalog();
    const mine = await createCustomFood(clinicId, { ...rice('لبن عيران'), description: 'Ayran' });

    const results = await searchClinicFoods(clinicId, '');

    expect(results.map((row) => row.id)).toEqual([mine!]);
  });
});

describe('inactive foods', () => {
  test('an archived catalog food is not offered', async () => {
    const id = await createTestCatalogFood({
      slug: 'retired-food',
      nameAr: 'طعام متقاعد',
      nameEn: 'Retired food',
      isActive: false,
    });

    expect((await searchFoods(clinicId, 'متقاعد')).map((row) => row.id)).not.toContain(id);
  });
});


/**
 * The picker's two lists, over the real database.
 *
 * `refineIngredientResults` is unit-tested with a hand-built alias index; this is
 * the other half — that `searchIngredients` actually loads the aliases behind the
 * rows it found, so the grouping has something to work with. Without the load, an
 * alias match arrives looking exactly like no match at all.
 */
describe('search results are grouped by the reader’s language', () => {
  test('an Arabic alias search leads the Arabic list', async () => {
    await seedSharedCatalog();

    const results = await searchIngredients(clinicId, 'طماطم', 'ar');

    expect(results).toHaveLength(1);
    // Found by its synonym, displayed under its canonical name, and primary.
    expect(results[0]!.nameAr).toBe('بندورة');
    expect(results[0]!.matchesLocale).toBe(true);
  });

  test('an English name search leads the English list', async () => {
    await seedSharedCatalog();

    const results = await searchIngredients(clinicId, 'tomato', 'en');

    expect(results.map((row) => row.nameEn)).toContain('Tomato, raw');
    expect(results.every((row) => row.matchesLocale)).toBe(true);
  });

  test('an English alias search leads the English list', async () => {
    const foodId = await createTestCatalogFood({
      slug: 'labneh',
      nameAr: 'لبنة',
      nameEn: 'Labneh',
      category: 'dairy_eggs',
    });
    await createTestCatalogAlias(foodId, 'strained yogurt', 'en');

    const results = await searchIngredients(clinicId, 'strained', 'en');

    expect(results).toHaveLength(1);
    expect(results[0]!.nameEn).toBe('Labneh');
    expect(results[0]!.matchesLocale).toBe(true);
  });

  test('the same Arabic query is secondary in an English UI, never missing', async () => {
    await seedSharedCatalog();

    const results = await searchIngredients(clinicId, 'طماطم', 'en');

    expect(results).toHaveLength(1);
    expect(results[0]!.nameAr).toBe('بندورة');
    expect(results[0]!.matchesLocale).toBe(false);
  });

  test('a clinic alias never reaches another clinic', async () => {
    const otherClinicId = await createTestClinic();
    const mine = await createCustomFood(clinicId, {
      nameAr: 'جبنة بلدية',
      description: 'Local cheese',
      kcal: 300,
      protein: 20,
      carbs: 2,
      fat: 24,
    });
    await rememberFoodAlias(clinicId, mine!, 'جبنة نابلسية');

    // Mine, by the synonym I recorded.
    expect((await searchIngredients(clinicId, 'نابلسية', 'ar')).map((row) => row.id)).toEqual([
      mine!,
    ]);
    // Not the other clinic's, by the same synonym.
    expect(await searchIngredients(otherClinicId, 'نابلسية', 'ar')).toEqual([]);
  });
});
