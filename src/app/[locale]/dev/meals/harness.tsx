'use client';

import { useState } from 'react';

import {
  EditorActionsContext,
  type EditorActions,
} from '@/features/weekly-plans/components/board-dnd';
import { MealDetailPanel } from '@/features/weekly-plans/components/meal-detail-panel';
import { PortalMealCard } from '@/features/weekly-plans/components/portal-meal-card';
import { dishGrams, dishTotals, type DishIngredientDetail } from '@/features/weekly-plans/nutrition';
import type { BoardMeal } from '@/features/weekly-plans/queries';

/**
 * A dev-only harness for the meal-quantity interface.
 *
 * The real board is behind the staff session guard and the portal behind a client
 * one, and browser automation may not enter a password. This page renders the same
 * two components — `MealDetailPanel` (staff, editable and read-only) and
 * `PortalMealCard` (client, read-only) — over fixtures that cover the cases the
 * display has to get right: mixed units in one meal, a grams-only meal, and a long
 * ingredient list.
 *
 * The stepper is wired to local state through the real `EditorActionsContext`, so
 * pressing + or − exercises the same `setServings` path the board uses and every
 * quantity below it re-renders from the same `servings` value.
 *
 * Dev-only: 404 in production. It ships no data access and no session guard.
 */

const NUTRIENTS = {
  fiber: null,
  sugar: null,
  saturatedFat: null,
  cholesterol: null,
  sodium: null,
  calcium: null,
  iron: null,
  potassium: null,
} as const;

type Line = {
  id: string;
  nameAr: string;
  nameEn: string;
  grams: number;
  kcal: number;
  portion?: { labelAr: string; labelEn: string; grams: number };
  portionQuantity?: number;
};

function ingredient(line: Line): DishIngredientDetail {
  return {
    quantityGrams: line.grams,
    portion: line.portion ? { id: `${line.id}-portion`, ...line.portion } : null,
    portionQuantity: line.portionQuantity ?? null,
    food: {
      id: line.id,
      nameAr: line.nameAr,
      nameEn: line.nameEn,
      kcal: line.kcal,
      protein: 8,
      carbs: 20,
      fat: 4,
      ...NUTRIENTS,
    },
  };
}

/** Every unit family in one meal — grams, a loaf, pieces, a cup, a teaspoon. */
const MIXED: Line[] = [
  { id: 'labneh', nameAr: 'لبنة', nameEn: 'Labneh', grams: 150, kcal: 174 },
  {
    id: 'bread',
    nameAr: 'خبز عربي',
    nameEn: 'Arabic bread',
    grams: 60,
    kcal: 275,
    portion: { labelAr: 'رغيف', labelEn: 'Loaf', grams: 60 },
    portionQuantity: 1,
  },
  {
    id: 'egg',
    nameAr: 'بيض مسلوق',
    nameEn: 'Egg, boiled',
    grams: 100,
    kcal: 155,
    portion: { labelAr: 'حبة', labelEn: 'Piece', grams: 50 },
    portionQuantity: 2,
  },
  {
    id: 'rice',
    nameAr: 'أرز أبيض مطبوخ',
    nameEn: 'White rice, cooked',
    grams: 158,
    kcal: 130,
    portion: { labelAr: 'كوب', labelEn: 'Cup', grams: 158 },
    portionQuantity: 1,
  },
  {
    id: 'oil',
    nameAr: 'زيت زيتون',
    nameEn: 'Olive oil',
    grams: 4.5,
    kcal: 884,
    portion: { labelAr: 'ملعقة صغيرة', labelEn: 'Teaspoon', grams: 4.5 },
    portionQuantity: 1,
  },
];

/** No household measures at all — meat, poultry and fish are grams-only by choice. */
const GRAMS_ONLY: Line[] = [
  { id: 'chicken', nameAr: 'صدر دجاج', nameEn: 'Chicken breast', grams: 180, kcal: 165 },
  { id: 'zucchini', nameAr: 'كوسا', nameEn: 'Zucchini', grams: 120, kcal: 17 },
  { id: 'onion', nameAr: 'بصل', nameEn: 'Onion', grams: 45, kcal: 40 },
];

/** Fourteen lines, long Arabic and English names — the mobile overflow case. */
const LONG: Line[] = [
  ...MIXED,
  { id: 'l1', nameAr: 'فلفل أحمر حلو مقطّع شرائح رفيعة', nameEn: 'Sweet red pepper, thinly sliced', grams: 70, kcal: 31 },
  { id: 'l2', nameAr: 'بقدونس مفروم ناعم', nameEn: 'Flat-leaf parsley, finely chopped', grams: 15, kcal: 36 },
  { id: 'l3', nameAr: 'عصير ليمون طازج', nameEn: 'Fresh lemon juice', grams: 20, kcal: 22, portion: { labelAr: 'ملعقة كبيرة', labelEn: 'Tablespoon', grams: 15 }, portionQuantity: 1.5 },
  { id: 'l4', nameAr: 'طحينة', nameEn: 'Tahini', grams: 30, kcal: 595, portion: { labelAr: 'ملعقة كبيرة', labelEn: 'Tablespoon', grams: 15 }, portionQuantity: 2 },
  { id: 'l5', nameAr: 'حمص مسلوق', nameEn: 'Chickpeas, boiled', grams: 120, kcal: 164, portion: { labelAr: 'نصف كوب', labelEn: 'Half cup', grams: 82 }, portionQuantity: 1.5 },
  { id: 'l6', nameAr: 'ثوم', nameEn: 'Garlic', grams: 6, kcal: 149 },
  { id: 'l7', nameAr: 'كمون مطحون', nameEn: 'Ground cumin', grams: 2, kcal: 375 },
  { id: 'l8', nameAr: 'ملح', nameEn: 'Salt', grams: 1, kcal: 0 },
  { id: 'l9', nameAr: 'صنوبر محمّص', nameEn: 'Toasted pine nuts', grams: 12, kcal: 673 },
];

function meal(id: string, label: string, lines: Line[], servings: number): BoardMeal {
  const ingredients = lines.map(ingredient);

  return {
    id,
    slotKey: 'lunch',
    label,
    timeOfDay: '13:30',
    rationaleAr: 'وجبة متوازنة تناسب ميزانية الغداء.',
    totals: dishTotals(ingredients, servings),
    grams: dishGrams(ingredients, servings),
    nutritionFrozen: false,
    budgetKcal: 650,
    options: [],
    dish: {
      id: `${id}-dish`,
      clinicId: null,
      slug: id,
      nameAr: 'صحن لبنة وخبز',
      nameEn: 'Labneh plate',
      mealTypes: ['lunch'],
      tags: ['quick'],
      allergenTags: [],
      baseServingLabel: 'حصة',
      isActive: true,
      ingredients,
      servings,
    },
  };
}

/**
 * Keyed on **real dish slugs**, so the serving-guide registry is exercised rather
 * than mocked: `eggs-toast-tomato` has a whole-egg guide stepping by 1,
 * `bamia-lahm` has the rice-and-meat guide stepping by 0.5, and `maqluba-chicken`
 * has none — which is the fallback case.
 */
const FIXTURES = {
  'eggs-toast-tomato': { label: 'فطور', lines: MIXED },
  'bamia-lahm': { label: 'غداء', lines: LONG },
  'maqluba-chicken': { label: 'عشاء', lines: GRAMS_ONLY },
} as const;

type FixtureKey = keyof typeof FIXTURES;

export function MealsHarness({ locale }: { locale: string }) {
  const [fixture, setFixture] = useState<FixtureKey>('eggs-toast-tomato');
  const [servings, setServings] = useState(1);

  const { label, lines } = FIXTURES[fixture];
  const current = meal(fixture, label, lines, servings);

  // Only `setServings` does anything; the rest are inert so a stray click in the
  // harness cannot look like a working edit.
  const actions: EditorActions = {
    setServings: (_mealId, next) => setServings(next),
    place: () => {},
    clear: () => {},
    remove: () => {},
    add: () => {},
    addWeek: () => {},
    removeWeek: () => {},
    dragging: null,
    settledMealId: null,
  };

  return (
    <EditorActionsContext.Provider value={actions}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(FIXTURES) as FixtureKey[]).map((key) => (
            <button
              key={key}
              type="button"
              data-testid={`fixture-${key}`}
              onClick={() => setFixture(key)}
              className={`rounded-md border px-3 py-1.5 text-body-sm ${
                fixture === key ? 'border-primary text-primary' : 'border-border text-muted-foreground'
              }`}
            >
              {key}
            </button>
          ))}
          <span className="text-caption text-muted-foreground" dir="ltr">
            servings ×{servings}
          </span>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <section data-testid="staff-editable" className="min-h-[32rem] rounded-lg border border-border">
            <p className="border-b border-border px-4 py-2 text-caption text-muted-foreground">
              staff · editable
            </p>
            <MealDetailPanel
              meal={current}
              candidates={[]}
              catalog={[]}
              usage={{}}
              planId="dev-plan"
              locale={locale}
              editable
              onClose={() => {}}
              onBrowseDishes={() => {}}
            />
          </section>

          <section data-testid="staff-readonly" className="min-h-[32rem] rounded-lg border border-border">
            <p className="border-b border-border px-4 py-2 text-caption text-muted-foreground">
              staff · published (read-only)
            </p>
            <MealDetailPanel
              meal={{ ...current, nutritionFrozen: true }}
              candidates={[]}
              catalog={[]}
              usage={{}}
              planId="dev-plan"
              locale={locale}
              editable={false}
              onClose={() => {}}
              onBrowseDishes={() => {}}
            />
          </section>

          <section data-testid="portal" className="rounded-lg border border-border p-2">
            <p className="px-2 pb-2 text-caption text-muted-foreground">client portal</p>
            {/* `past`, not `today`: today's card renders the live tick, which
                needs the portal's completion provider. The quantities under it
                are identical, and this harness is about the quantities. */}
            <PortalMealCard meal={current} standing="past" completed={false} />
          </section>
        </div>
      </div>
    </EditorActionsContext.Provider>
  );
}
