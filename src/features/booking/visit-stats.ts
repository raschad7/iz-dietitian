import { toUtcInstant } from './date';
import { type ClientVisitEntry } from './queries';

/**
 * What the visit record's summary rail states, derived rather than stored.
 *
 * Pure, and separated from the component that draws it for the usual reason: the
 * only interesting thing here is the arithmetic, and arithmetic in JSX is
 * arithmetic nobody can test. Every field is a fact about the rows handed in —
 * nothing is estimated, and nothing is projected forward.
 *
 * `today` is a parameter, never `new Date()` here: the tab splits past from
 * upcoming against one day chosen by the page, and a second clock read inside
 * this module could disagree with it across midnight.
 */
export type VisitStats = {
  /** Every appointment on the record, past and booked. */
  total: number;
  /** The ones already behind them. */
  completed: number;
  /** Oldest past visit, or `null` for a client seen for the first time next week. */
  firstVisit: string | null;
  /** Most recent past visit. */
  lastVisit: string | null;
  /** Soonest booked visit today or later. */
  nextVisit: string | null;
  /**
   * Mean whole days between consecutive past visits.
   *
   * `null` under two of them, which is the honest answer rather than 0: one
   * visit has no interval, and drawing "every 0 days" from a single row states
   * a cadence the record cannot support.
   *
   * The mean and not the median. A dietitian reads this as "roughly how often",
   * and with the handful of rows a real record holds the median mostly reports
   * one interval verbatim — including the two-month gap where somebody went
   * abroad, which is exactly the outlier a median is usually chosen to reject.
   */
  typicalGapDays: number | null;
  /** Booked minutes across past visits — time actually spent with this client. */
  totalMinutes: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. Negative if `to` is earlier. */
function daysBetween(from: string, to: string): number {
  return Math.round((toUtcInstant(to).getTime() - toUtcInstant(from).getTime()) / MS_PER_DAY);
}

/**
 * `visits` arrives newest first — the order `listClientVisits` returns and the
 * order the tab draws. Nothing here re-sorts it; the two halves are read off the
 * ends instead, so a change to that query's ordering is a change this module
 * would need to hear about.
 */
export function visitStats(visits: readonly ClientVisitEntry[], today: string): VisitStats {
  // A visit *on* today counts as upcoming, not past — the same rule the record
  // header and the tab itself apply, and for the same reason: an appointment
  // earlier this morning is still the one being asked about.
  const upcoming = visits.filter((visit) => visit.date >= today);
  const past = visits.filter((visit) => visit.date < today);

  const gaps: number[] = [];
  // `past` runs newest first, so each step back is one interval. Read forwards
  // or backwards the mean is identical; this direction just avoids a reverse.
  for (let index = 0; index < past.length - 1; index += 1) {
    const later = past[index];
    const earlier = past[index + 1];
    if (later && earlier) gaps.push(daysBetween(earlier.date, later.date));
  }

  return {
    total: visits.length,
    completed: past.length,
    firstVisit: past[past.length - 1]?.date ?? null,
    lastVisit: past[0]?.date ?? null,
    // `upcoming` is newest first like the rest, so the *soonest* is the last one.
    nextVisit: upcoming[upcoming.length - 1]?.date ?? null,
    typicalGapDays:
      gaps.length === 0
        ? null
        : Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length),
    totalMinutes: past.reduce((sum, visit) => sum + visit.durationMinutes, 0),
  };
}
