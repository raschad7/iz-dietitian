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
      **A column that holds still, with one scrolling part.** On the home screen
      this is the bottom half of a frame the page has already sized to the
      viewport — see the `.portal-home` note in `globals.css`.
      Everything down to the day's energy line is fixed chrome: the picker has
      to stay reachable while the day it chose is being read, which is the whole
      reason the page stopped scrolling as one document. `min-h-0` at every step
      is what lets the list below actually shrink; without it a flex item refuses
      to go under its content's height and the overflow moves back up to the
      page.

      `gap-8`, not `space-y-8`: the same rhythm, expressed in a way the flex
      column can distribute.
    */
    <div className="flex min-h-0 flex-1 flex-col gap-8 text-start">
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
      <section className="flex min-h-0 flex-1 flex-col gap-4">
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
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1">
              <span className="text-sm">{t('dayEnergyLabel')}</span>
              <span className="font-heading text-lg font-semibold tabular-nums">
                {t('kcalValue', { value: dayKcal })}
              </span>
            </div>

            {/*
              **The one thing on the home screen that scrolls.** A day is five
              meal cards and the frame around it — greeting, commitment card,
              day picker, this day's energy — is all fixed, so the list carries
              the day's overflow by itself instead of pushing the picker off the
              top of a scrolling page. `min-h-0` is load-bearing: a flex item
              will not shrink below its content without it, and the scrollbar
              would appear on the document instead of here.

              `-mx-1 px-1` gives the cards' focus rings and hairlines room
              against the scroll edge, which `overflow-y-auto` would otherwise
              clip.

              `overflow-x-hidden` is explicit rather than left to default:
              setting only `overflow-y` still leaves `overflow-x` computing to
              `auto` per the CSS Overflow spec's visible/non-visible pairing
              rule, so a single card that measured a pixel wider than this
              column — a long badge, an untranslated string — would put a
              second, horizontal scrollbar on the list. Pinning it closed
              instead means that pixel clips rather than growing a bar.
            */}
            <ul className="-mx-1 min-h-0 flex-1 space-y-2 overflow-x-hidden overflow-y-auto px-1 pb-1">
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
