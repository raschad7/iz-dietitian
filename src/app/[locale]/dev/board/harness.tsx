'use client';

import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { ContextPanel } from '@/features/weekly-plans/components/context-panel';
import { EmptyPlanBoard } from '@/features/weekly-plans/components/empty-plan-board';
import { PlanBoard } from '@/features/weekly-plans/components/plan-board';
import type { NewWeekProps } from '@/features/weekly-plans/components/new-week-dialog';
import { PLANNER_THEME } from '@/features/weekly-plans/theme';
import {
  dishGrams,
  dishTotals,
  type DishDetail,
  type NutrientTotals,
} from '@/features/weekly-plans/nutrition';
import type { MealIngredientLine } from '@/features/weekly-plans/meal-ingredients';
import type {
  Board,
  BoardDay,
  BoardMeal,
  BoardOption,
  CatalogEntry,
  ClientContext,
  PlannableClient,
} from '@/features/weekly-plans/queries';
import type { Locale } from '@/i18n/routing';

/**
 * A dev-only harness for the weekly-plan board — see `page.tsx` for why it
 * exists.
 *
 * The fixtures below are a plausible week rather than a minimal one, because
 * what this page is for is *looking at density*: seven columns of five slots,
 * dish names of realistic length in both scripts, one day over its target and
 * one under, and one skipped slot so the restore control is reachable. A board
 * with two meals on it would render without complaint and prove nothing.
 *
 * The writes are inert. `PlanBoard` reaches the server through `BoardEditor`'s
 * own actions, which fail without a session — so this page is for reading the
 * layout, not for exercising edits. Drag, the popovers, the dialogs and the
 * toasts all work, because none of them need the server to draw themselves.
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

function line(id: string, grams: number, kcal: number, index: number): MealIngredientLine {
  return {
    quantityGrams: grams,
    portion: null,
    portionQuantity: null,
    isPrimary: index === 0,
    sortOrder: index,
    food: {
      id,
      nameAr: id,
      nameEn: id,
      kcal,
      protein: 9,
      carbs: 22,
      fat: 5,
      ...NUTRIENTS,
    },
  };
}

/**
 * Three lines adding up to about `kcal`.
 *
 * Built rather than stored, because the card, the day header and the week total
 * all recompute from the lines — a fixture that set the totals directly would
 * draw a board whose columns did not add up.
 */
function recipe(slug: string, kcal: number): MealIngredientLine[] {
  return [
    line(`${slug}-a`, 120, Math.round(kcal * 0.55 * (100 / 120)), 0),
    line(`${slug}-b`, 80, Math.round(kcal * 0.3 * (100 / 80)), 1),
    line(`${slug}-c`, 40, Math.round(kcal * 0.15 * (100 / 40)), 2),
  ];
}

function dish(
  slug: string,
  nameAr: string,
  nameEn: string,
  lines: readonly MealIngredientLine[],
  tags: string[],
): DishDetail & { servings: number } {
  return {
    id: `${slug}-dish`,
    clinicId: null,
    slug,
    nameAr,
    nameEn,
    mealTypes: ['lunch'],
    tags,
    allergenTags: [],
    baseServingLabel: 'حصة',
    isActive: true,
    ingredients: [...lines],
    servings: 1,
  };
}

type SlotFixture = {
  slotKey: string;
  label: string;
  timeOfDay: string;
  budgetKcal: number;
};

const SLOTS: SlotFixture[] = [
  { slotKey: 'breakfast', label: 'فطور', timeOfDay: '07:30', budgetKcal: 545 },
  { slotKey: 'snack_1', label: 'سناك صباحي', timeOfDay: '10:30', budgetKcal: 218 },
  { slotKey: 'lunch', label: 'غداء', timeOfDay: '14:00', budgetKcal: 762 },
  { slotKey: 'snack_2', label: 'سناك عصر', timeOfDay: '17:00', budgetKcal: 218 },
  { slotKey: 'dinner', label: 'عشاء', timeOfDay: '20:00', budgetKcal: 435 },
];

/** Names of realistic length, including two that have to wrap to a second line. */
const DISHES: [string, string, string, string[]][] = [
  ['fatteh', 'فتة حمص', 'Chickpea fatteh', ['quick']],
  ['mozzarella', 'جبنة موزاريلا مع بندورة', 'Mozzarella with tomato', ['high_protein']],
  ['hummus-tahini', 'حمص بالطحينة مع خبز', 'Hummus with tahini and bread', ['vegetarian']],
  ['ful', 'فول مدمس', 'Ful medames', ['budget']],
  ['eggs-zaatar', 'بيض مع زعتر وزيت', 'Eggs with zaatar and oil', ['quick']],
  ['labneh-walnut', 'لبنة مع جوز وعسل', 'Labneh with walnuts and honey', ['high_protein']],
  ['oats-milk', 'شوفان بالحليب والموز', 'Oats with milk and banana', ['high_carb']],
];

const WEEK_START = '2026-08-30';

function boardMeal(dayOfWeek: number, slot: SlotFixture, index: number): BoardMeal {
  // One slot skipped on Wednesday, so `SkippedSlot` is on screen; one slot left
  // unfilled on Thursday, so the empty card and the unfilled banner are too.
  const [slug, nameAr, nameEn, tags] = DISHES[(dayOfWeek + index) % DISHES.length]!;
  const unfilled = dayOfWeek === 4 && slot.slotKey === 'snack_2';

  // A little over on Wednesday and under on Friday, so the day header's drift
  // arrow and its amber are both drawn somewhere on the board.
  const scale = dayOfWeek === 3 ? 1.12 : dayOfWeek === 5 ? 0.88 : 1;
  const lines: MealIngredientLine[] = unfilled ? [] : recipe(slug, slot.budgetKcal * scale);
  const chosen = unfilled ? null : dish(slug, nameAr, nameEn, lines, tags);

  return {
    id: `${dayOfWeek}-${slot.slotKey}`,
    slotKey: slot.slotKey,
    label: slot.label,
    timeOfDay: slot.timeOfDay,
    dish: chosen,
    lines: [...lines],
    // Sunday's meals are hand-set, so the meal panel's "reset to the recipe
    // amounts" button — a control that only exists once an amount has been
    // moved — has somewhere to be looked at. Every other day keeps the recipe's
    // own quantities, which is the state the rest of the board is showing.
    hasOwnAmounts: dayOfWeek === 0,
    rationaleAr: null,
    totals: dishTotals(lines, 1),
    grams: dishGrams(lines, 1),
    nutritionFrozen: false,
    budgetKcal: slot.budgetKcal,
    /*
      Two alternatives on every filled meal, so the printed handout's "or
      instead" line and the meal panel's swap list both have something to draw.
      Taken from the dish table by offset, which keeps them different from the
      dish in the slot without needing a second fixture.
    */
    options: unfilled ? [] : alternativesFor(dayOfWeek, index),
  };
}

/** Two dishes that are not the one in this slot, as stored AI alternatives. */
function alternativesFor(dayOfWeek: number, index: number): BoardOption[] {
  return [1, 2].map((offset) => {
    const [slug, nameAr, nameEn] = DISHES[(dayOfWeek + index + offset) % DISHES.length]!;

    return {
      id: `${dayOfWeek}-${index}-${slug}`,
      dishId: slug,
      slug,
      nameAr,
      nameEn,
      servings: 1,
      kcal: 180 + offset * 90,
      isSimilar: true,
    };
  });
}

function sumTotals(all: readonly NutrientTotals[]): NutrientTotals {
  const [first] = all;
  if (!first) return dishTotals([], 1);

  const out = {} as NutrientTotals;
  for (const key of Object.keys(first) as (keyof NutrientTotals)[]) {
    out[key] = {
      ...first[key],
      value: all.reduce((total, entry) => total + entry[key].value, 0),
    };
  }
  return out;
}

function buildDay(dayOfWeek: number): BoardDay {
  const meals = SLOTS
    // Wednesday has no afternoon snack — the per-day skip a `SkippedSlot` draws.
    .filter((slot) => !(dayOfWeek === 3 && slot.slotKey === 'snack_2'))
    .map((slot, index) => boardMeal(dayOfWeek, slot, index));

  return {
    dayOfWeek,
    meals,
    totals: sumTotals(meals.map((meal) => meal.totals)),
    unfilled: meals.filter((meal) => meal.dish === null).length,
  };
}

/**
 * A few catalog rows, so the drawer is not empty.
 *
 * The dish drag out of the catalog is its own preview path — a full-width strip
 * becoming a card — and it cannot be looked at against an empty list.
 */
const CATALOG: CatalogEntry[] = DISHES.map(([slug, nameAr, nameEn, tags], index) => {
  const lines = recipe(slug, 320 + index * 60);

  return {
    ...dish(slug, nameAr, nameEn, lines, tags),
    baseKcal: Math.round(dishTotals(lines, 1).kcal.value),
    nutritionCategory: 'balanced' as const,
    blockedBy: [],
  };
});

const CLIENTS: PlannableClient[] = [
  ['c1', 'أحمد بكري', 3, true, 'draft'],
  ['c2', 'سارة الحاج', 7, true, 'published'],
  ['c3', 'Omar Haddad', 11, false, null],
].map(([id, fullName, seq, hasProfile, latestPlanStatus]) => ({
  id: id as string,
  fullName: fullName as string,
  seq: seq as number,
  hasProfile: hasProfile as boolean,
  latestPlanStatus: latestPlanStatus as string | null,
  latestWeekStartDate: latestPlanStatus ? WEEK_START : null,
  nextAppointment: null,
  lastAppointment: null,
}));

export function BoardHarness({ locale }: { locale: Locale }) {
  /** Which cases the fixture puts on screen, so one page covers several. */
  const [published, setPublished] = useState(false);
  const [emptyProfile, setEmptyProfile] = useState(true);
  /*
    The screen a client has before their first week — a different component
    (`EmptyPlanBoard`), the same header, and the only place the dish catalog
    opens with nothing to be dragged onto. It could not be looked at here at
    all, which made the blurred "create a week first" panel over the catalog the
    one surface in the planner with no way to see it short of a real client with
    no plan.
  */
  const [noPlan, setNoPlan] = useState(false);

  const board = useMemo<Board>(() => {
    const days = [0, 1, 2, 3, 4, 5, 6].map(buildDay);

    return {
      id: 'plan-fixture',
      clientId: 'c1',
      clientName: 'أحمد بكري',
      weekStartDate: WEEK_START,
      status: published ? 'published' : 'draft',
      publishedAt: published ? new Date('2026-08-29T09:00:00Z') : null,
      weekInstructions: null,
      kcalTargetSnapshot: 2178,
      proteinTargetSnapshot: 128,
      goalSnapshot: 'weight_loss',
      generatedBy: 'ai',
      model: 'claude-opus-5',
      updatedAt: new Date('2026-08-29T09:00:00Z'),
      days,
      totals: sumTotals(days.map((day) => day.totals)),
      unfilled: days.reduce((total, day) => total + day.unfilled, 0),
    };
  }, [published]);

  const context = useMemo<ClientContext>(
    () => ({
      clientId: 'c1',
      fullName: 'أحمد بكري',
      age: 28,
      sex: 'male',
      heightCm: 170,
      goal: 'weight_loss',
      activityLevel: 'moderate',
      allergies: null,
      medicalNotes: emptyProfile ? null : 'ارتفاع طفيف في ضغط الدم — تقليل الصوديوم.',
      profile: {
        weightKg: 80,
        dailyKcalTarget: 2178,
        proteinTargetGrams: 128,
        allergenTags: [],
        preferences: emptyProfile ? null : 'يفضّل الدجاج والسمك على اللحوم الحمراء.',
        dislikes: emptyProfile ? null : 'الباذنجان، الكبدة.',
        permanentInstructions: emptyProfile
          ? null
          : 'سكري نوع 2 — تجنّب السكريات المضافة تمامًا وراقب الكربوهيدرات في العشاء.',
        mealSchedule: SLOTS.map((slot) => ({
          slotKey: slot.slotKey,
          label: slot.label,
          timeOfDay: slot.timeOfDay,
          kcalShare: slot.budgetKcal / 2178,
        })),
      },
      targets: {
        bmi: 27.7,
        bmiCategory: 'overweight',
        bmr: 1740,
        tdee: 2697,
        suggestedKcal: 2178,
        missing: [],
      },
      effectiveKcal: 2178,
      effectiveProteinGrams: 128,
      budgets: SLOTS.map((slot) => ({
        slotKey: slot.slotKey,
        label: slot.label,
        timeOfDay: slot.timeOfDay,
        kcal: slot.budgetKcal,
      })),
    }),
    [emptyProfile],
  );

  return (
    /* `h-dvh`, where the real screen says `h-full`.

       The app shell is a `100svh` box with a chain of `min-h-0` under it, so
       the board there is handed a *definite* height and has to fit inside it.
       `h-full` here resolves against `body`, which has none — so the harness
       let the board grow to whatever it wanted and reported that everything
       fitted. Which made the one measurement this page exists to take, on the
       one screen where vertical room is the whole problem, the one it could not
       be trusted on. */
    <div className={`${PLANNER_THEME} flex min-h-full min-w-0 flex-col text-start md:h-dvh md:min-h-0`}>
      {/* The switches, not a page header: the real screen's header is
          `PageHeader`, and reproducing it here would only take height away from
          the thing being looked at. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="neutral" onClick={() => setPublished((v) => !v)}>
          {published ? 'draft' : 'published'}
        </Button>
        <Button type="button" size="sm" variant="neutral" onClick={() => setEmptyProfile((v) => !v)}>
          {emptyProfile ? 'filled notes' : 'empty notes'}
        </Button>
        <Button type="button" size="sm" variant="neutral" onClick={() => setNoPlan((v) => !v)}>
          {noPlan ? 'has plan' : 'no plan'}
        </Button>
        {/* The board's own toasts only fire after a server action succeeds, and
            nothing here reaches a server — so the one surface this page could
            not otherwise show gets a button. */}
        <Button
          type="button"
          size="sm"
          variant="neutral"
          onClick={() =>
            toast.success('تم حذف عشاء', {
              description: 'أُزيلت الوجبة من أيام الأسبوع السبعة.',
              action: { label: 'تراجع', onClick: () => {} },
            })
          }
        >
          toast
        </Button>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 gap-4">
        {noPlan ? (
          <EmptyPlanBoard
            clientId={context.clientId}
            catalog={CATALOG}
            usage={{}}
            locale={locale}
            history={<p className="text-body-sm text-muted-foreground">—</p>}
            profile={
              <ContextPanel context={context} clients={CLIENTS} locale={locale} embedded />
            }
            newWeek={NEW_WEEK(context)}
          />
        ) : (
          <PlanBoard
            key={board.status}
            board={board}
            candidates={{}}
            catalog={CATALOG}
            usage={{}}
            previous={null}
            locale={locale}
            clinicName="عيادة إنزيم"
            history={<p className="text-body-sm text-muted-foreground">—</p>}
            newWeek={NEW_WEEK(context)}
          >
            <ContextPanel context={context} clients={CLIENTS} locale={locale} embedded />
          </PlanBoard>
        )}
      </div>
    </div>
  );
}

/** What both boards hand their "new week" dialog. One fixture, so the two
    states of this harness cannot drift into two different dialogs. */
function NEW_WEEK(context: ClientContext): NewWeekProps {
  return {
    weekStartDate: '2026-09-06',
    plans: [],
    blocked: false,
    generateBlocked: null,
    context,
    defaultInstruction: null,
  };
}
