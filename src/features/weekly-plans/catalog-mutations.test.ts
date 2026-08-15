import { beforeEach, describe, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { clinicHiddenDishes, dishes, dishIngredients, foodAliases, foods, weeklyPlanMeals, weeklyPlans } from '@/db/schema';
import { createTestClient, createTestClinic, resetDatabase } from '../../../tests/helpers';

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
  const [food] = await db
    .insert(foods)
    .values({ description: 'Chicken breast', category: 'Poultry', kcal: 165, protein: 31, carbs: 0, fat: 3.6 })
    .returning({ id: foods.id });
  foodId = food!.id;
});

const dishInput = (): ClinicDishInput => ({
  nameAr: 'دجاج',
  nameEn: 'Chicken',
  mealTypes: ['lunch'],
  tags: [],
  allergenTags: [],
  baseServingLabel: 'حصة',
  ingredients: [{ foodId, quantityGrams: 200, displayNameAr: 'دجاج', householdLabel: undefined, householdGrams: undefined }],
});

describe('createClinicDish', () => {
  test('creates a clinic-owned dish with its ingredients', async () => {
    const dishId = await createClinicDish(clinicId, dishInput());
    expect(dishId).toBeString();

    const [dish] = await db.select().from(dishes).where(eq(dishes.id, dishId!));
    expect(dish!.clinicId).toBe(clinicId);

    const rows = await db.select().from(dishIngredients).where(eq(dishIngredients.dishId, dishId!));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.displayNameAr).toBe('دجاج');
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
      .values({ slug: 's', nameAr: 's', nameEn: 's', mealTypes: ['lunch'], tags: [], allergenTags: [], baseServingLabel: 'x' })
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
      .values({ slug: 's', nameAr: 's', nameEn: 's', mealTypes: ['lunch'], tags: [], allergenTags: [], baseServingLabel: 'x' })
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
  test('stores a clinic-owned food with null fdc_id and an Arabic alias', async () => {
    const id = await createCustomFood(clinicId, {
      description: 'Village white cheese',
      nameAr: 'جبنة بلدية',
      kcal: 260,
      protein: 18,
      carbs: 2,
      fat: 20,
    });
    expect(id).toBeString();
    const [food] = await db.select().from(foods).where(eq(foods.id, id!));
    expect(food!.clinicId).toBe(clinicId);
    expect(food!.fdcId).toBeNull();
    // The Arabic name it was created under is remembered as an alias.
    const aliases = await db.select().from(foodAliases).where(eq(foodAliases.foodId, id!));
    expect(aliases).toHaveLength(1);
    expect(aliases[0]!.nameAr).toBe('جبنة بلدية');
  });
});

describe('rememberFoodAlias', () => {
  test('is idempotent on (clinic, name)', async () => {
    await rememberFoodAlias(clinicId, foodId, 'دجاج');
    await rememberFoodAlias(clinicId, foodId, 'دجاج');
    expect(await db.select().from(foodAliases).where(eq(foodAliases.clinicId, clinicId))).toHaveLength(1);
  });
});
