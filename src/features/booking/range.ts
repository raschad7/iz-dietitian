import { addDays, eachDay, monthGridDays, startOfWeek } from './date';
import { type CalendarView } from './schema';

/**
 * Which dates a calendar view needs, and whether one span already holds another.
 *
 * Pure — no React, no database — and deliberately a module of its own rather
 * than part of `page-data.ts`, where `rangeFor` grew up. Both sides of the
 * calendar ask this question now:
 *
 * - the **server** asks it to know what to read (`loadCalendarPage`);
 * - the **client** asks it to know whether it needs to (see `loadedRange` in
 *   `components/calendar.tsx`) — switching from a month to a day inside it is a
 *   view the browser can already draw from the appointments in hand, so it does
 *   so immediately instead of showing a placeholder for the length of a round
 *   trip that would hand back a subset of what it already has.
 *
 * A `'use client'` file cannot import `page-data.ts`, which opens the database
 * on the same line, and two copies of this arithmetic is one of them going
 * stale the next time a view changes shape.
 */

/**
 * The span of dates a view needs loaded — which is not the same as the dates it
 * names: the month grid is padded out to whole weeks, so it shows days either
 * side of the month itself.
 */
export function rangeFor(view: CalendarView, anchorDate: string): { from: string; to: string } {
  if (view === 'day') return { from: anchorDate, to: anchorDate };

  if (view === 'week') {
    const days = eachDay(startOfWeek(anchorDate), 7);
    return { from: days[0] ?? anchorDate, to: days[6] ?? anchorDate };
  }

  const days = monthGridDays(anchorDate);
  return { from: days[0] ?? anchorDate, to: days[days.length - 1] ?? addDays(anchorDate, 41) };
}

/**
 * The span the calendar *loads*, whichever view is on — the month grid around
 * the anchor, which is the widest of the three and contains the other two whole.
 *
 * This is the trick that makes switching view free. Reading the exact span each
 * view draws is the obvious thing to do and it is what made a tab press cost a
 * round trip: a day and a month are different reads, so the browser could not
 * draw the view it had just been asked for without going back to the server for
 * appointments it very nearly already had. Reading the widest of the three every
 * time costs one query over six weeks instead of one over one day — the same
 * indexed range scan, for a clinic's own bookings — and buys the client every
 * view at that anchor at once. Day, week and month then differ only in how the
 * rows in hand are arranged, which is a re-render and nothing more.
 *
 * The navigation still runs, so the URL stays shareable and the data still
 * refreshes; it just no longer has anything the reader is waiting for.
 */
export function loadedRangeFor(anchorDate: string): { from: string; to: string } {
  return rangeFor('month', anchorDate);
}

/**
 * True when `outer` holds the whole of `inner`.
 *
 * A plain string comparison, because ISO dates are zero-padded and therefore
 * sort chronologically — the same property `date.ts` documents and several
 * call sites already lean on.
 */
export function covers(outer: { from: string; to: string }, inner: { from: string; to: string }): boolean {
  return outer.from <= inner.from && inner.to <= outer.to;
}
