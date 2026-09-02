import { beforeEach, describe, expect, test } from 'bun:test';

import { db } from '@/db';
import { clinicHiddenDishes, dishes } from '@/db/schema';
import { createTestCatalogFood, createTestClinic, resetDatabase } from '../../../tests/helpers';

import { createClinicDish } from './catalog-mutations';
import type { ClinicDishInput } from './catalog-schema';
import { getClinicDishForEdit, listDishes } from './queries';

/**
 * The reads the catalog-management UI needs: which dishes a clinic owns (so the
 * table can show Edit/Delete only on those), the full editable payload for one
 * of them (so the editor can preload), and the ability to surface hidden shared
 * dishes so they can be unhidden.
 */

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
  nameAr: 'دجاج مشوي',
  nameEn: 'Grilled chicken',
  mealTypes: ['lunch'],
  source: 'home',
  effort: 'medium',
  cost: 'normal',
  occasion: 'everyday',
  allergenTags: [],
  baseServingLabel: 'حصة',
  ingredients: [{ foodId, quantityGrams: 200 }],
});

function seedSharedDish(slug: string) {
  return db
    .insert(dishes)
    .values({
      slug,
      nameAr: slug,
      nameEn: slug,
      mealTypes: ['lunch'],
      source: 'home',
      effort: 'medium',
      cost: 'normal',
      occasion: 'everyday',
      allergenTags: [],
      baseServingLabel: 'serving',
    })
    .returning({ id: dishes.id });
}

describe('listDishes ownership', () => {
  test('marks the clinic own dishes with a clinicId and shared dishes with null', async () => {
    await seedSharedDish('shared-dish');
    await createClinicDish(clinicId, dishInput());

    const items = (await listDishes({ clinicId, page: 1 })).items;
    const bySlugClinicId = new Map(items.map((d) => [d.nameEn, d.clinicId]));

    expect(bySlugClinicId.get('shared-dish')).toBeNull();
    expect(bySlugClinicId.get('Grilled chicken')).toBe(clinicId);
  });
});

describe('listDishes hiddenOnly', () => {
  test('hidden shared dishes are excluded by default and are the whole list when asked for', async () => {
    const [shared] = await seedSharedDish('to-hide');
    await db.insert(clinicHiddenDishes).values({ clinicId, dishId: shared!.id });
    await createClinicDish(clinicId, dishInput());

    const def = await listDishes({ clinicId, page: 1 });
    expect(def.items.map((d) => d.id)).not.toContain(shared!.id);
    // The normal catalog is never flagged hidden.
    expect(def.items.every((d) => d.hidden === false)).toBe(true);

    const onlyHidden = await listDishes({ clinicId, page: 1, hiddenOnly: true });
    expect(onlyHidden.items.map((d) => d.id)).toEqual([shared!.id]);
    expect(onlyHidden.items[0]!.hidden).toBe(true);
    // `hiddenOnly` is a different view, not a wider one: the visible catalog is
    // absent from it entirely.
    expect(onlyHidden.items.map((d) => d.nameEn)).not.toContain('Grilled chicken');
  });

  test('the other filters still narrow the hidden view', async () => {
    const [a] = await seedSharedDish('hidden-lunch');
    const [b] = await seedSharedDish('hidden-other');
    await db
      .insert(clinicHiddenDishes)
      .values([{ clinicId, dishId: a!.id }, { clinicId, dishId: b!.id }]);

    const searched = await listDishes({ clinicId, page: 1, hiddenOnly: true, q: 'hidden-lunch' });
    expect(searched.items.map((d) => d.id)).toEqual([a!.id]);
  });
});

describe('getClinicDishForEdit', () => {
  test('returns the full editable payload for a clinic-owned dish', async () => {
    const dishId = await createClinicDish(clinicId, dishInput());

    const data = await getClinicDishForEdit(clinicId, dishId!);
    expect(data).not.toBeNull();
    expect(data!.nameAr).toBe('دجاج مشوي');
    expect(data!.nameEn).toBe('Grilled chicken');
    expect(data!.mealTypes).toEqual(['lunch']);
    expect(data!.source).toBe('home');
    expect(data!.effort).toBe('medium');
    expect(data!.ingredients).toHaveLength(1);
    const ingredient = data!.ingredients[0]!;
    expect(ingredient.quantityGrams).toBe(200);
    expect(ingredient.portionId).toBeNull();
    expect(ingredient.food.id).toBe(foodId);
    // The food carries what the picker needs to render it back.
    expect(ingredient.food.kcal).toBe(165);
  });

  test('refuses a shared dish and another clinic dish (edit is owner-only)', async () => {
    const [shared] = await seedSharedDish('shared');
    expect(await getClinicDishForEdit(clinicId, shared!.id)).toBeNull();

    const other = await createTestClinic();
    const otherDishId = await createClinicDish(other, dishInput());
    expect(await getClinicDishForEdit(clinicId, otherDishId!)).toBeNull();
  });
});
