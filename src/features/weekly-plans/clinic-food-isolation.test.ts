import { beforeEach, describe, expect, test } from 'bun:test';
import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { catalogFoodPortions, catalogFoods, dishIngredients, dishes } from '@/db/schema';

import { seedCatalogFoods } from '../../../scripts/seed-catalog-foods';
import {
  createTestCatalogAlias,
  createTestCatalogFood,
  createTestCatalogPortion,
  createTestClinic,
  resetDatabase,
} from '../../../tests/helpers';

import { createClinicDish, createCustomFood, rememberFoodAlias, updateClinicDish } from './catalog-mutations';
import { dishTotals } from './nutrition';
import {
  getClinicDishForEdit,
  listClinicFoods,
  searchFoods,
  searchFoodsById,
} from './queries';

/**
 * Two clinics, each with its own foods, aliases, portions and dishes.
 *
 * A production-shaped fixture rather than a minimal one, because the properties
 * worth proving are the ones that only appear when two tenants coexist: that one
 * clinic's private food never leaks into the other's search, that a portion — which
 * carries no `clinic_id` of its own and inherits scope from its food — is not a way
 * around that, and that a re-seed of the shared catalog leaves both alone.
 */

let alpha: string;
let beta: string;

/** Everything one clinic owns: a food, a synonym for it, a portion, and a dish using it. */
async function setUpClinic(
  clinicId: string,
  names: { nameAr: string; nameEn: string; alias: string; portionAr: string; portionEn: string },
) {
  const foodId = await createCustomFood(clinicId, {
    nameAr: names.nameAr,
    description: names.nameEn,
    kcal: 250,
    protein: 18,
    carbs: 4,
    fat: 19,
    unit: 'piece',
    unitGrams: 30,
  });

  await rememberFoodAlias(clinicId, foodId!, names.alias);

  const portionId = await createTestCatalogPortion(foodId!, {
    labelAr: names.portionAr,
    labelEn: names.portionEn,
    grams: 120,
  });

  const dishId = await createClinicDish(clinicId, {
    nameAr: `طبق ${names.nameAr}`,
    nameEn: `${names.nameEn} dish`,
    mealTypes: ['lunch'],
    source: 'home',
    effort: 'medium',
    cost: 'normal',
    occasion: 'everyday',
    allergenTags: [],
    baseServingLabel: 'حصة',
    ingredients: [{ foodId: foodId!, quantityGrams: 240, portionId, portionQuantity: 2 }],
  });

  return { foodId: foodId!, portionId, dishId: dishId! };
}

beforeEach(async () => {
  await resetDatabase();
  alpha = await createTestClinic('Alpha Clinic');
  beta = await createTestClinic('Beta Clinic');
});

describe('a clinic’s own foods', () => {
  test('are created private, provisional, and never shared or verified', async () => {
    const { foodId } = await setUpClinic(alpha, {
      nameAr: 'جميد بلدي',
      nameEn: 'Homemade jameed',
      alias: 'جميد',
      portionAr: 'كوب',
      portionEn: 'Cup',
    });

    const [food] = await db.select().from(catalogFoods).where(eq(catalogFoods.id, foodId));

    expect(food!.clinicId).toBe(alpha);
    expect(food!.sourceType).toBe('clinic_entered');
    expect(food!.verificationStatus).not.toBe('verified');
    expect(food!.sourceRef).toBeNull();
  });

  test('carry the household unit the dietitian chose, as a real portion row', async () => {
    const { foodId } = await setUpClinic(alpha, {
      nameAr: 'جميد بلدي',
      nameEn: 'Homemade jameed',
      alias: 'جميد',
      portionAr: 'كوب',
      portionEn: 'Cup',
    });

    const portions = await db
      .select()
      .from(catalogFoodPortions)
      .where(eq(catalogFoodPortions.foodId, foodId))
      .orderBy(catalogFoodPortions.sortOrder);

    // The dialog's unit, plus the extra one this fixture added — proof a clinic
    // food supports many portions exactly as a shipped food does.
    expect(portions.map((portion) => [portion.labelAr, portion.labelEn, portion.grams])).toEqual([
      ['حبة', 'Piece', 30],
      ['كوب', 'Cup', 120],
    ]);
    expect(portions.filter((portion) => portion.isDefault)).toHaveLength(1);
  });
});

describe('cross-clinic access', () => {
  test('one clinic cannot search, read or list another’s food', async () => {
    const theirs = await setUpClinic(beta, {
      nameAr: 'لبنة بيتية',
      nameEn: 'Homemade labneh',
      alias: 'لبنة',
      portionAr: 'علبة',
      portionEn: 'Container',
    });

    expect(await searchFoods(alpha, 'لبنة بيتية')).toEqual([]);
    // Not by its alias either — an alias inherits its food's scope.
    expect(await searchFoods(alpha, 'لبنة')).toEqual([]);
    expect(await searchFoodsById(alpha, theirs.foodId)).toEqual([]);
    expect(await listClinicFoods(alpha)).toEqual([]);

    // And the owner still sees it, so this is isolation rather than breakage.
    expect((await searchFoods(beta, 'لبنة')).map((food) => food.id)).toEqual([theirs.foodId]);
  });

  test('one clinic cannot use another’s food in a dish, even naming its id directly', async () => {
    const theirs = await setUpClinic(beta, {
      nameAr: 'لبنة بيتية',
      nameEn: 'Homemade labneh',
      alias: 'لبنة',
      portionAr: 'علبة',
      portionEn: 'Container',
    });

    const created = await createClinicDish(alpha, {
      nameAr: 'محاولة',
      nameEn: 'Attempt',
      mealTypes: ['lunch'],
      source: 'home',
      effort: 'medium',
      cost: 'normal',
      occasion: 'everyday',
      allergenTags: [],
      baseServingLabel: 'حصة',
      ingredients: [{ foodId: theirs.foodId, quantityGrams: 100 }],
    });

    expect(created).toBeNull();
  });

  /**
   * The portion table carries no `clinic_id` — scope is the food's. That is only
   * safe if the write path re-derives it, so a forged portion id has to be refused
   * at the food it hangs off, not at the portion itself.
   */
  test('one clinic cannot use another’s portion, even on a food it can see', async () => {
    const theirs = await setUpClinic(beta, {
      nameAr: 'لبنة بيتية',
      nameEn: 'Homemade labneh',
      alias: 'لبنة',
      portionAr: 'علبة',
      portionEn: 'Container',
    });

    const mine = await createTestCatalogFood({ clinicId: alpha, nameAr: 'زعتر', nameEn: 'Zaatar' });

    const created = await createClinicDish(alpha, {
      nameAr: 'محاولة',
      nameEn: 'Attempt',
      mealTypes: ['lunch'],
      source: 'home',
      effort: 'medium',
      cost: 'normal',
      occasion: 'everyday',
      allergenTags: [],
      baseServingLabel: 'حصة',
      // A food this clinic owns, measured with a portion it does not.
      ingredients: [{ foodId: mine, quantityGrams: 240, portionId: theirs.portionId, portionQuantity: 2 }],
    });

    expect(created).toBeNull();
  });

  test('a portion belonging to a different food is refused even within one clinic', async () => {
    const cheese = await createTestCatalogFood({ clinicId: alpha, nameAr: 'جبنة', nameEn: 'Cheese' });
    const bread = await createTestCatalogFood({ clinicId: alpha, nameAr: 'خبز', nameEn: 'Bread' });
    const breadLoaf = await createTestCatalogPortion(bread, {
      labelAr: 'رغيف',
      labelEn: 'Loaf',
      grams: 60,
    });

    const created = await createClinicDish(alpha, {
      nameAr: 'محاولة',
      nameEn: 'Attempt',
      mealTypes: ['lunch'],
      source: 'home',
      effort: 'medium',
      cost: 'normal',
      occasion: 'everyday',
      allergenTags: [],
      baseServingLabel: 'حصة',
      ingredients: [{ foodId: cheese, quantityGrams: 60, portionId: breadLoaf, portionQuantity: 1 }],
    });

    expect(created).toBeNull();
  });

  test('an edit is refused on the same grounds as a create', async () => {
    const mine = await setUpClinic(alpha, {
      nameAr: 'جميد بلدي',
      nameEn: 'Homemade jameed',
      alias: 'جميد',
      portionAr: 'كوب',
      portionEn: 'Cup',
    });
    const theirs = await setUpClinic(beta, {
      nameAr: 'لبنة بيتية',
      nameEn: 'Homemade labneh',
      alias: 'لبنة',
      portionAr: 'علبة',
      portionEn: 'Container',
    });

    const updated = await updateClinicDish(alpha, mine.dishId, {
      nameAr: 'طبق معدل',
      nameEn: 'Edited dish',
      mealTypes: ['lunch'],
      source: 'home',
      effort: 'medium',
      cost: 'normal',
      occasion: 'everyday',
      allergenTags: [],
      baseServingLabel: 'حصة',
      ingredients: [{ foodId: theirs.foodId, quantityGrams: 100 }],
    });

    expect(updated).toBe(false);

    // And the recipe it tried to overwrite is untouched.
    const dish = await getClinicDishForEdit(alpha, mine.dishId);
    expect(dish!.ingredients[0]!.food.id).toBe(mine.foodId);
  });

  test('an alias cannot be attached to another clinic’s food, or to a shared one', async () => {
    const theirs = await setUpClinic(beta, {
      nameAr: 'لبنة بيتية',
      nameEn: 'Homemade labneh',
      alias: 'لبنة',
      portionAr: 'علبة',
      portionEn: 'Container',
    });
    const shared = await createTestCatalogFood({ nameAr: 'أرز أبيض', nameEn: 'White rice' });

    await rememberFoodAlias(alpha, theirs.foodId, 'اسم مسروق');
    await rememberFoodAlias(alpha, shared, 'اسم خاص');

    expect(await searchFoods(alpha, 'اسم مسروق')).toEqual([]);
    // One clinic's vocabulary must not become every clinic's.
    expect(await searchFoods(beta, 'اسم خاص')).toEqual([]);
  });
});

describe('a shared-catalog re-seed', () => {
  test('leaves both clinics’ foods, portions, aliases and dishes exactly as they were', async () => {
    const a = await setUpClinic(alpha, {
      nameAr: 'جميد بلدي',
      nameEn: 'Homemade jameed',
      alias: 'جميد',
      portionAr: 'كوب',
      portionEn: 'Cup',
    });
    const b = await setUpClinic(beta, {
      nameAr: 'لبنة بيتية',
      nameEn: 'Homemade labneh',
      alias: 'لبنة',
      portionAr: 'علبة',
      portionEn: 'Container',
    });

    const before = await db
      .select()
      .from(catalogFoods)
      .where(eq(catalogFoods.clinicId, alpha));
    const beforeTotals = dishTotals((await getClinicDishForEdit(alpha, a.dishId))!.ingredients, 1);

    const report = await seedCatalogFoods({ apply: true });
    expect(report.clinicFoodsUntouched).toBe(2);

    const after = await db.select().from(catalogFoods).where(eq(catalogFoods.clinicId, alpha));

    // Ownership, status and nutrition all preserved — migration is not promotion.
    expect(after).toEqual(before);
    expect(after[0]!.verificationStatus).not.toBe('verified');
    expect(after[0]!.clinicId).toBe(alpha);

    // The dish still resolves to the same food, at the same weight, with the same
    // numbers, and the isolation still holds.
    const dish = await getClinicDishForEdit(alpha, a.dishId);
    expect(dish!.ingredients[0]!.food.id).toBe(a.foodId);
    expect(dish!.ingredients[0]!.quantityGrams).toBe(240);
    expect(dish!.ingredients[0]!.portionId).toBe(a.portionId);
    expect(dishTotals(dish!.ingredients, 1)).toEqual(beforeTotals);

    expect(await searchFoodsById(alpha, b.foodId)).toEqual([]);

    // The shared catalog did arrive, and is visible to both.
    const [rice] = await db
      .select({ id: catalogFoods.id })
      .from(catalogFoods)
      .where(and(eq(catalogFoods.slug, 'rice-white-dry'), isNull(catalogFoods.clinicId)));
    expect((await searchFoodsById(alpha, rice!.id)).map((food) => food.id)).toEqual([rice!.id]);
    expect((await searchFoodsById(beta, rice!.id)).map((food) => food.id)).toEqual([rice!.id]);
  });
});

describe('nutrition through the portion path', () => {
  /**
   * The invariant the whole portion model rests on: the stored grams are what a
   * total is built from. Entering "2 × كوب (120 g)" writes 240 g, and the totals
   * are the totals for 240 g — not for 2 of anything.
   */
  test('is computed from the stored grams, never from the portion', async () => {
    const { dishId } = await setUpClinic(alpha, {
      nameAr: 'جميد بلدي',
      nameEn: 'Homemade jameed',
      alias: 'جميد',
      portionAr: 'كوب',
      portionEn: 'Cup',
    });

    const dish = await getClinicDishForEdit(alpha, dishId);
    const totals = dishTotals(dish!.ingredients, 1);

    // 240 g of a 250 kcal / 100 g food.
    expect(totals.kcal.value).toBeCloseTo(600, 6);
    expect(totals.protein.value).toBeCloseTo(43.2, 6);
  });

  test('a portion whose weight is later corrected does not move a saved recipe', async () => {
    const { dishId, portionId } = await setUpClinic(alpha, {
      nameAr: 'جميد بلدي',
      nameEn: 'Homemade jameed',
      alias: 'جميد',
      portionAr: 'كوب',
      portionEn: 'Cup',
    });

    const before = dishTotals((await getClinicDishForEdit(alpha, dishId))!.ingredients, 1);

    await db
      .update(catalogFoodPortions)
      .set({ grams: 200 })
      .where(eq(catalogFoodPortions.id, portionId));

    const dish = await getClinicDishForEdit(alpha, dishId);

    expect(dish!.ingredients[0]!.quantityGrams).toBe(240);
    expect(dishTotals(dish!.ingredients, 1)).toEqual(before);
  });

  test('a retired portion leaves the grams intact and falls back to showing them', async () => {
    const { dishId, portionId } = await setUpClinic(alpha, {
      nameAr: 'جميد بلدي',
      nameEn: 'Homemade jameed',
      alias: 'جميد',
      portionAr: 'كوب',
      portionEn: 'Cup',
    });

    await db.delete(catalogFoodPortions).where(eq(catalogFoodPortions.id, portionId));

    const [row] = await db
      .select({ quantityGrams: dishIngredients.quantityGrams, portionId: dishIngredients.portionId })
      .from(dishIngredients)
      .innerJoin(dishes, eq(dishes.id, dishIngredients.dishId))
      .where(eq(dishes.id, dishId));

    // `on delete set null`: the unit is lost, the weight is not.
    expect(row!.quantityGrams).toBe(240);
    expect(row!.portionId).toBeNull();
  });
});

describe('aliases', () => {
  test('find a food but are never what it is called', async () => {
    const foodId = await createTestCatalogFood({
      clinicId: alpha,
      nameAr: 'بندورة',
      nameEn: 'Tomato, raw',
    });
    await createTestCatalogAlias(foodId, 'طماطم');

    const [found] = await searchFoods(alpha, 'طماطم');

    expect(found!.id).toBe(foodId);
    // The row comes back under its canonical name, not under the word searched for.
    expect(found!.nameAr).toBe('بندورة');
    expect(found!.nameEn).toBe('Tomato, raw');
  });
});
