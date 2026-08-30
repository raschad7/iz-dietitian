'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { type FitRowsBounds, rowsCookieName } from '@/lib/fit-rows';

/**
 * ══ A page of a list is however many rows the frame can hold ══
 *
 * A paged list has two controls that only matter *because* the list is long:
 * the toolbar above it and the pager under it. Both have to be on screen, and
 * the pager is the one that goes missing — it is the last thing in the column,
 * so it is the first thing pushed off the bottom of a short window.
 *
 * The register solved that once by picking a row count that fits "a laptop"
 * (see `CLIENTS_ROWS`). That is a guess about a screen, and it was wrong for
 * every screen shorter than the one it was measured on: a 1366×768 laptop, a
 * 1080p panel at 125% scaling, a browser at 110% zoom, an OS with a tall
 * taskbar. The page then either scrolled — which is the register admitting it
 * does not fit and hiding the pager below the fold — or, where the frame clips,
 * lost the pager altogether.
 *
 * **The fix is to stop guessing and measure.** The frame is bounded and known
 * at runtime; a row's height is known at runtime; the pager's height is known
 * at runtime. How many rows a page holds falls out of the three, and the pager
 * is then always the last thing *inside* the frame rather than the first thing
 * past it. Nothing scrolls, because there is never anything to scroll.
 *
 * ## The contract
 *
 * Three data attributes, marked on the page:
 *
 * | Attribute | On | What it is |
 * |---|---|---|
 * | `data-fit-region` | the bounded box | the height a page of the list gets |
 * | `data-fit-row` | each row | one unit of the list |
 * | `data-fit-footer` | the pager | held at the foot of the region |
 *
 * `data-fit-row` sits on the row rather than on a box around the rows, because
 * "the rows" is not one element in every list this has to serve: the register's
 * are `<tr>`s in a single `<tbody>`, Bills gives each subscriber a `<tbody>` of
 * its own so a two-line record hovers as one unit, and a card's are `<li>`s.
 * Marking the unit works for all three and asks nothing of the markup around it.
 *
 * Everything between the region's block-start edge and the first row — a sticky
 * table header, a caption — is measured rather than declared, so a region can
 * gain furniture without this file learning about it.
 *
 * ⚠ **The region has to be bounded, or there is nothing to fit into.** A column
 * that grows with its content reports its content's height as the space
 * available, and the arithmetic then returns the row count already on screen.
 * The staff shell is bounded from `lg` up (see `.q-app-shell` in globals.css),
 * which is exactly where this applies; below that a page scrolls as one and asks
 * for `fallback` rows, which is exactly the behaviour a phone already had.
 */

/** The width from which the shell is a bounded frame — `lg`, as everywhere. */
const FRAME_QUERY = '(min-width: 64rem)';

/**
 * How many rows to measure before trusting a height.
 *
 * Rows are not all the same height — a two-line name cell is taller than a
 * one-line one — and the tall one is the one a page has to have room for, so
 * this takes the largest of the first few rather than the first.
 */
const SAMPLE = 5;

/*
  `FitRowsBounds` and the cookie's name are imported rather than declared here:
  a server component has to be able to read both, and nothing exported from a
  `'use client'` module can be called on the server. See `lib/fit-rows.ts`.
*/

/**
 * How many rows fit the region this element sits in, or `null` while that
 * cannot be answered — no region, no row to measure, or a region with no height
 * yet.
 */
function measure(anchor: Element, bounds: FitRowsBounds): number | null {
  /*
    Below the frame width there is no frame: the page scrolls as one, which is
    what a phone should do, and there is nothing to fit a page into. `fallback`
    rather than `max` — a phone that had asked for the tallest page this list
    allows would only have made its own scroll longer, and the list it drew
    before any of this existed was `fallback` rows.
  */
  if (!window.matchMedia(FRAME_QUERY).matches) return bounds.fallback;

  const region = anchor.closest<HTMLElement>('[data-fit-region]');
  const rows = region?.querySelectorAll<HTMLElement>('[data-fit-row]');
  const first = rows?.[0];
  if (!region || !rows || !first) return null;

  const available = region.clientHeight;
  if (available <= 0) return null;

  /*
    Everything above the first row: the region's own padding and whatever
    furniture rides between it and them — a sticky table header above all.
    Measured from the live box rather than declared, so a region can gain a
    caption or a summary strip without this file learning about it.
  */
  const above = first.getBoundingClientRect().top - region.getBoundingClientRect().top;

  /*
    Everything below them. The pager is pushed to the foot of the region by
    `mt-auto`, so the space between it and the last row is elastic and counts
    for nothing — only the control's own height is owed room.
  */
  const footer = region.querySelector<HTMLElement>('[data-fit-footer]');
  const below = footer ? footer.getBoundingClientRect().height : 0;

  let rowHeight = 0;
  for (let index = 0; index < SAMPLE; index += 1) {
    const row = rows[index];
    if (!row) break;
    rowHeight = Math.max(rowHeight, row.getBoundingClientRect().height);
  }
  if (rowHeight <= 0) return null;

  const capacity = Math.floor((available - above - below) / rowHeight);
  return Math.min(bounds.max, Math.max(bounds.min, capacity));
}

/**
 * Runs `measure` now, and again whenever the frame or its furniture changes
 * size.
 *
 * A `ResizeObserver` on the region rather than a `resize` listener on the
 * window: the rail folding, a filter chip wrapping to a second line and a
 * zoom step all change the height a page gets without the window changing at
 * all.
 */
function useMeasured(bounds: FitRowsBounds, onChange: (rows: number) => void) {
  const anchor = useRef<HTMLSpanElement>(null);

  /*
    `onChange` is a new function on every render at every call site. Holding it
    in a ref keeps it out of the effect's dependencies, so the observer is
    attached once rather than torn down and rebuilt on each pass.

    Written from an effect rather than during render — a ref is not a render
    value, and React's own lint rule says so. The unconditional effect runs after
    every commit, which is well before any resize callback can read it.
  */
  const handler = useRef(onChange);
  useEffect(() => {
    handler.current = onChange;
  });

  const read = useCallback(() => {
    const element = anchor.current;
    if (!element) return;
    const rows = measure(element, bounds);
    if (rows !== null) handler.current(rows);
  }, [bounds]);

  useEffect(() => {
    const region = anchor.current?.closest('[data-fit-region]');
    if (!region) return;

    read();

    const observer = new ResizeObserver(read);
    observer.observe(region);
    return () => observer.disconnect();
  }, [read]);

  return anchor;
}

/**
 * The probe for a list whose page is a **server** query: the register, and
 * Bills beside it.
 *
 * The count has to reach the server, because the rows themselves do — a browser
 * that quietly drew six of the nine rows it was sent would leave the pager
 * counting pages of nine, and the register two rows short on every page but the
 * last. It travels as a cookie rather than as a query parameter: it describes
 * the screen and not the list, it is the same answer on every paged screen in
 * the app, and a URL copied out of one window has no business carrying that
 * window's height into another.
 *
 * `router.refresh()` re-runs the server component with the new cookie in hand.
 * It fires once per screen size and not once per page: the region's height does
 * not depend on how many rows are in it, so the answer does not move once it
 * has been given.
 *
 * Renders a zero-size `<span>` — it needs a node in the region to measure from,
 * and `hidden` keeps it out of the accessibility tree and out of the layout.
 */
export function FitRows({
  name,
  current,
  bounds,
}: {
  /**
   * Which list this is. One cookie per list — `q-rows-clients` — so the
   * register's answer and a card's cannot overwrite one another.
   */
  name: string;
  /** The row count the server just rendered with, so the probe can tell whether
   *  it has anything to say. */
  current: number;
  bounds: FitRowsBounds;
}) {
  const router = useRouter();
  /*
    What was last asked for. Without it, a refresh that has not landed yet is
    re-measured against the same stale `current` and asks a second time.
  */
  const asked = useRef(current);

  const anchor = useMeasured(bounds, (rows) => {
    if (rows === asked.current) return;
    asked.current = rows;
    document.cookie = `${rowsCookieName(name)}=${rows}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  });

  return <span ref={anchor} hidden aria-hidden />;
}

/**
 * The same measurement for a list whose page is **state** rather than a query —
 * the bill list on a subscriber's Expenses tab, which is handed every row it
 * will ever show and slices them in the browser.
 *
 * No cookie and no refresh: there is nothing for a server to do, so the count
 * is state and the list re-slices in place.
 *
 * Returns the row count, and the anchor to render inside the region.
 */
export function useFittingRows(bounds: FitRowsBounds) {
  const [rows, setRows] = useState(bounds.fallback);
  const anchor = useMeasured(bounds, setRows);
  return { rows, anchor };
}
