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
import { localizedName } from '@/features/weekly-plans/food-display';
import type { FoodPortion } from '@/features/weekly-plans/ingredient-units';
import type { DishNameSuggestion, FoodSearchResult } from '@/features/weekly-plans/queries';

/** A catalog fixture plus the terms a query must contain to surface it. */
type Fixture = FoodSearchResult & { tags: string[] };

/** Builds a portion list the way `db:build-catalog` does — a measure and its fractions. */
function cup(id: string, grams: number): FoodPortion[] {
  return [
    { id: `${id}-cup`, labelAr: 'كوب', labelEn: 'Cup', grams, isDefault: true, sortOrder: 0 },
    { id: `${id}-half`, labelAr: 'نصف كوب', labelEn: 'Half cup', grams: grams / 2, isDefault: false, sortOrder: 1 },
  ];
}

function row(
  id: string,
  nameAr: string,
  nameEn: string,
  tags: string[],
  extra: Partial<FoodSearchResult>,
): Fixture {
  return {
    id,
    nameAr,
    nameEn,
    clinicId: null,
    state: 'raw',
    category: 'legumes',
    verificationStatus: 'verified',
    portions: [],
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
 * Catalog-shaped rows for the queries the spec names.
 *
 * Deliberately includes both raw/dry and cooked entries for the same food: the
 * picker must show them as two distinct results under their own names and must not
 * pick one, and that is a behaviour worth being able to look at without a database.
 */
const FIXTURES: Fixture[] = [
  row('l1', 'عدس ناشف', 'Lentils, dry', ['عدس'], {
    state: 'dry',
    portions: cup('l1', 192),
    kcal: 352,
  }),
  row('l2', 'عدس مطبوخ', 'Lentils, cooked', ['عدس'], {
    state: 'cooked',
    portions: cup('l2', 198),
    kcal: 116,
  }),
  row('l3', 'عدس أحمر ناشف', 'Red lentils, dry', ['عدس', 'عدس احمر'], {
    state: 'dry',
    portions: cup('l3', 192),
    kcal: 358,
  }),
  row('c1', 'جميد بلدي', 'Homemade jameed', ['جميد'], {
    clinicId: 'clinic-1',
    category: 'dairy_eggs',
    state: 'prepared',
    verificationStatus: 'needs_review',
    kcal: 120,
  }),
  row('b1', 'خبز عربي أبيض', 'White pita bread', ['خبز', 'خبز عربي'], {
    category: 'grains',
    state: 'prepared',
    portions: [
      { id: 'b1-loaf', labelAr: 'رغيف', labelEn: 'Loaf', grams: 60, isDefault: true, sortOrder: 0 },
      { id: 'b1-half', labelAr: 'نصف رغيف', labelEn: 'Half loaf', grams: 30, isDefault: false, sortOrder: 1 },
    ],
    kcal: 275,
    protein: 9,
    carbs: 56,
  }),
  row('r1', 'أرز أبيض ناشف', 'White rice, dry', ['ارز', 'رز'], {
    category: 'grains',
    state: 'dry',
    portions: cup('r1', 185),
    kcal: 365,
  }),
  row('r2', 'أرز أبيض مطبوخ', 'White rice, cooked', ['ارز', 'رز'], {
    category: 'grains',
    state: 'cooked',
    portions: cup('r2', 158),
    kcal: 130,
  }),
  row('o1', 'زيت زيتون', 'Olive oil', ['زيت', 'زيت زيتون'], {
    category: 'fats_oils',
    portions: [
      { id: 'o1-tbsp', labelAr: 'ملعقة كبيرة', labelEn: 'Tablespoon', grams: 13.5, isDefault: true, sortOrder: 0 },
      { id: 'o1-tsp', labelAr: 'ملعقة صغيرة', labelEn: 'Teaspoon', grams: 4.5, isDefault: false, sortOrder: 1 },
    ],
    kcal: 884,
    fat: 100,
    carbs: 0,
  }),
  row('e1', 'بيض ني', 'Egg, whole, raw', ['بيض'], {
    category: 'dairy_eggs',
    portions: [
      { id: 'e1-piece', labelAr: 'حبة', labelEn: 'Piece', grams: 50, isDefault: true, sortOrder: 0 },
    ],
    kcal: 143,
    protein: 13,
  }),
  row('m1', 'صدر دجاج ني', 'Chicken breast, skinless, raw', ['دجاج'], {
    // Grams-only by product choice: meat, poultry and fish carry no portions.
    category: 'poultry',
    kcal: 120,
    protein: 22,
    carbs: 0,
  }),
];

/** A stand-in for `searchIngredientsAction` — real refine over the fixtures. */
async function mockSearch(locale: string, query: string): Promise<RefinedFood[]> {
  const needle = normalizeArabic(query);
  const matched = FIXTURES.filter((fixture) =>
    fixture.tags.some((tag) => {
      const t = normalizeArabic(tag);
      return t.includes(needle) || needle.includes(t);
    }),
  ).map(({ tags: _tags, ...food }) => food);
  // A tiny latency so the loading indicator is observable.
  await new Promise((resolve) => setTimeout(resolve, 120));
  return refineIngredientResults(matched, query, locale);
}

/** Mock catalog rows — a mix of shared and clinic-owned dishes, one hidden. */
const MOCK_DISHES: (DishCardData & { clinicId: string | null })[] = [
  { id: 'd1', nameAr: 'مقلوبة دجاج', nameEn: 'Chicken Maqluba', mealTypes: ['lunch'], tags: ['local', 'filling'], kcal: 610, carbs: 68, protein: 38, highProtein: false, isSystem: true, hidden: false, clinicId: null },
  { id: 'd2', nameAr: 'مجدرة', nameEn: 'Mujaddara', mealTypes: ['lunch', 'dinner'], tags: ['economical', 'vegetarian'], kcal: 430, carbs: 64, protein: 17, highProtein: false, isSystem: true, hidden: false, clinicId: null },
  { id: 'd3', nameAr: 'سلطة دجاج', nameEn: 'Chicken salad', mealTypes: ['lunch'], tags: ['quick', 'filling'], kcal: 390, carbs: 12, protein: 42, highProtein: true, isSystem: false, hidden: false, clinicId: 'clinic-1' },
  { id: 'd4', nameAr: 'شوربة عدس', nameEn: 'Lentil soup', mealTypes: ['dinner'], tags: ['economical', 'no_cook'], kcal: 210, carbs: 30, protein: 12, highProtein: false, isSystem: false, hidden: false, clinicId: 'clinic-1' },
  { id: 'd5', nameAr: 'بيض مقلي', nameEn: 'Fried eggs', mealTypes: ['breakfast'], tags: ['quick'], kcal: 180, carbs: 2, protein: 13, highProtein: true, isSystem: true, hidden: false, clinicId: null },
];

async function mockDishNameSearch(
  _locale: string,
  query: string,
  excludeDishId?: string,
): Promise<DishNameSuggestion[]> {
  const term = normalizeArabic(query.trim());
  await new Promise((resolve) => setTimeout(resolve, 120));
  return MOCK_DISHES.filter(
    (dish) =>
      dish.id !== excludeDishId &&
      (normalizeArabic(dish.nameAr).startsWith(term) ||
        normalizeArabic(dish.nameEn).startsWith(term)),
  )
    .slice(0, 5)
    .map(({ id, nameAr, nameEn, clinicId }) => ({ id, nameAr, nameEn, clinicId }));
}

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
        <AddDishButton locale={locale} search={mockSearch} searchDishNames={mockDishNameSearch} />
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
          Mock search over real refine logic. Try عدس, خبز, أرز, زيت, بيض, دجاج. Raw and cooked stay separate; meat is grams-only.
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
                picked: <span className="font-medium text-foreground">{localizedName(food, locale)}</span>
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
        searchDishNames={mockDishNameSearch}
      />
    </div>
  );
}
