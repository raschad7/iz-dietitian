import { useTranslations } from 'next-intl';

import { EmptyState } from '@/components/ui/empty-state';

import { PortalMealCard } from './portal-meal-card';
import { PlanDayStrip } from './plan-day-strip';
import type { Board } from '../queries';
import { dayStanding, type PlanDaySummary } from '../week';

/**
 * The client's own view of their published week — `PlanDayPicker` and
 * `PortalPlan` below, mounted on the home screen around today's progress
 * card: the picker above it, where the old three-day header glance used to
 * sit, and the meal list beneath it.
 *
 * Two components rather than one, so `page.tsx` can put the commitment card
 * between them; the day chosen up here is what `PortalPlan` reads down there.
 * Together they are still the same three movements: what the week is for,
 * which day is being read, and what that day holds. The dietitian's board is
 * a planning tool that shows a whole week at once; this is a shopping list
 * and a daily reminder, read on a phone, so it shows one day properly rather
 * than seven badly.
 *
 * **Separated by surface, not by rule.** Almost nothing here draws a border. The
 * page is a stack of filled cards and tinted blocks on a sunken canvas, which is
 * what keeps it calm at this density — a divider under every heading and a rule
 * beside every note reads as a form, not as a plan someone wrote for you.
 *
 * Read-only by design, past and future. The alternatives are shown as "you can
 * eat this instead" — the feature that makes a plan survive a real week — but
 * nothing writes back, so the plan the dietitian published stays the plan of
 * record.
 *
 * Everything is drawn from the board. A day with no meals renders as a day with
 * no meals; nothing is invented to fill the space.
 *
 * **No completion provider of its own.** The home screen already wraps the
 * picker, today's progress ring and the meal list in one
 * `PlanDayCompletionProvider` keyed to today — see `plan-day-completion.tsx`
 * and the home page's own doc comment. Mounting a second, independent
 * provider here whenever the selected day is today would let a tick inside
 * `PortalPlan`'s meal list and the ring above it drift out of sync, each
 * holding its own copy of "which meals are done". So neither component
 * mounts one itself: `MealCheck`, rendered only when `standing === 'today'`,
 * reaches straight up to that ambient provider, which is only ever mounted
 * for today's own day — the one day `PortalPlan` can also legally be showing
 * `MealCheck` for.
 */
/**
 * The week picker, on its own: `PlanDayStrip`, unlabelled. Split out of
 * `PortalPlan` so `page.tsx` can mount it above `HomeToday` — where the old
 * three-day header glance used to sit, itself unlabelled — while `PortalPlan`
 * keeps only the day it resolves to and that day's meals.
 */
export function PlanDayPicker({
  days,
  selectedDay,
}: {
  days: readonly PlanDaySummary[];
  selectedDay: number;
}) {
  return <PlanDayStrip days={days} selectedDay={selectedDay} />;
}

export function PortalPlan({
  board,
  days,
  selectedDay,
  completedMealIds,
  today,
}: {
  board: Board;
  days: readonly PlanDaySummary[];
  selectedDay: number;
  /** Which of the selected day's meals are already ticked — see `loadPlanPage`. */
  completedMealIds: readonly string[];
  /** The clinic's own `YYYY-MM-DD`, read once per request — see `loadPlanPage`. */
  today: string;
}) {
  const t = useTranslations('portal.plan');

  const day = board.days.find((candidate) => candidate.dayOfWeek === selectedDay);

  const meals = day?.meals ?? [];

  /*
    Which of the three days this is, and therefore what a meal card may offer.

    Read off the *selected day's own date* rather than its weekday number: a
    published plan is not always the week today falls in, and Thursday is day 4
    whichever week it belongs to. `pickPlanDay` already learned this lesson —
    matching on the number alone would let last week's Thursday be ticked as
    though it were this one.
  */
  const standing = dayStanding(
    days.find((summary) => summary.dayOfWeek === selectedDay)?.date ?? null,
    today,
  );

  const completed = new Set(completedMealIds);

  return (
    /*
      **An ordinary section that grows to its content.**

      ⚠ This was the bottom half of a frame the home page sized to the viewport:
      `flex min-h-0 flex-1` here, `min-h-0` on every wrapper up to the shell,
      and an `overflow-y-auto` on the list below, so the meals scrolled inside
      themselves while the picker and the commitment card above stayed pinned.
      That frame is gone — the home tab scrolls as one document like the other
      four — and the ⚠ note beside the `.portal-home` rule in `globals.css` has
      the reasoning. Nothing here sizes itself to anything now.

      `todayMealsHeading` names the block rather than restating the day: it used
      to repeat the selected day's name and full date directly under
      `PlanDayPicker`'s strip, one section up — and the strip marks its
      selection with a solid olive fill and its today with a badge, so that
      restated, one section lower, the only two facts already drawn above it.
      This is a quiet label instead, the same size as the commitment heading
      above it (`home-today.tsx`) but not white — this section sits on the
      page's own white column, not on the home glow that heading answers to.
    */
    <section className="space-y-4 text-start">
      <p className="text-sm font-medium text-muted-foreground">{t('todayMealsHeading')}</p>

      {meals.length === 0 ? (
        <EmptyState icon="dish" title={t('emptyDayTitle')} description={t('emptyDayHint')} />
      ) : (
        /*
          The day's meals, in the page's own scroll.

          This used to be the single scrolling region on the home screen —
          `min-h-0 flex-1 overflow-y-auto overflow-x-hidden`, carrying the day's
          overflow so the picker above it could stay pinned. It does not any
          more: the list is as tall as the day is long and the window scrolls
          past it, which also retires the `overflow-x-hidden` that was there
          only to stop the CSS Overflow spec's visible/non-visible pairing rule
          growing a second, horizontal bar beside the vertical one.

          The day's own energy total is not here either. It shows once, on the
          commitment card above (`home-today.tsx`), so the list starts directly
          on the meals rather than restating a figure that card already states.

          `-mx-1 px-1` stays. It is not scroll-edge padding — it gives the
          cards' focus rings and hairlines room to paint outside the column
          without being clipped by anything upstream.
        */
        <ul className="-mx-1 space-y-2 px-1 pb-1">
          {meals.map((meal) => (
            <li key={meal.id}>
              <PortalMealCard meal={meal} standing={standing} completed={completed.has(meal.id)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}