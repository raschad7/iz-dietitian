import { CHECK_IN_METRICS, DAY_SCORE_MAX, METRIC_MAX, METRIC_MIN, type CheckInMetric } from '@/db/schema';
import { addDays, eachDay, startOfWeek, type IsoDate } from '@/features/booking/date';

/**
 * Turning a week of check-in rows into the shapes the portal home screen draws.
 *
 * Pure — no database, no Next.js, no `Date.now()`. Everything time-dependent
 * arrives as the clinic's `today`, which is why this module can be tested
 * directly and why two panels on the same screen cannot disagree about which
 * day it is.
 */

/** One day's answers, as the reads hand them over. */
export type CheckInRow = {
  date: IsoDate;
  score: number;
} & Record<CheckInMetric, number | null>;

/**
 * What a day looks like in the week strip.
 *
 * `today` is a state of its own rather than a flag on the others: the current
 * day is drawn olive whatever its score is, so no combination of "complete and
 * today" or "empty and today" has to be resolved in the component.
 */
export type DayState = 'complete' | 'partial' | 'empty' | 'today' | 'future';

export type WeekDay = {
  date: IsoDate;
  /** 0 = Sunday, matching `weekdayOf`. */
  weekday: number;
  state: DayState;
  /** The day's score out of 10, or null when there is no check-in. */
  score: number | null;
};

/**
 * How a metric's week reads against its comfortable middle.
 *
 * Deliberately not a pass/fail: `attention` means the week sat outside the
 * middle of the scale in either direction, which is a prompt to look, not a
 * failure. There is no state below it — see the design system's note that a
 * missed day is information, never red.
 */
export type MetricStatus = 'good' | 'onTrack' | 'attention' | 'none';

export type MetricSummary = {
  metric: CheckInMetric;
  /** Mean of the week's answers on the 1–5 scale, or null when none were given. */
  average: number | null;
  /**
   * The week's answers in day order, nulls kept in place. The sparkline needs
   * the gaps: a week answered on three days is a different shape from three
   * consecutive days, and dropping the nulls would draw them identically.
   */
  trend: (number | null)[];
  status: MetricStatus;
};

export type WeekCheckIns = {
  /** Always seven entries, Sunday first — the clinic's week, as `startOfWeek` defines it. */
  days: WeekDay[];
  /** Days in this week with a check-in, past or present. */
  recordedCount: number;
  /** Mean day score across those, rounded to one decimal, or null. */
  averageScore: number | null;
  /** One entry per {@link CHECK_IN_METRICS} member, in that order. */
  metrics: MetricSummary[];
};

export const DAYS_PER_WEEK = 7;

/**
 * The middle of the 1–5 scale, inclusive — the band a week's average sits in
 * when nothing needs looking at.
 *
 * Both edges matter. Appetite averaging 4.8 is as much a reason for the
 * dietitian to ask a question as appetite averaging 1.2, so this is a band and
 * not a floor.
 */
export const COMFORT_MIN = 2.5;
export const COMFORT_MAX = 4.5;

/** At or above this, inside the band, the week is worth saying something nice about. */
export const GOOD_FROM = 4;

/** The seven dates of the week `today` falls in. */
export function weekDates(today: IsoDate): IsoDate[] {
  return eachDay(startOfWeek(today), DAYS_PER_WEEK);
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/** One decimal, so "9" stays "9" and 8.666… becomes 8.7. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function statusOf(average: number | null): MetricStatus {
  if (average === null) return 'none';
  if (average < COMFORT_MIN || average > COMFORT_MAX) return 'attention';
  return average >= GOOD_FROM ? 'good' : 'onTrack';
}

function stateOf(date: IsoDate, today: IsoDate, row: CheckInRow | undefined): DayState {
  if (date === today) return 'today';
  if (date > today) return 'future';
  if (!row) return 'empty';
  return row.score >= DAY_SCORE_MAX ? 'complete' : 'partial';
}

/**
 * The week strip, the progress ring, and the five summary rows — all derived
 * from one pass over the rows the query returned.
 *
 * `rows` may be sparse, out of order, and may contain dates outside the week;
 * only the seven dates of `today`'s week are read. That keeps the caller free
 * to over-fetch without this function quietly counting a neighbouring week.
 *
 * ISO dates compare correctly as strings, which is what `date > today` relies
 * on — a property of `YYYY-MM-DD` the whole date module already assumes.
 */
export function summariseWeek(rows: CheckInRow[], today: IsoDate): WeekCheckIns {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const dates = weekDates(today);

  const days: WeekDay[] = dates.map((date, index) => ({
    date,
    // The week starts Sunday, so the position in the strip is the weekday.
    weekday: index,
    state: stateOf(date, today, byDate.get(date)),
    score: byDate.get(date)?.score ?? null,
  }));

  const recorded = dates.map((date) => byDate.get(date)).filter((row): row is CheckInRow => Boolean(row));

  const averageScore = mean(recorded.map((row) => row.score));

  const metrics = CHECK_IN_METRICS.map((metric): MetricSummary => {
    const trend = dates.map((date) => byDate.get(date)?.[metric] ?? null);
    const answered = trend.filter((value): value is number => value !== null);
    const average = mean(answered);

    return { metric, average: average === null ? null : round1(average), trend, status: statusOf(average) };
  });

  return {
    days,
    recordedCount: recorded.length,
    averageScore: averageScore === null ? null : round1(averageScore),
    metrics,
  };
}

/**
 * How the progress card should speak this week.
 *
 * The message is banded rather than computed per-day because the copy is
 * encouragement, not a readout — "you are on your way" has to hold for three
 * days and for four, and a phrase per day would be five ways of saying the same
 * thing. The strip and the ring already carry the exact number.
 *
 * No band is a failure state. `empty` invites a first day rather than reporting
 * a zero, which is the design system's rule about missed days applied to words.
 */
export type ProgressTier = 'empty' | 'starting' | 'halfway' | 'strong' | 'full';

export function progressTier(recordedCount: number): ProgressTier {
  if (recordedCount <= 0) return 'empty';
  if (recordedCount >= DAYS_PER_WEEK) return 'full';
  if (recordedCount <= 2) return 'starting';
  if (recordedCount <= 4) return 'halfway';
  return 'strong';
}

/**
 * How far back {@link currentStreak} is willing to count.
 *
 * A cap, not a limit on what counts: a client with an unbroken year would read
 * as 60 days here. It exists so the home screen's query stays one small bounded
 * read rather than growing with the client's history, and 60 is well past the
 * point where the number stops being motivating and starts being a score.
 */
export const STREAK_WINDOW_DAYS = 60;

/**
 * The unbroken run of reported days ending **at** `date`, capped at
 * {@link STREAK_WINDOW_DAYS}. Zero when `date` itself has nothing in it.
 *
 * The strict rule, with no allowance for a day still in progress — that
 * allowance belongs to {@link currentStreak}, which is the only place "today"
 * means anything. Exported because the progress tab's continuity path asks the
 * same question of every day in its window, and two walks that could disagree
 * about what a streak is would be one walk too many.
 */
export function runEndingAt(dates: ReadonlySet<IsoDate>, date: IsoDate): number {
  let cursor = date;
  let count = 0;

  while (dates.has(cursor) && count < STREAK_WINDOW_DAYS) {
    count += 1;
    cursor = addDays(cursor, -1);
  }

  return count;
}

/**
 * Consecutive days ending today — the "18 days running" the progress card shows.
 *
 * **Today not being filled in yet does not end a streak.** It is still today,
 * and a client who checks in every evening should not watch their count reset
 * every morning; the walk starts at yesterday when today has no row. That also
 * means the number is stable across the day rather than dropping to zero at
 * midnight and climbing back at bedtime.
 *
 * `rows` may cover any range and be in any order — only the dates matter, and
 * only the run ending at today or yesterday is counted.
 */
export function currentStreak(rows: { date: IsoDate }[], today: IsoDate): number {
  const seen = new Set(rows.map((row) => row.date));

  return runEndingAt(seen, seen.has(today) ? today : addDays(today, -1));
}

/**
 * A metric answer as a 0–1 position along its scale, for drawing.
 *
 * The 1–5 scale has no zero, so a raw `value / METRIC_MAX` would put the lowest
 * possible answer a fifth of the way up the track instead of at its start.
 */
export function metricFraction(value: number): number {
  const clamped = Math.min(Math.max(value, METRIC_MIN), METRIC_MAX);
  return (clamped - METRIC_MIN) / (METRIC_MAX - METRIC_MIN);
}
