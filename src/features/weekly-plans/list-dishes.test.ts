import { beforeEach, describe, expect, test } from 'bun:test';

import { db } from '@/db';
import { clinicHiddenDishes, dishes } from '@/db/schema';
import { createTestClinic, resetDatabase } from '../../../tests/helpers';

import { listDishes } from './queries';

/**
 * The catalog page's read. Two things it must get right: it shows exactly the
 * dishes a clinic may see (shared-not-hidden + its own), with a count and
 * pagination that agree with that set; and its search is Arabic-natural, the
 * same normalization the ingredient search uses.
 */

let clinicId: string;

beforeEach(async () => {
  await resetDatabase();
  clinicId = await createTestClinic();
});

function seedDish(values: {
  clinicId?: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  mealTypes?: string[];
}) {
  return db
    .insert(dishes)
    .values({
      clinicId: values.clinicId,
      slug: values.slug,
      nameAr: values.nameAr,
      nameEn: values.nameEn,
      mealTypes: values.mealTypes ?? ['lunch'],
      tags: [],
      allergenTags: [],
      baseServingLabel: 'حصة',
    })
    .returning({ id: dishes.id });
}

describe('listDishes visibility and counts', () => {
  test('counts and shows only this clinic visible catalog — not other clinics or hidden dishes', async () => {
    const other = await createTestClinic();

    await seedDish({ slug: 'shared', nameAr: 'مشترك', nameEn: 'Shared' });
    const [hidden] = await seedDish({ slug: 'shared-hidden', nameAr: 'مخفي', nameEn: 'Hidden' });
    await seedDish({ clinicId, slug: 'own', nameAr: 'خاص', nameEn: 'Own' });
    await seedDish({ clinicId: other, slug: 'other', nameAr: 'اخرى', nameEn: 'Other' });
    await db.insert(clinicHiddenDishes).values({ clinicId, dishId: hidden!.id });

    const result = await listDishes({ clinicId, page: 1 });

    const slugs = result.items.map((d) => d.slug).sort();
    expect(slugs).toEqual(['own', 'shared']);
    // The count agrees with what is shown — not inflated by the other clinic's
    // dish or by the hidden one.
    expect(result.total).toBe(2);
    expect(result.pageCount).toBe(1);
  });
});

describe('listDishes Arabic-natural search', () => {
  test('a bare-alef query matches a dish stored with hamza', async () => {
    await seedDish({ clinicId, slug: 'rice-pudding', nameAr: 'أرز بالحليب', nameEn: 'Rice pudding' });
    await seedDish({ clinicId, slug: 'lentils', nameAr: 'عدس', nameEn: 'Lentils' });

    const result = await listDishes({ clinicId, q: 'ارز بالحليب', page: 1 });

    expect(result.items.map((d) => d.slug)).toEqual(['rice-pudding']);
    expect(result.total).toBe(1);
  });

  test('search still matches the English name and the slug', async () => {
    await seedDish({ clinicId, slug: 'grilled-chicken', nameAr: 'دجاج مشوي', nameEn: 'Grilled chicken' });

    expect((await listDishes({ clinicId, q: 'grilled', page: 1 })).total).toBe(1);
    expect((await listDishes({ clinicId, q: 'grilled-chicken', page: 1 })).total).toBe(1);
  });
});
