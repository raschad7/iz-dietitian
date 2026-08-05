'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useTransition } from 'react';

import { DayFlame } from '@/features/portal/components/day-flame';
import { usePathname, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

import { dayKey } from '../schema';
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
 * The row scrolls sideways rather than squeezing seven cells into a phone, which
 * means the open day can start off screen — so it is scrolled into view. Both
 * the ref and the effect are here rather than in a hook: this is nine lines
 * about one row, and `use-scroll-to-match.ts` next door is a different problem
 * (a debounced search over a two-dimensional grid), not a generalisation of it.
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

  const rowRef = useRef<HTMLDivElement | null>(null);
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const row = rowRef.current;
    const cell = selectedRef.current;

    // Nothing to do when the whole week already fits, which is every desktop and
    // most tablets — `scrollIntoView` on a row that does not scroll is a no-op
    // horizontally but can still nudge the page vertically, so it is skipped
    // outright rather than relied on to do nothing.
    if (!row || !cell || row.scrollWidth <= row.clientWidth) return;

    cell.scrollIntoView({
      // Scrolls asked for in script are not covered by the global
      // `prefers-reduced-motion` rule in `globals.css` — that collapses CSS
      // transitions, and this is neither. It has to be honoured by hand, the
      // same way `use-scroll-to-match.ts` does it.
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      // `nearest` in the block axis so the page never scrolls vertically to
      // satisfy a sideways move; `center` inline so the chosen day lands with
      // its neighbours either side of it rather than flush against an edge.
      // Neither needs an RTL branch — the browser resolves both against the
      // laid-out box, which is already mirrored.
      block: 'nearest',
      inline: 'center',
    });
  }, [selectedDay]);

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
      <p className="font-heading text-base font-medium">{t('chooseDay')}</p>

      <div
        role="group"
        aria-label={t('chooseDay')}
        // Choosing a day is a server round-trip, so the wait has to be visible:
        // without this the whole row goes inert on tap with nothing to show for
        // it, which reads as a dead control rather than a loading one.
        aria-busy={isPending}
        ref={rowRef}
        className={cn(
          /*
            One row, scrolling when it has to.

            A seven-column grid fitted every day into about 45px on a phone, which
            is enough for the flame and not enough for الأربعاء — the cells ended
            up touching, and the names went right to their edges. Arabic weekday
            names are full words (Intl's `short` form for `ar` is identical to
            `long`, not a three-letter abbreviation), so the fix is to stop
            fitting: each cell takes a real minimum width and the row scrolls
            sideways when seven of them do not fit.

            `flex-1` with `min-w-18` is what makes that one rule instead of two —
            the cells grow to fill a desktop's width and refuse to shrink past
            72px on a phone, and `min-width` beating `flex-shrink` is what turns
            the overflow into a scroll. `py-1` keeps the focus ring from being
            clipped by that scroll container.
          */
          'flex gap-2 overflow-x-auto px-0.5 py-1 transition-opacity duration-200',
          isPending && 'opacity-60',
        )}
      >
        {days.map((day) => {
          const active = day.dayOfWeek === selectedDay;
          const planned = day.mealCount > 0;
          const name = tDays(dayKey(day.dayOfWeek));

          return (
            <button
              key={day.dayOfWeek}
              type="button"
              disabled={isPending}
              aria-pressed={active}
              aria-label={day.isToday ? `${name} — ${t('today')}` : name}
              onClick={() => selectDay(day.dayOfWeek)}
              ref={active ? selectedRef : null}
              className={cn(
                // 72px minimum and growing, so a weekday name has room to sit
                // inside its own cell rather than running edge to edge, and every
                // day clears the 44px touch minimum comfortably.
                'flex min-w-18 flex-1 cursor-pointer flex-col items-center gap-2 rounded-2xl px-1 py-2 outline-none transition-all duration-200 ease-[cubic-bezier(.2,.6,.2,1)]',
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
                active ? 'bg-secondary text-secondary-foreground' : 'hover:bg-muted',
                !planned && !active && 'text-muted-foreground',
              )}
            >
              {/*
                Today says "today" rather than its weekday, exactly as the
                adherence strip does — the word is what someone scans this row
                for, and now the only thing that marks it, since the fill has gone
                to the selected day. Olive *and* semibold: a signal carried by
                colour alone is one a colourblind reader does not get.

                `text-caption` is 12px, the scale's floor. `truncate` is a guard
                rather than a working state at 72px, and the `aria-label` on the
                button carries the untruncated name regardless.

                **No `leading-none` here.** `text-caption` already carries its own
                line height, and that height is looser under `:lang(ar)` (1.5
                against Latin's 1.45) exactly because Arabic descends below the
                baseline where Latin does not. Pinning the line box to 1.0 cropped
                the tail of the ي in "اليوم" against `truncate`'s `overflow:
                hidden` — the two are only a bug together, which is why the same
                override survives unnoticed on the adherence strip next door,
                where nothing clips it.
              */}
              <span
                className={cn(
                  'w-full truncate text-center text-caption',
                  day.isToday && 'font-semibold text-primary',
                )}
              >
                {day.isToday ? t('today') : name}
              </span>

              {/*
                The same flame the home screen and the progress tab draw, from the
                same component and the same table — see `day-flame.tsx`. A day the
                plan never covered has no report to draw, so it falls back to the
                unlit `empty` mark rather than to a gap that would make the row
                ragged.
              */}
              <DayFlame
                day={
                  day.adherence ?? {
                    date: day.date ?? '',
                    weekday: day.dayOfWeek,
                    state: 'empty',
                    score: null,
                  }
                }
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
