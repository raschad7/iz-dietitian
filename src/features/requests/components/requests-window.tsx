'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * The pending-requests list, bounded to its first N items and scrolled past them.
 *
 * **Why this measures rather than declares a height.** CSS cannot size a box to
 * its first three children, and the three differ: a request with no message, one
 * with a two-line message, and an Arabic one that wraps further all measure
 * differently. The card carried a hand-tuned `38rem` for exactly that reason,
 * which meant "three deep" was true at one width, in one language, for one
 * combination of tiles — and silently wrong everywhere else, showing two and a
 * half or three and a bit.
 *
 * So the window is the block-end edge of the Nth item, read from the layout that
 * actually rendered. Under it the list is unbounded, which is the same thing:
 * with no more items than the window is deep there is nothing to scroll to.
 *
 * `visible` may be fractional. A whole number leaves the last visible tile
 * sitting flush against the bottom edge, which reads as the end of the list; a
 * half tile cut by that edge cannot be read as anything else but "there is
 * more below".
 *
 * `useLayoutEffect` so the measurement lands before paint — a max-height applied
 * a frame late is a visible jump on every dashboard load. A `ResizeObserver` on
 * the list keeps it honest afterwards: the tiles reflow when the column narrows,
 * when a font loads, and when the locale flips, and each of those changes what
 * three items measure.
 *
 * SSR renders unbounded. The server has no layout to measure, and a list that is
 * briefly its full height is a better first paint than one clipped to a guess.
 */
export function RequestsWindow({
  visible,
  count,
  className,
  children,
}: {
  /**
   * How many items fit before the list starts scrolling. May be fractional —
   * `2.5` shows two tiles whole and cuts the third at its half.
   */
  visible: number;
  /** Items in the list — the effect re-measures when this changes. */
  count: number;
  className?: string;
  children: ReactNode;
}) {
  const listRef = useRef<HTMLUListElement>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    // Written straight to the node rather than held in state. The measurement
    // is a fact about the layout that produced it, so feeding it back through a
    // render would re-run the layout it was taken from — and this is exactly
    // the "update an external system" an effect is for.
    if (count <= visible) {
      list.style.maxHeight = '';
      return;
    }

    function measure() {
      if (!list) return;

      const items = Array.from(list.children) as HTMLElement[];
      const first = items[0];
      // A fractional `visible` is the point: the window ends part-way down a
      // tile, so the cut edge itself says the list scrolls, before the fade or
      // the scrollbar has to. `whole` is the last tile shown in full.
      const whole = Math.floor(visible);
      const fraction = visible - whole;
      const last = items[whole - 1];
      if (!first || !last) return;

      // Offsets against the list's own box, so the card's padding and whatever
      // the list is already scrolled to are out of the sum. The gap after the
      // last whole tile is deliberately not included: with no fraction the
      // window ends exactly where that tile does.
      let height = last.offsetTop + last.offsetHeight - first.offsetTop;

      const next = items[whole];
      if (fraction > 0 && next) {
        // The gap is measured rather than assumed — it is `gap-2` on the list
        // today, but this component is handed its layout, not told it.
        const gap = next.offsetTop - (last.offsetTop + last.offsetHeight);
        height += gap + next.offsetHeight * fraction;
      }

      list.style.maxHeight = `${height}px`;
    }

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(list);
    for (const item of Array.from(list.children)) observer.observe(item);

    return () => {
      observer.disconnect();
      list.style.maxHeight = '';
    };
  }, [visible, count]);

  return (
    <ul
      ref={listRef}
      className={cn(
        'flex flex-col gap-2 overflow-y-auto pe-1',
        // Contained only when there is something to contain. `overscroll-contain`
        // holds whether or not the box has anywhere to scroll, so on a queue of
        // three or fewer — which the effect above leaves unbounded — it would
        // stop the wheel without moving anything, making the card a dead patch
        // of the page.
        count > visible && 'overscroll-contain',
        className,
      )}
    >
      {children}
    </ul>
  );
}
