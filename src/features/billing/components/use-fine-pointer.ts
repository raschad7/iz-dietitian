'use client';

import { useSyncExternalStore } from 'react';

/**
 * Whether this browser is being driven by a mouse.
 *
 * A drag is a mouse gesture. On a touch screen `dragstart` never fires, so a
 * control that advertised itself as draggable there would be a grip that does
 * nothing — and worse, it would fight the browser's own touch scrolling across
 * the widest part of the screen. `(pointer: fine)` is the honest test for "there
 * is a mouse here".
 *
 * ## `useSyncExternalStore`, not an effect
 *
 * A media query is an external store, and this is the hook for reading one
 * during render — the same construction `DismissibleCallout` uses. Reading it
 * in an effect and calling `setState` is a cascading render the repo's
 * `react-hooks` rule rejects outright.
 *
 * The server snapshot is `false`, so a server render emits the plain,
 * non-draggable control and the affordance arrives at hydration if there is a
 * pointer. That direction matters: an affordance appearing a frame late is
 * fine, one painted and then taken away reads as a bug.
 *
 * Subscribing to the query rather than reading it once also covers the machines
 * this actually changes on — a tablet with a keyboard folio attached or removed
 * mid-shift.
 */

const QUERY = '(pointer: fine)';

function subscribe(onStoreChange: () => void) {
  const query = window.matchMedia(QUERY);
  query.addEventListener('change', onStoreChange);

  return () => query.removeEventListener('change', onStoreChange);
}

function snapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

function serverSnapshot(): boolean {
  return false;
}

export function useFinePointer(): boolean {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
