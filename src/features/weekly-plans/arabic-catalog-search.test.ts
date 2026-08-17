import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { foodAliases, foods } from '@/db/schema';
import { createTestClinic, resetDatabase } from '../../../tests/helpers';

import { createCustomFood, rememberFoodAlias } from './catalog-mutations';
import { createStubTranslator } from './food-translate';
import { findFoodMatches } from './food-matching';
import { searchClinicFoods } from './queries';

/**
 * The catalog's defence against fragmentation: two spellings of the same Arabic
 * food name must resolve to the same library food, and adding one twice must not
 * create a second row. All three call sites lean on `normalizeArabic`.
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

describe('findFoodMatches with Arabic normalization', () => {
  test('a variant spelling resolves a remembered alias without a translator call', async () => {
    const [food] = await db
      .insert(foods)
      .values({ description: 'White rice', category: 'Grains', kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 })
      .returning({ id: foods.id });
    // Remembered under a bare-alef spelling.
    await rememberFoodAlias(clinicId, food!.id, 'ارز');

    let called = false;
    const translator = { async toKeywords() { called = true; return 'unused'; } };

    // Queried with hamza + tashkeel + shadda — the same word, typed differently.
    const result = await findFoodMatches(clinicId, 'أَرزّ', { translator });

    expect(result.source).toBe('alias');
    expect(result.matches[0]!.id).toBe(food!.id);
    expect(called).toBe(false);
  });
});

describe('createCustomFood duplicate prevention', () => {
  test('adding the same food under a variant spelling returns the existing row, not a duplicate', async () => {
    const first = await createCustomFood(clinicId, rice('ارز'));
    const second = await createCustomFood(clinicId, rice('أرز'));

    expect(second).toBe(first!);

    const rows = await db.select().from(foods).where(eq(foods.clinicId, clinicId));
    expect(rows).toHaveLength(1);
  });

  test('genuinely different foods are still created separately', async () => {
    const riceId = await createCustomFood(clinicId, rice('ارز'));
    const lentils = await createCustomFood(clinicId, {
      description: 'Lentils',
      nameAr: 'عدس',
      kcal: 116,
      protein: 9,
      carbs: 20,
      fat: 0.4,
    });

    expect(lentils).not.toBe(riceId);
    expect(await db.select().from(foods).where(eq(foods.clinicId, clinicId))).toHaveLength(2);
  });
});

describe('rememberFoodAlias duplicate prevention', () => {
  test('a normalized-equal alias is not stored twice', async () => {
    const [a] = await db
      .insert(foods)
      .values({ description: 'White rice', category: 'Grains', kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 })
      .returning({ id: foods.id });
    const [b] = await db
      .insert(foods)
      .values({ description: 'Brown rice', category: 'Grains', kcal: 123, protein: 2.7, carbs: 26, fat: 1 })
      .returning({ id: foods.id });

    await rememberFoodAlias(clinicId, a!.id, 'ارز');
    await rememberFoodAlias(clinicId, b!.id, 'أرز'); // normalized-equal to the first

    const aliases = await db.select().from(foodAliases).where(eq(foodAliases.clinicId, clinicId));
    expect(aliases).toHaveLength(1);
  });
});

describe('searchClinicFoods with Arabic normalization', () => {
  test('a variant-spelling query finds a clinic food stored under another spelling', async () => {
    await createCustomFood(clinicId, rice('أرز أبيض'));

    const results = await searchClinicFoods(clinicId, 'ارز ابيض');

    expect(results.map((f) => f.nameAr)).toContain('أرز أبيض');
  });
});

describe('createCustomFood reuses reusable global/USDA foods, not only clinic foods', () => {
  test('reuses a global USDA food this clinic aliased to the same Arabic name', async () => {
    // A shared USDA row: clinic_id null (default), name_ar null.
    const [usda] = await db
      .insert(foods)
      .values({
        fdcId: 171077,
        description: 'Chicken, broilers or fryers, breast, meat only, cooked, roasted',
        category: 'Poultry Products',
        kcal: 165,
        protein: 31,
        carbs: 0,
        fat: 3.6,
      })
      .returning({ id: foods.id });
    // The clinic previously bridged an Arabic name to that shared food.
    await rememberFoodAlias(clinicId, usda!.id, 'صدر دجاج');

    // Now it tries to create a custom food under a variant spelling of that name.
    const id = await createCustomFood(clinicId, {
      description: 'Chicken breast',
      nameAr: 'صَدر دجاج',
      kcal: 999, // deliberately wrong — must be discarded in favour of the real row
      protein: 1,
      carbs: 1,
      fat: 1,
    });

    // Reused the shared food; no clinic-owned duplicate was created.
    expect(id).toBe(usda!.id);
    expect(await db.select().from(foods).where(eq(foods.clinicId, clinicId))).toHaveLength(0);
  });

  test('reuses a global USDA food whose description matches, when no alias exists', async () => {
    const [usda] = await db
      .insert(foods)
      .values({ fdcId: 748608, description: 'Olive oil', category: 'Fats and Oils', kcal: 884, protein: 0, carbs: 0, fat: 100 })
      .returning({ id: foods.id });

    const id = await createCustomFood(clinicId, {
      description: 'olive oil', // same food, different case
      nameAr: 'زيت زيتون',
      kcal: 884,
      protein: 0,
      carbs: 0,
      fat: 100,
    });

    expect(id).toBe(usda!.id);
    expect(await db.select().from(foods).where(eq(foods.clinicId, clinicId))).toHaveLength(0);
  });
});

describe('clinic isolation', () => {
  test('a clinic does not reuse, or even see, another clinic custom food of the same name', async () => {
    const other = await createTestClinic();
    const otherFoodId = await createCustomFood(other, rice('أرز'));

    // Same Arabic name in a different clinic must create its OWN row.
    const mineId = await createCustomFood(clinicId, rice('أرز'));
    expect(mineId).not.toBe(otherFoodId);

    // Each clinic's search returns only its own food.
    expect((await searchClinicFoods(clinicId, 'ارز')).map((f) => f.id)).toEqual([mineId!]);
    expect((await searchClinicFoods(other, 'ارز')).map((f) => f.id)).toEqual([otherFoodId!]);
  });

  test('an alias remembered in one clinic does not resolve in another', async () => {
    const [food] = await db
      .insert(foods)
      .values({ description: 'White rice', category: 'Grains', kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 })
      .returning({ id: foods.id });
    await rememberFoodAlias(clinicId, food!.id, 'ارز');

    const other = await createTestClinic();
    const result = await findFoodMatches(other, 'أرز', { translator: createStubTranslator() });

    // No alias in the other clinic — it falls through to search, not the alias path.
    expect(result.source).toBe('search');
  });
});
