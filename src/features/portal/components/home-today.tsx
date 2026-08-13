'use client';

import { useLocale, useTranslations } from 'next-intl';

import { adherenceFraction } from '@/features/portal/adherence';
import { usePlanDayCompletion } from '@/features/weekly-plans/components/plan-day-completion';
import { type Locale } from '@/i18n/routing';

import { TodayRing } from './today-ring';

/**
 * The home screen's own hero: the *open* day's completion figure on the
 * commitment card, plus that day's completed and remaining calories beside
 * it. Despite the name, this is not always today — `page.tsx` now passes
 * whichever day `PlanDayPicker` has selected, so the ring changes when the
 * client steps to another day, the same way `PortalPlan`'s meal list one
 * section down already did. `HomeToday`/`HomeTodayMeal` keep their names
 * because ticking only ever happens on today's own day regardless of which
 * one is open, so "today" still names what this card is *for*, if not
 * always which day it is currently drawing.
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
 * **Only the day's shape crosses into this client component.** The open
 * day's `BoardMeal[]` carries dish, options and rationale nobody on this
 * screen reads — see the same reasoning in `portal-plan.tsx` for why that
 * stays server-only. The page maps each meal down to {@link HomeTodayMeal}
 * before handing it here.
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
 * The commitment card: today's completion ring beside a completed/remaining
 * calorie breakdown. A client component reading the completion context
 * directly — not server props — which is what lets the ring and the
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
    started, or a day the dietitian left empty.

    `TodayRing` does have a null branch of its own — it prints an em dash inside
    the disc — and on the ring that is a far quieter placeholder than the one
    this replaced, which was the same dash at `text-5xl` in `text-black` on an
    otherwise empty white card and read as an unexplained black bar. But a dash
    still only says "no number"; it does not say why, and the calorie legend
    beside it would go on reading "0 kcal completed / 0 kcal remaining / 0 kcal
    planned" about a day nobody was asked about.

    So the whole card stands down together: one sentence, at body size in the
    muted token, in the card shell the ring version uses. The ring's own dash
    still covers the progress tab, which has no legend to contradict.
  */
  if (fraction === null) {
    return (
      <div className="flex min-h-[150px] w-full items-center justify-center rounded-[30px] bg-card px-4 py-4">
        <p className="text-sm text-muted-foreground">{t('noMeals')}</p>
      </div>
    );
  }

  return (
    // Back on its own white card — the ring centred on it, with the
    // completed/remaining pair as one row underneath rather than a column
    // beside it. `text-black`, not `text-white`: the card is opaque again,
    // so the pair reads against `bg-card` rather than the home glow.
    <div className="flex min-h-[150px] w-full flex-col items-center justify-center gap-3 rounded-[30px] bg-card px-4 py-4">
      <TodayRing fraction={fraction} completed={completed} total={total} locale={locale} />

      <div className="flex items-center justify-center gap-4 text-caption text-black">
        {/* Same pair the ring itself is drawn in — the fill for what's done, the soft track for what's left. */}
        <span className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full bg-portal-progress-fill" />
          {t('caloriesCompleted', { value: completedCalories })}
        </span>
        <span className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full bg-portal-progress-track-soft" />
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
