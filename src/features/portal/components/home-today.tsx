'use client';

import { useLocale, useTranslations } from 'next-intl';

import { adherenceFraction } from '@/features/portal/adherence';
import { usePlanDayCompletion } from '@/features/weekly-plans/components/plan-day-completion';
import { type Locale } from '@/i18n/routing';

/**
 * The home screen's own hero: today's completion figure on the commitment
 * card, plus today's completed and remaining calories beside it. Today's
 * actual meals are read and ticked one section down, in the plan the home
 * page mounts below this — see that page's own doc comment.
 *
 * **Reuses the meal-plan screen's own completion state, not a copy of it.**
 * `usePlanDayCompletion()` below reads the same `PlanDayCompletionProvider`
 * that the plan section's `MealCheck` writes through — see
 * `plan-day-completion.tsx` for why that context exists at all, and the home
 * page's doc comment for why one provider wraps the strip, this card, and the
 * plan section together rather than each holding its own copy of "which meals
 * are done". A tick anywhere in the plan below flips the same optimistic
 * state, so this card's figure updates the instant a meal is checked, with no
 * second source of truth to keep in sync.
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

/**
 * The commitment card: today's completion figure beside a completed/remaining
 * calorie breakdown. A client component reading the completion context
 * directly — not server props — which is what lets the figure and the
 * calorie counts update the instant `MealCheck` flips a meal below, rather
 * than waiting on the next navigation.
 */
function TodayProgress({ meals }: { meals: HomeTodayMeal[] }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('portal.progress.today');
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

  // Today's full planned energy, not a separate target — the two dots below
  // split the same total the meal cards already show, into what's ticked and
  // what's left.
  const totalCalories = meals.reduce((sum, meal) => sum + meal.kcal, 0);
  const completedCalories = meals.reduce(
    (sum, meal) => (context?.isCompleted(meal.id) ? sum + meal.kcal : sum),
    0,
  );
  const remainingCalories = totalCalories - completedCalories;

  /*
    **Nothing to report on says so, in words.**

    `adherenceFraction` returns null when the day had no meals to tick, which is
    a real and ordinary state: no plan published yet, a plan whose week has not
    started, or a day the dietitian left empty. This branch used to print an em
    dash at `text-5xl` in `text-black` — and on a card whose only content is one
    large figure, a 48px black em dash reads as an unexplained black bar rather
    than as "no data". It was also the visible end of a bug rather than the
    normal case it was written for: `getPublishedBoard` was serving plans for
    weeks that had already ended, so accounts with a stale plan hit this branch
    every day.

    A sentence instead of a placeholder, at body size and in the muted token, so
    the card explains itself and the calorie legend — which would otherwise
    read "0 kcal completed / 0 kcal remaining" against a day nobody was asked
    about — stands down with it.
  */
  if (percentageParts === null) {
    return (
      <div className="flex min-h-[150px] w-full items-center rounded-[30px] bg-white px-7 py-8">
        <p className="text-sm text-muted-foreground">{t('noMeals')}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[150px] w-full items-center justify-between rounded-[30px] bg-white px-7 py-8">
      <div className="flex shrink-0 flex-col items-start gap-1.5">
        <span className="font-heading leading-none font-bold tabular-nums">
          {percentageParts.map((part, index) =>
            part.type === 'percent' ? (
              <span key={index} className="ms-1 align-middle text-sm font-semibold text-black">
                {part.value}
              </span>
            ) : (
              <span key={index} className="text-5xl text-primary">
                {part.value}
              </span>
            ),
          )}
        </span>

        <span className="text-caption leading-none text-muted-foreground">
          {t('meals', { completed, total })}
        </span>
      </div>

      <div className="flex flex-col gap-2.5 text-caption text-black">
        <span className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full bg-primary" />
          {t('caloriesCompleted', { value: completedCalories })}
        </span>
        <span className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full bg-border" />
          {t('caloriesRemaining', { value: remainingCalories })}
        </span>
      </div>
    </div>
  );
}

export function HomeToday({ meals }: { meals: HomeTodayMeal[] }) {
  const tToday = useTranslations('portal.progress.today');

  return (
    <section className="space-y-3">
      <p className="text-sm font-medium text-white">{tToday('heading')}</p>
      <TodayProgress meals={meals} />
    </section>
  );
}
