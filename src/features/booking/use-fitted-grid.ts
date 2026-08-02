'use client';

import { useEffect, useState, type RefObject } from 'react';

import { PX_PER_SLOT, fitPxPerSlot } from './geometry';
import { type ClinicHours } from './validation';

/**
 * Sizes a slot so the whole clinic day fits the space the grid has been given.
 *
 * An 08:00–18:00 day at the default 32px per slot is 1280px tall, which no
 * laptop shows at once — so the grid used to need a scrollbar and the hours ran
 * off the bottom. Measuring the container instead and dividing the day into it
 * means the timeline always ends where the panel ends: no scrollbar, every hour
 * on screen.
 *
 * Returns `PX_PER_SLOT` until the first measurement lands, so the server and the
 * first client render agree and there is no hydration mismatch. The observer
 * only ever calls `setState` from its callback, never synchronously while the
 * effect is running.
 */
export function useFittedSlotHeight(ref: RefObject<HTMLElement | null>, hours: ClinicHours): number {
  const [pxPerSlot, setPxPerSlot] = useState(PX_PER_SLOT);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      /*
        Floored, and that is what keeps the grid inside its container.

        The slot height is this divided by the number of slots, and the columns
        are drawn at slot height × slots — so measuring 900.4 and drawing 900.4
        is half a pixel of overflow, and a scrollbar. Flooring first means the
        grid is at most the container's height and never more.

        It also removes the need for a sub-pixel tolerance. That tolerance used
        to be the bigger version of the same bug: allowing the slot height to lag
        by up to 0.5px let the grid stand up to 0.5px × slots — twenty pixels on
        a ten-hour day — taller than the space it was fitted to. A whole-pixel
        measurement only changes when the panel really changes, so there is no
        churn left to absorb.
      */
      const height = Math.floor(entry?.contentRect.height ?? 0);
      if (height <= 0) return;

      const next = fitPxPerSlot(height, hours.openMinute, hours.closeMinute);

      setPxPerSlot((current) => (current === next ? current : next));
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [hours.closeMinute, hours.openMinute, ref]);

  return pxPerSlot;
}
