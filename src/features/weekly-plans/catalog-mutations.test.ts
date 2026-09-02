import { beforeEach, describe, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { catalogFoodAliases, catalogFoodPortions, catalogFoods, clinicHiddenDishes, dishes, dishIngredients, weeklyPlanMeals, weeklyPlans } from '@/db/schema';
import {
  createTestClient,
  createTestCatalogFood,
  createTestCatalogPortion,
  createTestClinic,
  resetDatabase,
} from '../../../tests/helpers';

import {
  createClinicDish,
  createCustomFood,
  deleteClinicDish,
  hideSharedDish,
  rememberFoodAlias,
  unhideSharedDish,
  updateClinicDish,
} from './catalog-mutations';
import type { ClinicDishInput } from './catalog-schema';

let clinicId: string;
let foodId: string;

beforeEach(async () => {
  await resetDatabase();
  clinicId = await createTestClinic();
  foodId = await createTestCatalogFood({
    slug: 'chicken-breast-raw',
    nameAr: 'صدر دجاج ني',
    nameEn: 'Chicken breast, skinless, raw',
    category: 'poultry',
    kcal: 165,
    protein: 31,
    carbs: 0,
    fat: 3.6,
  });
});

const dishInput = (): ClinicDishInput => ({
  nameAr: 'دجاج',
  nameEn: 'Chicken',
  mealTypes: ['lunch'],
  source: 'home',
  effort: 'medium',
  cost: 'normal',
  occasion: 'everyday',
  allergenTags: [],
  baseServingLabel: 'حصة',
  ingredients: [{ foodId, quantityGrams: 200 }],
});

describe('createClinicDish', () => {
  test('creates a clinic-owned dish with its ingredients', async () => {
    const dishId = await createClinicDish(clinicId, dishInput());
    expect(dishId).toBeString();

    const [dish] = await db.select().from(dishes).where(eq(dishes.id, dishId!));
    expect(dish!.clinicId).toBe(clinicId);

    const rows = await db.select().from(dishIngredients).where(eq(dishIngredients.dishId, dishId!));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.catalogFoodId).toBe(foodId);
    // Entered in grams, so nothing records a unit.
    expect(rows[0]!.portionId).toBeNull();
    expect(rows[0]!.portionQuantity).toBeNull();
  });
});

describe('updateClinicDish', () => {
  test('replaces the ingredients of an owned dish', async () => {
    const dishId = await createClinicDish(clinicId, dishInput());
    const ok = await updateClinicDish(clinicId, dishId!, {
      ...dishInput(),
      nameEn: 'Chicken plate',
      ingredients: [{ foodId, quantityGrams: 150 }],
    });
    expect(ok).toBe(true);
    const [dish] = await db.select().from(dishes).where(eq(dishes.id, dishId!));
    expect(dish!.nameEn).toBe('Chicken plate');
    const rows = await db.select().from(dishIngredients).where(eq(dishIngredients.dishId, dishId!));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.quantityGrams).toBe(150);
  });

  test('refuses to edit another clinic dish', async () => {
    const other = await createTestClinic();
    const dishId = await createClinicDish(other, dishInput());
    expect(await updateClinicDish(clinicId, dishId!, dishInput())).toBe(false);
  });
});

describe('deleteClinicDish', () => {
  test('deletes an owned dish but not a shared one', async () => {
    const dishId = await createClinicDish(clinicId, dishInput());
    expect(await deleteClinicDish(clinicId, dishId!)).toBe('deleted');

    const [shared] = await db
      .insert(dishes)
      .values({ slug: 's', nameAr: 's', nameEn: 's', mealTypes: ['lunch'], allergenTags: [], baseServingLabel: 'x' })
      .returning({ id: dishes.id });
    expect(await deleteClinicDish(clinicId, shared!.id)).toBe('not_found');
  });

  test('refuses to delete a dish that a saved plan still uses', async () => {
    const clientId = await createTestClient(clinicId, 'Plan Client');
    const dishId = await createClinicDish(clinicId, dishInput());

    const [plan] = await db
      .insert(weeklyPlans)
      .values({ clinicId, clientId, weekStartDate: '2026-08-16', status: 'draft', kcalTargetSnapshot: 1800 })
      .returning({ id: weeklyPlans.id });
    await db.insert(weeklyPlanMeals).values({
      planId: plan!.id,
      dayOfWeek: 0,
      slotKey: 'lunch',
      label: 'غداء',
      timeOfDay: '14:00',
      budgetKcal: 600,
      sortOrder: 0,
      dishId: dishId!,
      servings: 1,
    });

    expect(await deleteClinicDish(clinicId, dishId!)).toBe('in_use');
    // The dish is still there.
    expect(await db.select().from(dishes).where(eq(dishes.id, dishId!))).toHaveLength(1);
  });
});

describe('hide / unhide shared dishes', () => {
  test('hides a shared dish for this clinic and un-hides it', async () => {
    const [shared] = await db
      .insert(dishes)
      .values({ slug: 's', nameAr: 's', nameEn: 's', mealTypes: ['lunch'], allergenTags: [], baseServingLabel: 'x' })
      .returning({ id: dishes.id });

    expect(await hideSharedDish(clinicId, shared!.id)).toBe(true);
    expect(
      await db.select().from(clinicHiddenDishes).where(and(eq(clinicHiddenDishes.clinicId, clinicId), eq(clinicHiddenDishes.dishId, shared!.id))),
    ).toHaveLength(1);

    // Hiding twice is idempotent.
    expect(await hideSharedDish(clinicId, shared!.id)).toBe(true);
    expect(await db.select().from(clinicHiddenDishes)).toHaveLength(1);

    expect(await unhideSharedDish(clinicId, shared!.id)).toBe(true);
    expect(await db.select().from(clinicHiddenDishes)).toHaveLength(0);
  });

  test('refuses to hide a clinic-owned dish (own dishes are deleted, not hidden)', async () => {
    const dishId = await createClinicDish(clinicId, dishInput());
    expect(await hideSharedDish(clinicId, dishId!)).toBe(false);
  });
});

describe('createCustomFood', () => {
  test('stores a clinic-scoped catalog food with an Arabic alias', async () => {
    const id = await createCustomFood(clinicId, {
      description: 'Village white cheese',
      nameAr: 'جبنة بلدية',
      kcal: 260,
      protein: 18,
      carbs: 2,
      fat: 20,
    });

    expect(id).toBeString();

    const [food] = await db.select().from(catalogFoods).where(eq(catalogFoods.id, id!));
    expect(food!.clinicId).toBe(clinicId);
    expect(food!.nameAr).toBe('جبنة بلدية');
    expect(food!.nameEn).toBe('Village white cheese');
    // Entered by hand, so it claims neither a source nor verification.
    expect(food!.sourceType).toBe('clinic_entered');
    expect(food!.sourceRef).toBeNull();
    expect(food!.verificationStatus).toBe('provisional');

    // The Arabic name it was created under is remembered as an alias.
    const aliases = await db
      .select()
      .from(catalogFoodAliases)
      .where(eq(catalogFoodAliases.foodId, id!));
    expect(aliases).toHaveLength(1);
    expect(aliases[0]!.name).toBe('جبنة بلدية');
  });
});

describe('rememberFoodAlias', () => {
  test('is idempotent on (food, normalized name)', async () => {
    const ownId = await createCustomFood(clinicId, {
      description: 'Village white cheese',
      nameAr: 'جبنة بلدية',
      kcal: 260,
      protein: 18,
      carbs: 2,
      fat: 20,
    });

    await rememberFoodAlias(clinicId, ownId!, 'جبنه بلديه');
    await rememberFoodAlias(clinicId, ownId!, 'جبنه بلديه');

    const aliases = await db
      .select()
      .from(catalogFoodAliases)
      .where(eq(catalogFoodAliases.foodId, ownId!));
    // The creation alias plus the one remembered once, not twice.
    expect(aliases).toHaveLength(2);
  });

  test('refuses to add a synonym to a shared catalog food', async () => {
    // `foodId` is the shared fixture food. One clinic's vocabulary must not
    // become every clinic's.
    await rememberFoodAlias(clinicId, foodId, 'جاج');

    const aliases = await db
      .select()
      .from(catalogFoodAliases)
      .where(eq(catalogFoodAliases.foodId, foodId));
    expect(aliases).toHaveLength(0);
  });
});

/**
 * The grams a recipe is saved with, when the line names a portion.
 *
 * The browser computes `quantity × gramsPerUnit` for the live preview and submits
 * the result alongside the portion it used. Trusting that number is how a request
 * saying "1 cup" could store 50 grams of a 200 g cup: every reader would see
 * "1 كوب", every calorie would be a quarter of it, and nothing anywhere would
 * disagree with anything else. So the server derives the grams and throws the
 * submitted ones away.
 */
describe('portion-to-grams consistency', () => {
  let riceId: string;
  let cupId: string;

  beforeEach(async () => {
    riceId = await createTestCatalogFood({
      slug: 'rice-white-cooked',
      nameAr: 'أرز أبيض مطبوخ',
      nameEn: 'White rice, cooked',
      state: 'cooked',
      category: 'grains',
      kcal: 130,
      protein: 2.7,
      carbs: 28,
      fat: 0.3,
    });
    cupId = await createTestCatalogPortion(riceId, {
      labelAr: 'كوب',
      labelEn: 'Cup',
      grams: 200,
      isDefault: true,
    });
  });

  const withPortion = (overrides: Partial<ClinicDishInput['ingredients'][number]>): ClinicDishInput => ({
    ...dishInput(),
    ingredients: [
      { foodId: riceId, quantityGrams: 200, portionId: cupId, portionQuantity: 1, ...overrides },
    ],
  });

  async function savedRow(dishId: string) {
    const rows = await db.select().from(dishIngredients).where(eq(dishIngredients.dishId, dishId));
    return rows[0]!;
  }

  test('the grams come from the portion, not from the request', async () => {
    // The forgery: one cup of a 200 g cup, declared as 50 g.
    const dishId = await createClinicDish(clinicId, withPortion({ quantityGrams: 50 }));

    const row = await savedRow(dishId!);
    expect(row.quantityGrams).toBe(200);
    expect(row.portionId).toBe(cupId);
    // And the count is preserved exactly as typed, not reconstructed by division.
    expect(row.portionQuantity).toBe(1);
  });

  test('an inflated grams value is discarded the same way', async () => {
    const dishId = await createClinicDish(clinicId, withPortion({ quantityGrams: 5000 }));

    expect((await savedRow(dishId!)).quantityGrams).toBe(200);
  });

  test('a fractional portion count derives its own weight', async () => {
    const dishId = await createClinicDish(clinicId, withPortion({ portionQuantity: 0.5, quantityGrams: 999 }));

    const row = await savedRow(dishId!);
    expect(row.quantityGrams).toBe(100);
    expect(row.portionQuantity).toBe(0.5);
  });

  test('a grams-only line keeps the grams it submitted', async () => {
    // Nothing to derive from, and nothing was claimed twice: the submitted number
    // is the only figure the request stated.
    const dishId = await createClinicDish(clinicId, {
      ...dishInput(),
      ingredients: [{ foodId: riceId, quantityGrams: 175 }],
    });

    const row = await savedRow(dishId!);
    expect(row.quantityGrams).toBe(175);
    expect(row.portionId).toBeNull();
  });

  test('an update is derived too, not only a create', async () => {
    const dishId = await createClinicDish(clinicId, withPortion({}));

    const ok = await updateClinicDish(clinicId, dishId!, withPortion({ portionQuantity: 2, quantityGrams: 1 }));

    expect(ok).toBe(true);
    expect((await savedRow(dishId!)).quantityGrams).toBe(400);
  });

  test('a portion belonging to another food is refused, not silently ignored', async () => {
    // `foodId` is the chicken from the outer fixture; `cupId` is rice's cup.
    const result = await createClinicDish(clinicId, {
      ...dishInput(),
      ingredients: [{ foodId, quantityGrams: 200, portionId: cupId, portionQuantity: 1 }],
    });

    expect(result).toBeNull();
    expect(await db.select().from(dishIngredients)).toHaveLength(0);
  });

  test('a portion belonging to another clinic is refused', async () => {
    const otherClinicId = await createTestClinic();
    const theirFoodId = await createTestCatalogFood({
      slug: 'their-bread',
      nameAr: 'خبزهم',
      nameEn: 'Their bread',
      clinicId: otherClinicId,
      category: 'grains',
    });
    const theirPortionId = await createTestCatalogPortion(theirFoodId, {
      labelAr: 'رغيف',
      labelEn: 'Loaf',
      grams: 60,
    });

    const result = await createClinicDish(clinicId, {
      ...dishInput(),
      ingredients: [
        { foodId: riceId, quantityGrams: 200, portionId: theirPortionId, portionQuantity: 1 },
      ],
    });

    expect(result).toBeNull();
  });

  test('a stale portion id — one deleted since the form was opened — is refused', async () => {
    const staleId = await createTestCatalogPortion(riceId, {
      labelAr: 'نصف كوب',
      labelEn: 'Half cup',
      grams: 100,
    });
    await db.delete(catalogFoodPortions).where(eq(catalogFoodPortions.id, staleId));

    const result = await createClinicDish(clinicId, {
      ...dishInput(),
      ingredients: [{ foodId: riceId, quantityGrams: 100, portionId: staleId, portionQuantity: 1 }],
    });

    // Refused rather than quietly downgraded to grams: the dietitian asked for a
    // unit that no longer exists, and saving something else under their name is
    // worse than saying no.
    expect(result).toBeNull();
  });

  test('a refused line leaves an existing dish untouched', async () => {
    const dishId = await createClinicDish(clinicId, withPortion({}));

    const ok = await updateClinicDish(clinicId, dishId!, {
      ...dishInput(),
      // A well-formed uuid naming nothing — what the schema lets through, and so
      // what the mutation has to catch.
      ingredients: [
        { foodId: riceId, quantityGrams: 100, portionId: crypto.randomUUID(), portionQuantity: 1 },
      ],
    });

    expect(ok).toBe(false);
    expect((await savedRow(dishId!)).quantityGrams).toBe(200);
  });
});
