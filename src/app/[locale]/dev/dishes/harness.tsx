'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { normalizeArabic } from '@/features/weekly-plans/arabic-normalize';
import { matchesOwner, type OwnerFilter } from '@/features/weekly-plans/catalog-ownership';
import { DishEditorDialog } from '@/features/weekly-plans/components/dish-editor-dialog';
import { DishList, type DishCardData } from '@/features/weekly-plans/components/dish-list';
import { IngredientSearch } from '@/features/weekly-plans/components/food-picker';
import { refineIngredientResults, type RefinedFood } from '@/features/weekly-plans/ingredient-refine';
import { getFoodDisplayName } from '@/features/weekly-plans/food-display';
import type { FoodSearchResult } from '@/features/weekly-plans/queries';

/** A raw search fixture plus the Arabic terms a query must contain to surface it. */
type Fixture = FoodSearchResult & { tags: string[] };

function row(
  id: string,
  description: string,
  tags: string[],
  extra: Partial<FoodSearchResult>,
): Fixture {
  return {
    id,
    description,
    nameAr: null,
    category: 'Legumes and Legume Products',
    portionGrams: null,
    portionLabel: null,
    kcal: 100,
    protein: 5,
    fat: 1,
    carbs: 18,
    fiber: null,
    sugar: null,
    saturatedFat: null,
    cholesterol: null,
    sodium: null,
    calcium: null,
    iron: null,
    potassium: null,
    tags,
    ...extra,
  };
}

/**
 * Real SR Legacy-shaped rows for the queries the spec names, so the mock search
 * exercises the genuine refine (Arabic-first, dedup, ranking) rather than a
 * hand-faked result list.
 */
const FIXTURES: Fixture[] = [
  row('l1', 'Lentils, mature seeds, cooked, boiled, without salt', ['عدس'], {
    portionGrams: 198,
    portionLabel: '1 cup',
    kcal: 116,
  }),
  row('l2', 'Lentils, mature seeds, cooked, boiled, with salt', ['عدس'], {
    portionGrams: 198,
    portionLabel: '1 cup',
    kcal: 116,
  }),
  row('l3', 'Lentils, raw', ['عدس'], { portionGrams: 192, portionLabel: '1 cup', kcal: 352 }),
  row('l4', 'Lentils, pink or red, raw', ['عدس', 'عدس احمر'], {
    portionGrams: 192,
    portionLabel: '1 cup',
    kcal: 358,
  }),
  row('l5', 'Lentils, sprouted, raw', ['عدس'], { portionGrams: 77, portionLabel: '1 cup', kcal: 106 }),
  row('c1', 'Homemade jameed', ['جميد'], {
    nameAr: 'جميد بلدي',
    category: 'Clinic custom',
    kcal: 120,
  }),
  row('b1', 'Bread, pita, white, enriched', ['خبز', 'خبز عربي'], {
    category: 'Baked Products',
    portionGrams: 60,
    portionLabel: '1 pita, large (6-1/2" dia)',
    kcal: 275,
    protein: 9,
    carbs: 56,
  }),
  row('b2', 'Bread, pita, whole-wheat', ['خبز', 'خبز عربي'], {
    category: 'Baked Products',
    portionGrams: 64,
    portionLabel: '1 pita, large (6-1/2" dia)',
    kcal: 262,
  }),
  row('r1', 'Rice, white, long-grain, regular, enriched, cooked', ['ارز', 'رز'], {
    category: 'Cereal Grains and Pasta',
    portionGrams: 158,
    portionLabel: '1 cup',
    kcal: 130,
  }),
  row('r2', 'Rice, brown, long-grain, cooked', ['ارز', 'رز'], {
    category: 'Cereal Grains and Pasta',
    portionGrams: 195,
    portionLabel: '1 cup',
    kcal: 123,
  }),
  row('o1', 'Oil, olive, salad or cooking', ['زيت', 'زيت زيتون'], {
    category: 'Fats and Oils',
    portionGrams: 13.5,
    portionLabel: '1 tablespoon',
    kcal: 884,
    fat: 100,
    carbs: 0,
  }),
  row('e1', 'Egg, whole, raw, fresh', ['بيض'], {
    category: 'Dairy and Egg Products',
    portionGrams: 50,
    portionLabel: '1 large',
    kcal: 143,
    protein: 13,
  }),
  row('k1', 'Crackers, flavored', ['كراكر', 'بسكويت'], {
    category: 'Baked Products',
    portionGrams: 30,
    portionLabel: '1 serving',
    kcal: 490,
  }),
];

/** A stand-in for `searchIngredientsAction` — real refine over the fixtures. */
async function mockSearch(_locale: string, query: string): Promise<RefinedFood[]> {
  const needle = normalizeArabic(query);
  const matched = FIXTURES.filter((fixture) =>
    fixture.tags.some((tag) => {
      const t = normalizeArabic(tag);
      return t.includes(needle) || needle.includes(t);
    }),
  ).map(({ tags: _tags, ...food }) => food);
  // A tiny latency so the loading indicator is observable.
  await new Promise((resolve) => setTimeout(resolve, 120));
  return refineIngredientResults(matched, query);
}

/** Mock catalog rows — a mix of shared and clinic-owned dishes, one hidden. */
const MOCK_DISHES: (DishCardData & { clinicId: string | null })[] = [
  { id: 'd1', nameAr: 'مقلوبة دجاج', nameEn: 'Chicken Maqluba', mealTypes: ['lunch'], tags: ['local', 'filling'], kcal: 610, protein: 38, isSystem: true, hidden: false, clinicId: null },
  { id: 'd2', nameAr: 'مجدرة', nameEn: 'Mujaddara', mealTypes: ['lunch', 'dinner'], tags: ['economical', 'vegetarian'], kcal: 430, protein: 17, isSystem: true, hidden: false, clinicId: null },
  { id: 'd3', nameAr: 'سلطة دجاج', nameEn: 'Chicken salad', mealTypes: ['lunch'], tags: ['quick', 'filling'], kcal: 390, protein: 42, isSystem: false, hidden: false, clinicId: 'clinic-1' },
  { id: 'd4', nameAr: 'شوربة عدس', nameEn: 'Lentil soup', mealTypes: ['dinner'], tags: ['economical', 'no_cook'], kcal: 210, protein: 12, isSystem: false, hidden: false, clinicId: 'clinic-1' },
  { id: 'd5', nameAr: 'بيض مقلي', nameEn: 'Fried eggs', mealTypes: ['breakfast'], tags: ['quick'], kcal: 180, protein: 13, isSystem: true, hidden: false, clinicId: null },
];

/**
 * A self-contained catalog demo — the same `DishList` and ownership predicate the
 * real page uses, filtering a mock list client-side so the compact rows, quiet
 * ownership labels, and the ownership filter can be seen without a database.
 */
function CatalogDemo({ locale }: { locale: string }) {
  const [owner, setOwner] = useState<'all' | OwnerFilter>('all');
  const [q, setQ] = useState('');

  const needle = normalizeArabic(q);
  const items = MOCK_DISHES.filter((dish) => {
    if (!matchesOwner(dish.clinicId, owner === 'all' ? undefined : owner)) return false;
    if (needle && !normalizeArabic(dish.nameAr).includes(needle)) return false;
    return true;
  });

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-label font-semibold">Catalog list + ownership filter</h2>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          icon="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="ابحث باسم الطبق"
          className="min-w-56 flex-1"
        />
        <Segmented<'all' | OwnerFilter>
          role="radiogroup"
          size="sm"
          label="عرض الأطباق"
          options={[
            { value: 'all', label: 'الكل' },
            { value: 'system', label: 'مشتركة' },
            { value: 'clinic', label: 'أطباقي' },
          ]}
          value={owner}
          onChange={setOwner}
        />
      </div>
      <DishList locale={locale} items={items} filtered={owner !== 'all' || q.trim().length > 0} />
    </section>
  );
}

export function DishesHarness({ locale }: { locale: string }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<FoodSearchResult[]>([]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 p-6 text-start">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-heading-lg font-semibold">Dish editor harness (dev)</h1>
        <p className="text-body-sm text-muted-foreground">
          Mock search over real refine logic. Try عدس, خبز, أرز, زيت, بيض.
        </p>
      </header>

      <CatalogDemo locale={locale} />

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-label font-semibold">Ingredient search</h2>
        <IngredientSearch locale={locale} onPick={(food) => setPicked((prev) => [...prev, food])} search={mockSearch} />
        {picked.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 border-t border-border pt-2 text-body-sm">
            {picked.map((food, index) => (
              <li key={`${food.id}-${index}`} className="text-muted-foreground" dir="auto">
                picked: <span className="font-medium text-foreground">{getFoodDisplayName(food, locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-label font-semibold">Editor dialog</h2>
        <Button type="button" onClick={() => setOpen(true)}>
          Open dish editor
        </Button>
      </section>

      <DishEditorDialog
        locale={locale}
        open={open}
        onOpenChange={setOpen}
        onSaved={() => setOpen(false)}
        search={mockSearch}
      />
    </div>
  );
}
