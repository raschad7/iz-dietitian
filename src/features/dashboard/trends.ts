import { addDays, addMonths, startOfMonth, startOfWeek, type IsoDate } from '@/features/booking/date';

/**
 * The shaping behind the dashboard's two stat cards — buckets and deltas, with
 * no database and no React in sight.
 *
 * It lives apart from `queries.ts` for one reason: **the gaps matter more than
 * the counts.** A month nobody joined and a week nobody booked are the two most
 * informative points a trend can have, and `GROUP BY` cannot return a row for
 * something that did not happen. So the queries return only the buckets that
 * have data, and these functions lay that sparse result over a complete
 * calendar built from the app's own date helpers.
 *
 * Doing the bucketing here rather than in SQL also keeps one definition of a
 * week in the codebase. Postgres `date_trunc('week', …)` is ISO — Monday — and
 * this app's weeks start on Sunday (`startOfWeek`, `weekStartsOn = 0`, used by
 * the calendar and the agenda strip). A chart whose bars were cut on a
 * different day from the week view they link to would be quietly wrong in a way
 * nobody would catch by looking.
 */

/** One point on the clients card's area chart. `month` is the first of the month. */
export type MonthlyClients = {
  month: IsoDate;
  /** Clients whose record was created that month. */
  clients: number;
};

/** One bar on the appointments card. `weekStart` is that week's Sunday. */
export type WeeklyAppointments = {
  weekStart: IsoDate;
  appointments: number;
};

/**
 * How a series ended relative to how it was going.
 *
 * The last bucket against the mean of the ones before it, rather than against
 * the single bucket before it: month-to-month noise in a small clinic is large
 * enough that "down 40%" would fire most months and stop meaning anything.
 * Compared with the run of months behind it, a move is a move.
 *
 * `percent` is null when there is no baseline to divide by — a clinic in its
 * first month, or one whose earlier months were all empty. "Up ∞%" is not a
 * fact, and the card says "no trend yet" instead.
 */
export type Trend = {
  direction: 'up' | 'down' | 'flat';
  /** Absolute, rounded, already a percentage — `12` means 12%. Null when undefined. */
  percent: number | null;
};

/**
 * Below this, a change is called flat.
 *
 * A trend arrow is a claim that something is happening, and a clinic that took
 * on nine clients last month instead of nine-and-a-bit has nothing happening.
 */
const FLAT_BAND_PERCENT = 5;

export function trendOf(values: readonly number[]): Trend {
  if (values.length < 2) return { direction: 'flat', percent: null };

  const latest = values[values.length - 1]!;
  const earlier = values.slice(0, -1);
  const baseline = earlier.reduce((sum, value) => sum + value, 0) / earlier.length;

  if (baseline === 0) return { direction: 'flat', percent: null };

  const change = ((latest - baseline) / baseline) * 100;
  const percent = Math.round(Math.abs(change));

  if (percent < FLAT_BAND_PERCENT) return { direction: 'flat', percent };
  return { direction: change > 0 ? 'up' : 'down', percent };
}

/**
 * The last `count` months ending with the one `today` falls in, each carrying
 * its count from `rows` or zero.
 *
 * `rows` may hold months outside the window and may hold none at all; both are
 * normal — the first is what a clinic with older records returns, the second is
 * a clinic that has taken nobody on since spring.
 */
export function monthlySeries(
  today: IsoDate,
  count: number,
  rows: readonly { month: string; clients: number }[],
): MonthlyClients[] {
  const counts = new Map(rows.map((row) => [row.month, row.clients]));
  const first = addMonths(startOfMonth(today), -(count - 1));

  return Array.from({ length: count }, (_, index) => {
    const month = addMonths(first, index);
    return { month, clients: counts.get(month) ?? 0 };
  });
}

/**
 * The last `count` weeks ending with the one `today` falls in, from a list of
 * per-day counts.
 *
 * Per-day rather than per-week is what the query returns, because the week
 * boundary is this file's business (see the note at the top). Days outside the
 * window are ignored rather than trusted to be absent — the caller decides the
 * window, and a query that over-fetches should not silently add a ninth bar.
 */
export function weeklySeries(
  today: IsoDate,
  count: number,
  rows: readonly { date: string; appointments: number }[],
): WeeklyAppointments[] {
  const first = addDays(startOfWeek(today), -7 * (count - 1));

  const weeks = Array.from({ length: count }, (_, index) => ({
    weekStart: addDays(first, index * 7),
    appointments: 0,
  }));

  const byWeek = new Map(weeks.map((week) => [week.weekStart, week]));

  for (const row of rows) {
    const week = byWeek.get(startOfWeek(row.date as IsoDate));
    if (week) week.appointments += row.appointments;
  }

  return weeks;
}
