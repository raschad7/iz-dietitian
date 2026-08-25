'use client';

import { useCallback, useEffect, type RefObject } from 'react';
import { useTranslations } from 'next-intl';

import { Icon } from '@/components/ui/icon';

/**
 * A chevron on each edge of the board, each one a day-group forward or back.
 *
 * The board is a swipe surface below 72rem of frame, and a swipe was the only
 * way to reach the rest of the week. That is a gesture a trackpad does badly, a
 * mouse does not do at all, and nothing on screen was asking for — the fade at
 * the trailing edge said the days continued and offered no way to get to them.
 *
 * ── What a press does ──
 *
 * One press moves by exactly the number of whole days on screen, which the
 * board already knows: `--planner-days` is the same figure the column widths
 * are derived from, so a press lands the next group flush against the rail the
 * way a swipe does. `scrollIntoView` rather than arithmetic on `scrollLeft`,
 * because it reads `scroll-padding-inline-start` — the inset that keeps a day
 * out from under the frozen rail — and because it is the one scrolling API that
 * is not wrong about `scrollLeft` in Arabic.
 *
 * ── What keeps them in step ──
 *
 * `data-at-start` and `data-at-end` go on the frame rather than on the buttons,
 * because the fade answers to them too: there is no reason to veil a last
 * column that is already fully on screen. They are read from `scrollLeft` on
 * every scroll and on every resize, with a pixel of tolerance for the
 * fractional column widths the sum produces.
 */
export function WeekPager({
  frameRef,
  scrollRef,
}: {
  /** The size container, which carries the two state attributes. */
  frameRef: RefObject<HTMLDivElement | null>;
  /** The scrollport itself. */
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const t = useTranslations('weeklyPlans');

  const sync = useCallback(() => {
    const frame = frameRef.current;
    const scroll = scrollRef.current;
    if (!frame || !scroll) return;

    /*
      `Math.abs`, because Arabic reports this as a negative offset from the
      right-hand edge. Every engine this app supports has agreed on that since
      2021; the older `scrollWidth - clientWidth` convention is what the
      absolute value normalises away.
    */
    const travelled = Math.abs(scroll.scrollLeft);
    const total = scroll.scrollWidth - scroll.clientWidth;

    /*
      2px of slack at each end, not 1.

      Every width on this board is fractional — the day columns divide what is
      left of the frame after the rail and six gutters, and the browser rounds
      each of the seven to the device pixel grid. The rounding does not cancel:
      on a display whose ratio is not a whole number the sum of the columns and
      the scrollport's own `scrollWidth` can disagree by more than a pixel, and
      a scroll that has visibly reached the last day reports itself a pixel and
      a half short of the end. With a 1px tolerance that is a chevron pointing
      at a week that will not move any further — the state this control exists
      to *not* be in. Two pixels is still far too small to swallow a real day.
    */
    frame.dataset.atStart = travelled <= 2 ? 'true' : 'false';
    frame.dataset.atEnd = total - travelled <= 2 ? 'true' : 'false';
  }, [frameRef, scrollRef]);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;

    sync();
    scroll.addEventListener('scroll', sync, { passive: true });
    /*
      `scrollend` as well as `scroll`, for the last frame of a smooth scroll.

      A press on a chevron animates the scrollport, and the final `scroll` event
      of that animation can be dispatched before the position settles on its
      resting value — so the run that decides whether this was the last group
      reads a figure a pixel or two short of where the board actually stopped.
      `scrollend` fires once, after it has stopped, and is the only event that
      is guaranteed to see the number a reader is looking at.
    */
    scroll.addEventListener('scrollend', sync, { passive: true });

    /*
      The frame's width decides how many days are on screen, so a resize can
      turn a board that overflowed into one that does not — and the scroll event
      never fires for that. The grid is watched as well as the scrollport,
      because the two do not always move together: a slot added or removed
      changes the grid's height and can change its width when the row template
      does, without the frame ever resizing.
    */
    const observer = new ResizeObserver(sync);
    observer.observe(scroll);
    const grid = scroll.querySelector('.planner-week-grid');
    if (grid) observer.observe(grid);

    return () => {
      scroll.removeEventListener('scroll', sync);
      scroll.removeEventListener('scrollend', sync);
      observer.disconnect();
    };
  }, [scrollRef, sync]);

  const step = useCallback(
    (towards: 'start' | 'end') => {
      const scroll = scrollRef.current;
      const grid = scroll?.querySelector<HTMLElement>('.planner-week-grid');
      if (!scroll || !grid) return;

      const columns = Array.from(
        grid.querySelectorAll<HTMLElement>('.planner-day-column'),
      ).filter((column) => column.getBoundingClientRect().width > 0);
      if (columns.length === 0) return;

      const days =
        Number.parseInt(getComputedStyle(grid).getPropertyValue('--planner-days'), 10) || 1;

      /*
        Which day is leading right now. In Arabic the frame's start edge is its
        right one, so the offset of a column from the start of the board is the
        distance from that edge — mirrored, not translated.
      */
      const rtl = getComputedStyle(scroll).direction === 'rtl';
      const frame = scroll.getBoundingClientRect();
      const offsets = columns.map((column) => {
        const box = column.getBoundingClientRect();
        return rtl ? frame.right - box.right : box.left - frame.left;
      });

      // The first column not yet behind the frozen rail, which is the one a
      // reader would call "the day I am looking at".
      const railEdge = Number.parseFloat(getComputedStyle(scroll).scrollPaddingInlineStart) || 0;
      const leading = Math.max(
        0,
        offsets.findIndex((offset) => offset >= railEdge - 1),
      );

      const target = Math.min(
        columns.length - 1,
        Math.max(0, leading + (towards === 'end' ? days : -days)),
      );

      columns[target]?.scrollIntoView({ inline: 'start', block: 'nearest', behavior: 'smooth' });
    },
    [scrollRef],
  );

  /*
    Both are rendered every time and hidden by CSS, which is what keeps this
    component out of the business of deciding. `display: none` until the frame
    says `data-at-start="false"` or `data-at-end="false"` — attributes that only
    exist once `sync` has run — so a server pass ships two controls that are not
    on screen, cannot be focused and are not announced, rather than two controls
    guessing at a scroll position no server has.
  */
  return (
    <>
      <button
        type="button"
        data-towards="start"
        className="planner-week-pager"
        aria-label={t('previousDays')}
        onClick={() => step('start')}
      >
        <Icon name="chevronStart" className="size-5" />
      </button>

      <button
        type="button"
        data-towards="end"
        className="planner-week-pager"
        aria-label={t('nextDays')}
        onClick={() => step('end')}
      >
        <Icon name="chevronEnd" className="size-5" />
      </button>
    </>
  );
}
