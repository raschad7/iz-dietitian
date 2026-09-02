'use client';

import { useState } from 'react';

import {
  EditorActionsContext,
  type EditorActions,
} from '@/features/weekly-plans/components/board-dnd';
import { PlanDayCompletionProvider } from '@/features/weekly-plans/components/plan-day-completion';
import { MealDetailPanel } from '@/features/weekly-plans/components/meal-detail-panel';
import { PortalMealCard } from '@/features/weekly-plans/components/portal-meal-card';
import {
  mealGrams,
  mealTotals,
  type MealIngredientLine,
} from '@/features/weekly-plans/meal-ingredients';
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
 * The ingredient controls are wired to local state through the real
 * `EditorActionsContext`, so pressing + or − exercises the same `setIngredient`
 * path the board uses — including `nextIngredientAmount`, which is what decides
 * that a loaf steps by half, an egg by one, and chicken by ten grams.
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
  /** Marks a line that gets a −/+ — `dish_ingredients.is_primary`. */
  primary?: boolean;
};

function ingredient(line: Line, index: number): MealIngredientLine {
  return {
    quantityGrams: line.grams,
    portion: line.portion ? { id: `${line.id}-portion`, ...line.portion } : null,
    portionQuantity: line.portionQuantity ?? null,
    isPrimary: line.primary ?? false,
    sortOrder: index,
    side: null,
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
    primary: true,
  },
  {
    id: 'egg',
    nameAr: 'بيض مسلوق',
    nameEn: 'Egg, boiled',
    grams: 100,
    kcal: 155,
    portion: { labelAr: 'حبة', labelEn: 'Piece', grams: 50 },
    portionQuantity: 2,
    primary: true,
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
  { id: 'chicken', nameAr: 'صدر دجاج', nameEn: 'Chicken breast', grams: 180, kcal: 165, primary: true },
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

function meal(id: string, label: string, lines: readonly MealIngredientLine[]): BoardMeal {
  return {
    id,
    slotKey: 'lunch',
    label,
    timeOfDay: '13:30',
    rationaleAr: 'وجبة متوازنة تناسب ميزانية الغداء.',
    lines: [...lines],
    hasOwnAmounts: false,
    totals: mealTotals(lines),
    grams: mealGrams(lines),
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
      source: 'home',
      effort: 'medium',
      cost: 'normal',
      occasion: 'everyday',
      isSide: false,
      allergenTags: [],
      baseServingLabel: 'حصة',
      isActive: true,
      ingredients: [...lines],
      // Spent the moment a control is touched, and irrelevant before then: the
      // lines above are already the amounts.
      servings: 1,
    },
  };
}

/**
 * The three cases the ingredient controls have to get right: a meal mixing units
 * (a loaf stepping by half, eggs by one), a long list where only two lines are
 * adjustable and twelve are not, and a grams-only meal — meat, poultry and fish
 * carry no household unit by product choice, so their control steps in grams.
 */
const FIXTURES = {
  'eggs-toast-tomato': { label: 'فطور', lines: MIXED },
  'bamia-lahm': { label: 'غداء', lines: LONG },
  'maqluba-chicken': { label: 'عشاء', lines: GRAMS_ONLY },
} as const;

type FixtureKey = keyof typeof FIXTURES;

export function MealsHarness({ locale }: { locale: string }) {
  const [fixture, setFixture] = useState<FixtureKey>('eggs-toast-tomato');

  /*
   * The meal's lines, held locally exactly as the server holds
   * `weekly_plan_meal_ingredients` once a control has been touched — which is why
   * `touched` is tracked separately: it is what turns "back to recipe" on, and it
   * is the one piece of state the harness cannot derive from the amounts.
   */
  const [amounts, setAmounts] = useState<MealIngredientLine[]>(() =>
    FIXTURES[fixture].lines.map(ingredient),
  );
  const [touched, setTouched] = useState(false);

  function pick(key: FixtureKey): void {
    setFixture(key);
    setAmounts(FIXTURES[key].lines.map(ingredient));
    setTouched(false);
  }

  const { label } = FIXTURES[fixture];
  const current = { ...meal(fixture, label, amounts), hasOwnAmounts: touched };

  // Only the ingredient edits do anything; the rest are inert so a stray click in
  // the harness cannot look like a working edit.
  const actions: EditorActions = {
    setIngredient: (_mealId, amount) => {
      setTouched(true);
      setAmounts((previous) =>
        previous.map((line) =>
          line.food.id === amount.foodId
            ? {
                ...line,
                quantityGrams: amount.quantityGrams,
                portionQuantity: amount.portionQuantity,
              }
            : line,
        ),
      );
    },
    resetIngredients: () => {
      setAmounts(FIXTURES[fixture].lines.map(ingredient));
      setTouched(false);
    },
    setServings: () => {},
    place: () => {},
    clear: () => {},
    remove: () => {},
    add: () => {},
    addWeek: () => {},
    removeWeek: () => {},
    dragging: null,
    settledMealId: null,
    holdingId: null,
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
              onClick={() => pick(key)}
              className={`rounded-md border px-3 py-1.5 text-body-sm ${
                fixture === key ? 'border-primary text-primary' : 'border-border text-muted-foreground'
              }`}
            >
              {key}
            </button>
          ))}
          <span className="text-caption text-muted-foreground" dir="ltr">
            {touched ? 'own amounts' : 'following recipe'}
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
            {/* `past`, not `future`: a future day renders no tick at all, and
                this harness is about the quantities under it. `past` and
                `today` both render the live `MealCheck`, which needs the
                portal's completion provider — supplied here with a single
                fixture meal rather than a real plan. */}
            <PlanDayCompletionProvider dayOfWeek={0} mealIds={[current.id]} initialCompletedMealIds={[]}>
              <PortalMealCard meal={current} standing="past" />
            </PlanDayCompletionProvider>
          </section>
        </div>
      </div>
    </EditorActionsContext.Provider>
  );
}
