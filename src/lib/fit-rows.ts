/**
 * ══ A page of a list is however many rows the frame can hold ══
 *
 * The server half of the fitted-rows contract. The measuring itself is a
 * browser job and lives in [`components/ui/fit-rows.tsx`](../components/ui/fit-rows.tsx),
 * which is where the whole idea is written out; this file holds the two things
 * a **server component** has to be able to call, and holds them apart from that
 * one because a `'use client'` module's exports are client references and
 * cannot be run on the server at all.
 */

export type FitRowsBounds = {
  /**
   * Never ask for fewer than this, however short the window is. Below it the
   * region overflows and the shell scroller takes over, which is the honest
   * outcome for a window too short to hold a usable page.
   */
  min: number;
  /**
   * Never ask for more than this, however tall the window is. A page is also a
   * query, and an unbounded one is how a large monitor becomes a slow screen.
   */
  max: number;
  /** What the server draws before a browser has measured anything. */
  fallback: number;
};

/**
 * The cookie a list's measured row count travels in.
 *
 * One per list, so the register's answer and a card's cannot overwrite one
 * another. It carries a *screen*, not a list state, which is why it is a cookie
 * and not a query parameter — see `FitRows`.
 */
export function rowsCookieName(name: string): string {
  return `q-rows-${name}`;
}

/**
 * The row count the server should page by, read from that cookie.
 *
 * Anything missing, unreadable or out of range falls back to `bounds.fallback`
 * rather than throwing: a hand-edited cookie should draw a register, not a 500.
 */
export function resolveFittedRows(raw: string | undefined, bounds: FitRowsBounds): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) return bounds.fallback;
  return Math.min(bounds.max, Math.max(bounds.min, parsed));
}
