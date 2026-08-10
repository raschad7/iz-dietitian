'use client';

import { useLocale, useTranslations } from 'next-intl';

import { Icon, type IconName } from '@/components/ui/icon';
import { adherenceFraction } from '@/features/portal/adherence';
import { MealCheck } from '@/features/weekly-plans/components/meal-check';
import { usePlanDayCompletion } from '@/features/weekly-plans/components/plan-day-completion';
import { mealTypeForSlot, type MealType } from '@/features/weekly-plans/schema';
import { type Locale } from '@/i18n/routing';
import { formatNumber } from '@/lib/format';

/**
 * The home screen's own hero: today's completion figure on the commitment
 * card, this week's completed-days count and today's completed calories
 * beside it, then today's meals below.
 *
 * **Reuses the meal-plan screen's own completion state, not a copy of it.**
 * `MealCheck` is the exact client piece `PortalPlan` ticks meals with, and
 * `usePlanDayCompletion()` below reads the same `PlanDayCompletionProvider`
 * — see `plan-day-completion.tsx` for why that context exists at all. The
 * provider itself now wraps this **and** `WeekAdherenceStrip` from the page,
 * not from here, so that today's cell in the strip above shares the exact
 * same live counts this component's ring does. A tick on this screen writes
 * through the same `toggleMealCompletionAction` and flips the same optimistic
 * state, so the figure, the two lines beside it, and today's flame above all
 * update the instant a meal is checked, with no second source of truth to
 * keep in sync.
 *
 * **Only the day's shape crosses into this client component.** `today.meals`
 * carries dish, options and rationale nobody on this screen reads — see the
 * same reasoning in `portal-plan.tsx` for why that stays server-only. The page
 * maps each meal down to {@link HomeTodayMeal} before handing it here.
 */
export type HomeTodayMeal = {
  id: string;
  slotKey: string;
  label: string;
  timeOfDay: string;
  /** Rounded for display already — the page does that with `roundForDisplay`. */
  kcal: number;
};

/** Same mapping `portal-plan.tsx` draws its meal icons from. */
const MEAL_ICONS: Record<MealType, IconName> = {
  breakfast: 'mealBreakfast',
  snack: 'mealSnack',
  lunch: 'mealLunch',
  dinner: 'mealDinner',
};

/**
 * The commitment card: today's completion figure beside this week's two
 * running counts. A client component reading the completion context
 * directly — not server props — which is what lets the figure and the
 * calorie count update the instant `MealCheck` flips a meal below, rather
 * than waiting on the next navigation.
 */
function TodayProgress({
  meals,
  daysCompleted,
  daysTotal,
}: {
  meals: HomeTodayMeal[];
  /** Days this week reported as fully completed — {@link WeekAdherence.fullyCompletedCount}. */
  daysCompleted: number;
  daysTotal: number;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations('portal.progress.today');
  const tCheckIns = useTranslations('portal.checkIns');
  const context = usePlanDayCompletion();

  const total = context?.totalCount ?? 0;
  const completed = context?.completedCount ?? 0;
  const fraction = adherenceFraction(completed, total);
const percentageParts =
  fraction === null
    ? null
    : new Intl.NumberFormat(locale, {
        style: 'percent',
        maximumFractionDigits: 0,
      }).formatToParts(fraction);
  const completedCalories = meals.reduce(
    (sum, meal) => (context?.isCompleted(meal.id) ? sum + meal.kcal : sum),
    0, 
  );

  return (
<div className="flex min-h-[150px] w-full items-center justify-between rounded-[30px] bg-[linear-gradient(110deg,#F1F3E8_0%,#E7EBD8_45%,#DDE5C8_100%)] px-7 py-8">      <div className="flex flex-col gap-1.5 text-caption text-commitment-card-stat">
        <p>{t('caloriesCompleted', { value: completedCalories })}</p>
        <p>{tCheckIns('progress.days', { count: daysCompleted, total: daysTotal })}</p>
      </div>
      
      
      <div className="flex shrink-0 flex-col items-center justify-between">
  <span className="font-heading leading-none font-bold tabular-nums text-commitment-card-figure">
    {percentageParts ? (
      percentageParts.map((part, index) =>
        part.type === 'percent' ? (
          <span
            key={index} 
            className="ml-1 align-middle text-2xl font-semibold"
          >
            {part.value}
          </span>
        ) : (
          <span key={index} className="text-5xl">
            {part.value}
          </span>
        ),
      )
    ) : (
      <span className="text-5xl">—</span>
    )}
  </span>

  {total > 0 ? (
    <span className="text-caption leading-none text-commitment-card-figure">
      {t('meals', { completed, total })}
    </span>
  ) : null}
</div>
    </div>
  );
}

/** One meal on the home screen: a flat card, not the meal-plan page's disclosure. */
function TodayMealRow({ meal }: { meal: HomeTodayMeal }) {
  const t = useTranslations('portal.plan');
  const mealIcon = MEAL_ICONS[mealTypeForSlot(meal.slotKey)];

  return (
    <li className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-card">
      <span
        aria-hidden="true"
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <Icon name={mealIcon} className="size-5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block font-heading text-base leading-snug font-semibold">{meal.label}</span>
        <span className="block truncate text-sm text-muted-foreground">
          {/* `dir="ltr"`: a clock time reads the same way in both languages. */}
          <span dir="ltr" className="tabular-nums">
            {meal.timeOfDay}
          </span>{' '}
          · {t('kcalValue', { value: meal.kcal })}
        </span>
      </span>

      <MealCheck mealId={meal.id} label={t('markEaten', { meal: meal.label })} />
    </li>
  );
}

export function HomeToday({
  meals,
  planTitle,
  daysCompleted,
  daysTotal,
}: {
  meals: HomeTodayMeal[];
  /** Null when nothing has been published yet — the empty state below reads this. */
  planTitle: string | null;
  /** This week's days reported as fully completed — one of the two lines on the commitment card. */
  daysCompleted: number;
  daysTotal: number;
}) {
  const t = useTranslations('portal');
  const tToday = useTranslations('portal.progress.today');

  return (
    <div className="space-y-4">
      <section className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">{tToday('heading')}</p>
        <TodayProgress meals={meals} daysCompleted={daysCompleted} daysTotal={daysTotal} />
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">{t('dashboard.todaysMeals')}</h2>

        {planTitle === null ? (
          <p className="text-sm text-muted-foreground">{t('plan.none')}</p>
        ) : meals.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('emptyToday')}</p>
        ) : (
          <ul className="space-y-3">
            {meals.map((meal) => (
              <TodayMealRow key={meal.id} meal={meal} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
