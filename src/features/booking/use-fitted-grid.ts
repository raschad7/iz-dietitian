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
      const height = entry?.contentRect.height ?? 0;
      if (height <= 0) return;

      const next = fitPxPerSlot(height, hours.openMinute, hours.closeMinute);

      // Ignore sub-pixel churn: a resize observer fires on fractional changes,
      // and re-rendering the whole grid for a tenth of a pixel is pure waste.
      setPxPerSlot((current) => (Math.abs(current - next) < 0.5 ? current : next));
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [hours.closeMinute, hours.openMinute, ref]);

  return pxPerSlot;
}
