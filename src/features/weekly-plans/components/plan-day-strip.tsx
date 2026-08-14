'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { adherenceFraction, type AdherenceDay } from '@/features/portal/adherence';
import { DayFlame } from '@/features/portal/components/day-flame';
import { TodayFlameCell } from '@/features/portal/components/today-flame-celebration';
import { usePathname, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

import { dayKey } from '../schema';
import { usePlanDayCompletion } from './plan-day-completion';
import { type PlanDaySummary } from '../week';

/**
 * The week, as seven things to tap.
 *
 * Picking a day is a navigation rather than local state, for the same reason the
 * booking form's date strip is (`src/features/portal/components/request-form.tsx`):
 * the day lives in `?day=`, so the server renders only that day's meals. A week
 * of dishes, ingredients and alternatives is a large payload to hand a phone in
 * order to show a seventh of it.
 *
 * Days with nothing planned stay selectable and are only dimmed. A client whose
 * Friday is empty should be able to look at Friday and be told so, not find the
 * day silently unavailable and wonder whether the plan is broken.
 *
 * **The same seven cells the portal draws twice already.** `WeekAdherenceStrip`
 * on the home screen and the progress tab is the design this now follows,
 * down to the mark inside each cell: one row of seven at every width, no fill
 * on an ordinary day, a soft olive cell under today, the word "today" in place
 * of its weekday, and `DayFlame` reporting how that day went. Three strips of
 * seven days on one product that agreed on none of that was the drift worth
 * closing — a client moves between these screens in a session, and a week that
 * changes shape between them reads as three different weeks.
 *
 * The flame is real data, not decoration: `loadPlanPage` reads
 * `client_plan_adherence` over the plan's own seven dates, so a plan for a week
 * that has not happened draws seven `future` marks rather than a fabricated run
 * of kept days.
 *
 * What this strip owns that the other two do not is *selection*, and it spends
 * the fill on it — see the cell below. The date numeral and the has-meals dot
 * are gone with the redesign; the week's dates are stated in the page header
 * above, and an empty day still dims.
 *
 * A fixed seven-column grid, never a scrolling row: every day sits in its own
 * column at every width, so the one being read is never off screen and there
 * is nothing to scroll into view.
 */
export function PlanDayStrip({
  days,
  selectedDay,
}: {
  days: readonly PlanDaySummary[];
  selectedDay: number;
}) {
  const t = useTranslations('portal.plan');
  const tDays = useTranslations('weeklyPlans.days');

  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const completion = usePlanDayCompletion();

  function selectDay(dayOfWeek: number) {
    if (dayOfWeek === selectedDay) return;

    startTransition(() => {
      // `replace`, not `push`: stepping through the week should not mean seven
      // taps of the back button to leave the plan.
      router.replace(`${pathname}?day=${dayOfWeek}`);
    });
  }

  return (
    <div className="space-y-3">
      <div
        role="group"
        aria-label={t('chooseDay')}
        // Choosing a day is a server round-trip, so the wait has to be visible:
        // without this the whole row goes inert on tap with nothing to show for
        // it, which reads as a dead control rather than a loading one.
        aria-busy={isPending}
        className={cn(
          /*
            A fixed seven-column grid, all seven always on screen — the same
            shape `WeekAdherenceStrip` draws. A `flex-1`/`min-w-18` row that
            scrolled once it ran out of room used to live here, but a picker
            a client scrolls sideways to find "today" in trades a solved
            problem (fitting الأربعاء) for a worse one (today off-screen on a
            narrow phone). `gap-1`, not `gap-2`: the columns already share
            the row evenly, so the second pixel was only pushing the
            narrowest phones closer to needing that scroll back.
          */
          'grid grid-cols-7 gap-1 px-0.5 py-1 transition-opacity duration-200',
          isPending && 'opacity-60',
        )}
      >
        {days.map((day) => {
          const active = day.dayOfWeek === selectedDay;
          const planned = day.mealCount > 0;
          const name = tDays(dayKey(day.dayOfWeek));

          const baseAdherence: AdherenceDay = day.adherence ?? {
            date: day.date ?? '',
            weekday: day.dayOfWeek,
            state: 'empty',
            fraction: null,
            completedMeals: 0,
            totalMeals: 0,
          };

          // Only the day this screen actually let someone tick meals on: its
          // flame follows the local, instant count rather than the fraction
          // `loadPlanPage` read before any of today's taps happened. It is the
          // same completed ÷ total the server will store when the write lands,
          // so the arc does not move again when the page revalidates.
          const local = completion?.dayOfWeek === day.dayOfWeek ? completion : null;

          const adherence: AdherenceDay = local
            ? {
                ...baseAdherence,
                fraction: adherenceFraction(local.completedCount, local.totalCount),
                completedMeals: local.completedCount,
                totalMeals: local.totalCount,
              }
            : baseAdherence;

          return (
            <button
              key={day.dayOfWeek}
              type="button"
              disabled={isPending}
              aria-pressed={active}
              aria-label={day.isToday ? `${name} — ${t('today')}` : name}
              onClick={() => selectDay(day.dayOfWeek)}
              className={cn(
                // Fills its own grid column rather than a fixed width, so all
                // seven sit edge to edge with no row wider than the screen.
                // `min-w-0` overrides the flex item's default `min-width:
                // auto` — without it the button refuses to shrink below its
                // label's own natural width, so the label overflows the
                // column instead of the `truncate` span below ever getting
                // narrow enough to clip it with an ellipsis.
                // `px-0.5`, not `px-1`: at seven columns on a narrow phone
                // the two extra pixels a side were the difference between
                // "الخميس" fitting and clipping its own last letter — see the
                // label's own note on `text-[11px]` below for the rest of
                // that budget.
                'flex min-w-0 cursor-pointer flex-col items-center gap-2 rounded-2xl px-0.5 py-2 outline-none transition-all duration-200 ease-[cubic-bezier(.2,.6,.2,1)]',
                // The same focus and press treatment `buttonVariants` gives every
                // other control: a raw <button> otherwise falls back to the UA
                // outline, which is not this system's ring, and to no press cue
                // at all — and a phone has no hover to stand in for one.
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo active:translate-y-px',
                'disabled:cursor-default',
                /*
                  **The fill is the selection, and the label is today.**

                  One cell in the row is filled, and it is the day you are
                  reading — the same soft olive cell the adherence strip puts
                  under today. Today itself is carried by its label instead: the
                  word "اليوم" in olive and semibold, which it already had. The two
                  coincide on open, because the page opens on today whenever today
                  has meals, so the ordinary case looks exactly like the strip
                  this borrows from.

                  Splitting them this way is what lets the selected day be marked
                  without a second treatment on top of the fill. It had an olive
                  ring for a while and the ring is gone: a border around a cell
                  that already contains a ringed flame was two rings inside 72px.
                */
                // White, not the ambient dark foreground: the strip moved up
                // to sit on the home glow (`page.tsx`), directly under the
                // greeting, rather than on the white page column it used to
                // share with the meal list. `active`'s own `bg-secondary`
                // fill is let run at 75% rather than fully opaque, so the
                // glow still reads through the selected cell instead of
                // cutting a flat white tile out of it.
active ? 'bg-white/32 text-white' : 'text-white hover:bg-white/2',
                !planned && !active && 'text-white/45',
              )}
            >
              {/*
                **Every cell says its own weekday, today included.** This row
                used to replace today's name with the word "اليوم", the way the
                adherence strip on the home screen still does — and on a strip
                you *navigate* with, that costs more than it gives. The seven
                cells are how a client finds a particular day, and swapping one
                of the seven names for a different kind of word breaks the run
                they are scanning: الأحد is missing from a row that still has
                six weekday names in it, and the day you were looking for is the
                one cell that no longer answers to its name.

                Today is still marked — it used to be olive *and* semibold,
                never colour alone, so a colourblind reader still got the
                weight even where the colour did not read. Now that every
                label is white on the glow (see the button's own colour note
                above), semibold is the one signal left carrying it, which is
                the same signal the old pairing already leaned on. The mark
                now sits on the name rather than replacing it. The
                `aria-label` on the button still spells out both ("الأحد —
                اليوم"), so nothing is lost to a screen reader, which cannot
                see the weight doing the work here.

                `text-[11px]`, one under `text-caption`'s 12px floor. At seven
                equal columns on a narrow phone, 12px genuinely did not fit
                الخميس — its own last letter clipped under `truncate` rather
                than the guard ever needing to draw an ellipsis. `truncate`
                stays as the actual guard now, and the `aria-label` still
                carries the untruncated name regardless.

                **No `leading-none` here.** `text-caption` already carries its own
                line height, and that height is looser under `:lang(ar)` (1.5
                against Latin's 1.45) exactly because Arabic descends below the
                baseline where Latin does not. Pinning the line box to 1.0 cropped
                the tail of the ي against `truncate`'s `overflow: hidden` — the
                two are only a bug together, which is why the same override
                survives unnoticed on the adherence strip next door, where nothing
                clips it. Still live: الأربعاء and الخميس both descend the same way.
              */}
              <span
                className={cn(
                  'block w-full truncate text-center text-[11px] leading-[1.5]',
                  day.isToday && 'font-semibold',
                )}
              >
                {name}
              </span>

              {/*
                The same flame the home screen and the progress tab draw, from the
                same component and the same table — see `day-flame.tsx`. A day the
                plan never covered has no report to draw, so it falls back to the
                unlit `empty` mark rather than to a gap that would make the row
                ragged.

                Today alone gets the live, reactive cell with its claim
                celebration — `TodayFlameCell` falls back to this same
                `adherence` value and reads `usePlanDayCompletion()` for the
                live count, the same as `WeekAdherenceStrip`'s own today cell
                did before this picker took over drawing the week.
              */}
              {day.isToday ? <TodayFlameCell day={adherence} /> : <DayFlame day={adherence} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
