import { useTranslations } from 'next-intl';

import { EmptyState } from '@/components/ui/empty-state';
import { roundForDisplay } from '@/features/weekly-plans/nutrition';

import { PortalMealCard } from './portal-meal-card';
import { PlanDayStrip } from './plan-day-strip';
import type { Board } from '../queries';
import { dayStanding, type PlanDaySummary } from '../week';

/**
 * The client's own view of their published week — rendered on the home
 * screen, directly below today's progress.
 *
 * Three movements, each given room to be one thing: what the week is for, which
 * day is being read, and what that day holds. The dietitian's board is a planning
 * tool that shows a whole week at once; this is a shopping list and a daily
 * reminder, read on a phone, so it shows one day properly rather than seven
 * badly.
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
 * **No completion provider of its own.** The home screen already wraps today's
 * progress ring and the week strip above it in one `PlanDayCompletionProvider`
 * keyed to today — see `plan-day-completion.tsx` and the home page's own doc
 * comment. Mounting a second, independent provider here whenever the selected
 * day is today would let a tick inside this component's meal list and the ring
 * above it drift out of sync, each holding its own copy of "which meals are
 * done". So this component never mounts one itself: `MealCheck`, rendered only
 * when `standing === 'today'`, reaches straight up to that ambient provider,
 * which is only ever mounted for today's own day — the one day this component
 * can also legally be showing `MealCheck` for.
 */
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
  const dayKcal = day ? roundForDisplay('kcal', day.totals.kcal.value) : 0;

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
      **An ordinary block that grows to its content.** This section used to be
      the bottom half of a frame the home page sized to the viewport, with the
      meal list scrolling inside it and the picker pinned above — `flex min-h-0
      flex-1` here, matching `min-h-0` on every wrapper up to the shell, and an
      `overflow-y-auto` on the list. It scrolls with the page now; the ⚠ note
      beside the `.portal-home` rule in `globals.css` has the reasoning.

      `space-y-8` rather than the `gap-8` the flex column took, for the same
      rhythm without the column.
    */
    <div className="space-y-8 text-start">
      {/*
        The picker says what it is for. It is the one control on the home screen
        that changes what the screen shows, and unlabelled it read as a week
        report — seven days with flames on them, next to a card that is a week
        report. Same treatment as the commitment heading one section up
        (`home-today.tsx`), because they are the same kind of line: a quiet
        label naming the block under it.
      */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">{t('chooseDayHeading')}</p>
        <PlanDayStrip days={days} selectedDay={selectedDay} />
      </div>

      {/*
        No day heading here, deliberately.

        It used to repeat the selected day's name and full date directly under
        the strip that had just been tapped to choose them — and the strip marks
        its selection with a solid olive fill and its today with a badge, so the
        heading restated, one line lower, the only two facts already drawn above
        it. What follows the strip is the day's meals, and they start immediately.
      */}
      <section className="space-y-4">
        {meals.length === 0 ? (
          <EmptyState icon="dish" title={t('emptyDayTitle')} description={t('emptyDayHint')} />
        ) : (
          <>
            {/*
              The day's own totals, stated rather than plotted. This is what the
              dietitian planned for the day, not what anyone has eaten — so it is
              labelled as the day's energy and never framed as progress against a
              goal the client has not been measured on.

              **Unfilled.** It sat on the meal surface (`MEAL_SHELL`) and read as
              a sixth card at the top of a list of five — the same material and
              the same radius as the meals under it, but nothing you can open or
              tick. Bare on the page it is what it says it is: a line of type
              stating the day's energy, above the cards that make it up.

              That also settles what used to be a question here: it never tints
              with how the day went, on any day. This is the dietitian's plan for
              the day — a figure that was true before anyone ate anything and
              stays true after — so colouring it by adherence would be reporting
              against it, which is the one thing the label says it is not. With
              no surface left there is nothing to tint at all.
            */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1">
              <span className="text-sm">{t('dayEnergyLabel')}</span>
              <span className="font-heading text-lg font-semibold tabular-nums">
                {t('kcalValue', { value: dayKcal })}
              </span>
            </div>

            {/*
              The day's meals, in the page's own scroll.

              This used to be the single scrolling region on the home screen —
              `min-h-0 flex-1 overflow-y-auto`, carrying the day's overflow so
              the picker above it could stay pinned. It does not any more: the
              list is as tall as the day is long and the window scrolls past it.

              `-mx-1 px-1` stays. It is not scroll-edge padding — it gives the
              cards' focus rings and hairlines room to paint outside the column
              without being clipped by anything upstream.
            */}
            <ul className="-mx-1 space-y-2 px-1 pb-1">
              {meals.map((meal) => (
                <li key={meal.id}>
                  <PortalMealCard meal={meal} standing={standing} completed={completed.has(meal.id)} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
