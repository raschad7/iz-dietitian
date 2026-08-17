'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { normalizeArabic } from '@/features/weekly-plans/arabic-normalize';
import { matchesOwner, parseOwnerFilter } from '@/features/weekly-plans/catalog-ownership';
import { AddDishButton } from '@/features/weekly-plans/components/add-dish-button';
import { DishEditorDialog } from '@/features/weekly-plans/components/dish-editor-dialog';
import { DishFilters } from '@/features/weekly-plans/components/dish-filters';
import { DishList, type DishCardData } from '@/features/weekly-plans/components/dish-list';
import { DISH_TAGS } from '@/features/weekly-plans/schema';
import { membersOf } from '@/lib/enum';
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
  { id: 'd1', nameAr: 'مقلوبة دجاج', nameEn: 'Chicken Maqluba', mealTypes: ['lunch'], tags: ['local', 'filling'], kcal: 610, carbs: 68, protein: 38, highProtein: false, isSystem: true, hidden: false, clinicId: null },
  { id: 'd2', nameAr: 'مجدرة', nameEn: 'Mujaddara', mealTypes: ['lunch', 'dinner'], tags: ['economical', 'vegetarian'], kcal: 430, carbs: 64, protein: 17, highProtein: false, isSystem: true, hidden: false, clinicId: null },
  { id: 'd3', nameAr: 'سلطة دجاج', nameEn: 'Chicken salad', mealTypes: ['lunch'], tags: ['quick', 'filling'], kcal: 390, carbs: 12, protein: 42, highProtein: true, isSystem: false, hidden: false, clinicId: 'clinic-1' },
  { id: 'd4', nameAr: 'شوربة عدس', nameEn: 'Lentil soup', mealTypes: ['dinner'], tags: ['economical', 'no_cook'], kcal: 210, carbs: 30, protein: 12, highProtein: false, isSystem: false, hidden: false, clinicId: 'clinic-1' },
  { id: 'd5', nameAr: 'بيض مقلي', nameEn: 'Fried eggs', mealTypes: ['breakfast'], tags: ['quick'], kcal: 180, carbs: 2, protein: 13, highProtein: true, isSystem: true, hidden: false, clinicId: null },
];

/**
 * A self-contained catalog demo — the real `DishFilters` toolbar and the real
 * `DishList` table over a mock list, filtered client-side, so the whole screen
 * can be seen and driven without a database or a signed-in clinic.
 *
 * The toolbar is the real component rather than a stand-in on purpose: it is the
 * part of this screen whose behaviour is layout (does the row change height when
 * a filter goes on? does the popover reflow?), and a stand-in built from the same
 * primitives would answer for itself and not for the thing that ships. It reads
 * the same URL params the server page does, so the demo filters on exactly what
 * `listDishes` would.
 */
function CatalogDemo({ locale }: { locale: string }) {
  const searchParams = useSearchParams();

  const q = searchParams.get('q') ?? '';
  const mealType = searchParams.get('mealType') ?? undefined;
  const owner = parseOwnerFilter(searchParams.get('owner') ?? undefined);
  const highProtein = searchParams.get('hp') === '1';
  const tags = membersOf(DISH_TAGS, (searchParams.get('tags') ?? '').split(',').filter(Boolean));

  const needle = normalizeArabic(q);
  const items = MOCK_DISHES.filter((dish) => {
    if (!matchesOwner(dish.clinicId, owner)) return false;
    if (needle && !normalizeArabic(dish.nameAr).includes(needle)) return false;
    if (mealType && !dish.mealTypes.includes(mealType)) return false;
    if (tags.length && !tags.every((tag) => dish.tags.includes(tag))) return false;
    if (highProtein && !dish.highProtein) return false;
    return true;
  });

  const filtered =
    Boolean(q) || Boolean(mealType) || Boolean(owner) || highProtein || tags.length > 0;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-label font-semibold">Catalog toolbar + table</h2>
      <DishFilters
        q={q || undefined}
        mealType={mealType}
        tags={tags}
        highProtein={highProtein}
        owner={owner}
        showHidden={searchParams.get('hidden') === '1'}
      >
        <AddDishButton locale={locale} search={mockSearch} />
      </DishFilters>
      <DishList locale={locale} items={items} filtered={filtered} />
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
