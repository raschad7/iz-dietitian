'use client';

import { useSyncExternalStore } from 'react';

import { CLOCK_INTERVAL_MS } from './completed';

/**
 * One clock for the whole calendar.
 *
 * Every block decides for itself whether it is completed, but they all ask the
 * same question of the same instant. A timer inside each block would mean forty
 * timers drifting apart by milliseconds and forty independent re-renders; this
 * is one module-level interval, started when the first consumer subscribes and
 * cleared when the last unsubscribes, no matter how many components read it.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`, for two reasons:
 *
 *  - It has a **separate server snapshot**. The server cannot know what time it
 *    is where the user is sitting, so it renders `null` — nothing completed —
 *    and React swaps in the real value after hydration. Guessing on the server
 *    would produce markup that disagrees with the client's first render, which
 *    React reports as a hydration error.
 *  - Subscribing to a ticking external source is exactly what it is for, so
 *    there is no effect calling `setState` and no cascading render.
 */

let currentTick: Date | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

const listeners = new Set<() => void>();

function tick(): void {
  currentTick = new Date();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  if (timer === null) {
    // First subscriber: read the clock straight away so the first paint after
    // hydration is already correct rather than a full interval behind.
    currentTick = new Date();
    timer = setInterval(tick, CLOCK_INTERVAL_MS);
  }

  return () => {
    listeners.delete(listener);

    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
      currentTick = null;
    }
  };
}

/**
 * Must return a stable reference between ticks — a fresh `new Date()` on every
 * call would compare unequal each time and re-render forever.
 */
function getSnapshot(): Date | null {
  return currentTick;
}

/** The server has no local clock to offer, so nothing is completed yet. */
function getServerSnapshot(): Date | null {
  return null;
}

export function useCalendarClock(): Date | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
