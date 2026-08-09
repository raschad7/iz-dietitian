'use client';

import { CalendarCheck, Flame, type LucideIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode } from 'react';

import { Icon, type IconName } from '@/components/ui/icon';
import { adherenceFraction } from '@/features/portal/adherence';
import { MealCheck } from '@/features/weekly-plans/components/meal-check';
import { PlanDayCompletionProvider, usePlanDayCompletion } from '@/features/weekly-plans/components/plan-day-completion';
import { mealTypeForSlot, type MealType } from '@/features/weekly-plans/schema';
import { type Locale } from '@/i18n/routing';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The home screen's own hero: today's ring, this week's completed-days count
 * and today's completed calories beside it, then today's meals below.
 *
 * **Reuses the meal-plan screen's own completion state, not a copy of it.**
 * `MealCheck` and `PlanDayCompletionProvider` are the exact client pieces
 * `PortalPlan` ticks meals with — see `plan-day-completion.tsx` for why that
 * context exists at all. Wrapping them here means a tick on this screen writes
 * through the same `toggleMealCompletionAction` and flips the same optimistic
 * state, so the ring and the two chips beside it update the instant a meal is
 * checked, with no second source of truth to keep in sync.
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

const RADIUS = 46;
const RING_LENGTH = 2 * Math.PI * RADIUS;

/** A small pill beside the ring — one figure and its unit, nothing else. */
function StatChip({ icon: StatIcon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-medium text-secondary-foreground shadow-sm">
      <StatIcon className="size-3.5 shrink-0 text-primary" strokeWidth={1.9} aria-hidden="true" />
      {children}
    </span>
  );
}

/**
 * The ring plus its two beside-ring chips. A client component reading the
 * completion context directly — not server props — which is what lets all
 * three move the instant `MealCheck` flips a meal below, rather than waiting
 * on the next navigation.
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
  const drawn = fraction !== null && fraction > 0;
  const full = fraction !== null && fraction >= 1;

  const completedCalories = meals.reduce(
    (sum, meal) => (context?.isCompleted(meal.id) ? sum + meal.kcal : sum),
    0,
  );

  return (
    <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
      <span className="relative grid size-40 shrink-0 place-items-center rounded-full bg-card shadow-elevated sm:size-44">
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
          {!full ? <circle cx="50" cy="50" r={RADIUS} strokeWidth="7" className="fill-none stroke-border" /> : null}

          {drawn ? (
            <circle
              cx="50"
              cy="50"
              r={RADIUS}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={full ? undefined : `${(fraction ?? 0) * RING_LENGTH} ${RING_LENGTH}`}
              className={cn('fill-none', full ? 'stroke-status-complete-mark' : 'stroke-primary')}
            />
          ) : null}
        </svg>

        <span className="relative flex flex-col items-center gap-1">
          <span
            className={cn(
              'font-heading text-4xl leading-none font-semibold tabular-nums',
              fraction === null ? 'text-muted-foreground' : 'text-secondary-foreground',
            )}
          >
            {fraction === null ? '—' : formatNumber(locale, fraction, { style: 'percent' })}
          </span>

          {total > 0 ? (
            <span className="text-caption leading-none text-muted-foreground">
              {t('meals', { completed, total })}
            </span>
          ) : null}
        </span>
      </span>

      <div className="flex flex-col gap-2">
        <StatChip icon={CalendarCheck}>{tCheckIns('progress.days', { count: daysCompleted, total: daysTotal })}</StatChip>
        <StatChip icon={Flame}>{t('caloriesCompleted', { value: completedCalories })}</StatChip>
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
  dayOfWeek,
  meals,
  initialCompletedMealIds,
  planTitle,
  daysCompleted,
  daysTotal,
}: {
  /** 0–6, Sunday-first — `today.dayOfWeek` off the published board. */
  dayOfWeek: number;
  meals: HomeTodayMeal[];
  initialCompletedMealIds: readonly string[];
  /** Null when nothing has been published yet — the empty state below reads this. */
  planTitle: string | null;
  /** This week's days reported as fully completed — the chip beside the ring. */
  daysCompleted: number;
  daysTotal: number;
}) {
  const t = useTranslations('portal');
  const tToday = useTranslations('portal.progress.today');
  const mealIds = meals.map((meal) => meal.id);

  return (
    <PlanDayCompletionProvider dayOfWeek={dayOfWeek} mealIds={mealIds} initialCompletedMealIds={initialCompletedMealIds}>
      <div className="space-y-4">
        <section className="space-y-3 rounded-3xl bg-primary-subtle p-5 text-center shadow-card sm:p-6">
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
    </PlanDayCompletionProvider>
  );
}
