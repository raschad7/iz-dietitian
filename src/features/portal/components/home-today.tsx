'use client';

import { useLocale, useTranslations } from 'next-intl';

import { adherenceFraction } from '@/features/portal/adherence';
import { usePlanDayCompletion } from '@/features/weekly-plans/components/plan-day-completion';
import { type Locale } from '@/i18n/routing';

import { TodayEnergyMascot } from './today-energy-mascot';

/**
 * The home screen's own hero: the *open* day's energy-filling mascot on the
 * commitment card. Despite the name, this is not always today — `page.tsx`
 * now passes whichever day `PlanDayPicker` has selected, so the mascot
 * changes when the client steps to another day, the same way `PortalPlan`'s
 * meal list one section down already did. `HomeToday` keeps its name
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
 */

/**
 * The commitment card: today's energy-filling mascot (`TodayEnergyMascot`).
 * A client component reading the completion context directly — not server
 * props — which is what lets the mascot update the instant `MealCheck` flips
 * a meal below, rather than waiting on the next navigation.
 */
function TodayProgress() {
  const locale = useLocale() as Locale;
  const t = useTranslations('portal.progress.today');
  const context = usePlanDayCompletion();

  const total = context?.totalCount ?? 0;
  const completed = context?.completedCount ?? 0;
  const fraction = adherenceFraction(completed, total);

  /*
    **Nothing to report on says so, in words.**

    `adherenceFraction` returns null when the day had no meals to tick, which is
    a real and ordinary state: no plan published yet, a plan whose week has not
    started, or a day the dietitian left empty.

    `TodayEnergyMascot` does have a null branch of its own — it prints an em
    dash instead of a percentage — and that is a far quieter placeholder than
    the one this replaced, which was the same dash at `text-5xl` in
    `text-black` on an otherwise empty white card and read as an unexplained
    black bar. But a dash still only says "no number"; it does not say why.

    So the whole card stands down together: one sentence, at body size in the
    muted token, in the same card shell. `TodayRing`'s own dash still covers
    the progress tab, which has no legend to contradict.
  */
  if (fraction === null) {
    return (
      <div className="flex min-h-[150px] w-full items-center justify-center rounded-[30px] bg-card px-4 py-4">
        <p className="text-sm text-muted-foreground">{t('noMeals')}</p>
      </div>
    );
  }

  return (
    // Back on its own white card — the mascot centred on it, filling the
    // whole card by itself now that the calorie legend row below it is gone.
    <div className="flex min-h-[150px] w-full flex-col items-center justify-center gap-3 rounded-[30px] bg-card px-4 py-4">
      <TodayEnergyMascot fraction={fraction} completed={completed} total={total} locale={locale} />
    </div>
  );
}

export function HomeToday() {
  const tToday = useTranslations('portal.progress.today');

  return (
    <section className="space-y-3">
      <p className="text-sm font-medium text-white">{tToday('heading')}</p>
      <TodayProgress />
    </section>
  );
}
