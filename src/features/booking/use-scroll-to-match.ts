'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { normalizeForSearch } from '@/features/clients/search';

import { type CalendarAppointment } from './types';

/**
 * Finds the appointment a search is looking for, and brings it into view.
 *
 * Dimming alone answers "who else is on this day?" but not "where is she?" —
 * and on a fitted grid the match is regularly below the fold, or in a week
 * column scrolled off the side. A calendar that dims everything and moves
 * nothing reads as no results at all.
 *
 * Returns the id, so the caller can ring the block as well: the scroll says
 * where it is, the ring says which one it is.
 */

/**
 * How still the search box must be before the grid moves.
 *
 * Dimming stays instant — it costs nothing and it is what makes typing feel
 * responsive. Scrolling is the expensive half: every keystroke of "Sara"
 * matches a different first appointment, and chasing each one lurches the grid
 * four times on the way to a single answer.
 */
const SETTLE_MS = 250;

/**
 * Scrolls asked for in script are not covered by the global
 * `prefers-reduced-motion` rule in `globals.css` — that collapses CSS
 * transitions, and this is neither. It has to be honoured by hand.
 */
function scrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

export function useScrollToMatch(
  query: string,
  appointments: readonly CalendarAppointment[],
  /** The dates currently drawn. Empty in the month view, which has no timeline. */
  days: readonly string[],
): string | null {
  const [settledQuery, setSettledQuery] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => setSettledQuery(query), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  /** The earliest appointment on screen whose client matches. */
  const matchId = useMemo(() => {
    const needle = normalizeForSearch(settledQuery);
    if (!needle) return null;

    // The same normalisation the register searches with, so "sara" finds سارة
    // here exactly as it does in the clients list.
    const matches = appointments
      .filter((row) => days.includes(row.date) && normalizeForSearch(row.clientName).includes(needle))
      // Chronological, so "the first match" means the first one of the range
      // rather than whichever row the query happened to return first.
      .sort((a, b) => (a.date === b.date ? a.startMinute - b.startMinute : a.date < b.date ? -1 : 1));

    return matches[0]?.id ?? null;
  }, [appointments, days, settledQuery]);

  /**
   * The id last actually scrolled to.
   *
   * Refining a search that keeps the same first match must not re-scroll, and
   * neither must the clock ticking, an optimistic write, or any other of the
   * re-renders this calendar does while nobody is typing.
   */
  const scrolledTo = useRef<string | null>(null);

  useEffect(() => {
    if (matchId === null) {
      scrolledTo.current = null;
      return;
    }

    if (scrolledTo.current === matchId) return;

    // Scoped to the timeline, the same way the drag gesture scopes its column
    // lookup: the month grid marks its cells with `data-day`, and anything
    // reaching across both grids is a bug waiting for a view switch.
    const block = document.querySelector<HTMLElement>(
      `[data-timeline] [data-appointment-id="${CSS.escape(matchId)}"]`,
    );

    // Not drawn yet. The ref is left alone deliberately, so the next render
    // tries again rather than recording a scroll that never happened.
    if (!block) return;

    scrolledTo.current = matchId;

    block.scrollIntoView({
      behavior: scrollBehavior(),
      // Centred in the block axis, because what is useful is the appointment
      // *and* the hours either side of it.
      block: 'center',
      // `nearest` in the inline axis, so a week slides sideways only when that
      // day is genuinely off screen. It also needs no RTL branch: the browser
      // resolves "nearest" against the laid-out box, which is already mirrored.
      inline: 'nearest',
    });
  }, [matchId]);

  return matchId;
}
