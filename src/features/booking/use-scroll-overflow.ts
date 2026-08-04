'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Whether a scroll container is hiding any of the things worth seeing below its
 * fold, and a way to go and look at them.
 *
 * The timeline is normally fitted to its panel and does not scroll at all — but
 * `fitPxPerSlot` floors at `MIN_PX_PER_SLOT`, because a ruler too fine to read
 * is worse than a short scroll. A long clinic day on a laptop, and very nearly
 * any clinic day on a phone, therefore ends up taller than the space it was
 * given. The scrollbar is hidden (`no-scrollbar`) to keep the grid clean, which
 * is exactly what leaves the afternoon gone with nothing to say it is there.
 *
 * ## Why it counts items rather than pixels
 *
 * "Can this scroll?" and "is anything down there?" are different questions, and
 * only the second is worth interrupting someone about. A clinic that closes at
 * six and books nobody after two has four hours of empty grid below the fold
 * every afternoon; an arrow pointing at them promises something to see and
 * delivers blank rules. It would also be showing all day, every day, which is
 * how a cue stops being read at all.
 *
 * So the container is measured for its edge and the *items* are measured
 * against it. A selector rather than the appointments themselves, because this
 * needs to know what counts as content — not what an appointment is.
 */

/**
 * Sub-pixel slack.
 *
 * The fitted grid lands within a pixel of its container by design, and a
 * measurement rounding either side of the edge would blink the cue on and off
 * while nothing was moving.
 */
const EDGE_TOLERANCE_PX = 4;

/**
 * How far one press travels — most of a screen, not all of it.
 *
 * The overlap is the point: a full-screen jump leaves nothing shared between
 * the two views, so the reader has to find their place again. Keeping a strip
 * of the previous screen makes the new position readable at a glance.
 */
const PAGE_FRACTION = 0.8;

export type ScrollOverflow = {
  hasMoreBelow: boolean;
  scrollDown: () => void;
};

export function useScrollOverflow(
  ref: RefObject<HTMLElement | null>,
  /** What counts as something worth scrolling to. */
  itemSelector: string,
): ScrollOverflow {
  const [hasMoreBelow, setHasMoreBelow] = useState(false);
  const frame = useRef(0);

  const measure = useCallback(() => {
    /*
      Coalesced to one read per frame. Every measurement below forces layout,
      and both callers can fire far more often than the page paints — a scroll
      does, and so does a drag, which re-renders the calendar on every pointer
      move.
    */
    if (frame.current) return;

    frame.current = requestAnimationFrame(() => {
      frame.current = 0;

      const element = ref.current;
      if (!element) return;

      const fold = element.getBoundingClientRect().bottom;

      /*
        An item counts as below only when it *starts* below the fold. One that
        merely runs past it has its top edge — and so the client's name and the
        time — already on screen and already read; pointing down at the rest of
        a block someone is looking at is noise.
      */
      const below = Array.from(element.querySelectorAll<HTMLElement>(itemSelector)).some(
        (item) => item.getBoundingClientRect().top >= fold - EDGE_TOLERANCE_PX,
      );

      setHasMoreBelow((current) => (current === below ? current : below));
    });
  }, [itemSelector, ref]);

  /**
   * Changes nothing re-rendered: the reader scrolls, or the panel resizes.
   *
   * The container *and* its children are observed. The container answers "did
   * the panel resize?"; the children answer "did the grid?" — which is the case
   * that actually matters, because the fitted slot height changes the
   * timeline's own height without touching the box around it, and an observer
   * on the container alone would never hear about it.
   */
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    element.addEventListener('scroll', measure, { passive: true });

    const resize = new ResizeObserver(measure);
    resize.observe(element);
    for (const child of Array.from(element.children)) resize.observe(child);

    return () => {
      element.removeEventListener('scroll', measure);
      resize.disconnect();
    };
  }, [measure, ref]);

  /**
   * And everything that *is* re-rendered: a booking added, moved to another
   * hour, dragged to another day, or rolled back when the server refused it.
   *
   * None of those resize anything — the blocks are absolutely positioned — so
   * no observer can see them. What they all have in common is that the calendar
   * re-renders, which is the signal, so this runs on every render rather than
   * watching the DOM for the same information second-hand.
   */
  useEffect(measure);

  /** The frame may still be pending when the view changes underneath it. */
  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const scrollDown = useCallback(() => {
    const element = ref.current;
    if (!element) return;

    element.scrollBy({
      top: element.clientHeight * PAGE_FRACTION,
      // Honoured by hand: the global `prefers-reduced-motion` rule collapses
      // CSS transitions, and a scroll asked for in script is not one.
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }, [ref]);

  return { hasMoreBelow, scrollDown };
}
