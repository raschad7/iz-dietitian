import { ADHERENCE_LEVELS, type AdherenceLevel } from '@/db/schema';
import { addDays, type IsoDate } from '@/features/booking/date';

import { DAYS_PER_WEEK, runEndingAt, weekDates } from './check-ins';

/**
 * Turning a run of daily adherence reports into the shapes the progress tab
 * draws.
 *
 * Pure — no database, no Next.js, no `Date.now()` — for the same reason
 * `check-ins.ts` is: everything time-dependent arrives as the clinic's
 * `today`, so this can be tested directly and two panels on the same screen
 * cannot disagree about which day it is.
 *
 * `weekDates`, {@link DAYS_PER_WEEK} and `runEndingAt` are reused from
 * `./check-ins` rather than restated — all three are already generic over any
 * `IsoDate`, with nothing wellness-specific about them.
 */

export { ADHERENCE_LEVELS, type AdherenceLevel };

/**
 * One day's report, as the reads hand it over.
 *
 * The counts are the measure. `level` rides along for the copy that needs a
 * word — see `client-plan-adherence.ts` — and is never turned back into a
 * number.
 */
export type AdherenceRow = {
  date: IsoDate;
  level: AdherenceLevel;
  completedMeals: number;
  totalMeals: number;
};

/**
 * A day's adherence as the exact fraction it is: completed ÷ total.
 *
 * **The single definition in the app.** Every percentage a client sees — the
 * ring on the progress tab, the flame arc on all three week strips, the week
 * average, the four-week trend, the home screen's ring — resolves to this
 * call, so 1 of 4 meals is 25% on every one of them and cannot be 50% on any.
 *
 * `null` when the day had no meals to tick: a day nobody was asked about is an
 * absence, and the callers keep it out of their averages rather than folding
 * it in as a zero.
 */
export function adherenceFraction(completed: number, total: number): number | null {
  if (total <= 0) return null;

  // Clamped rather than trusted: the database constraints already forbid the
  // out-of-range pair, and a fraction above 1 would overdraw an arc rather
  // than fail visibly.
  return Math.min(Math.max(completed, 0), total) / total;
}

/** The same fraction, read off a row. */
export function rowFraction(row: AdherenceRow): number | null {
  return adherenceFraction(row.completedMeals, row.totalMeals);
}

/**
 * Today's report as the progress tab's ring draws it.
 *
 * Carries the level as well as the fraction because that card says two things
 * at once — a percentage, and a line of encouragement that needs a word rather
 * than a number. Both come off one row, so they cannot describe different days.
 */
export type TodayAdherence = {
  level: AdherenceLevel;
  completedMeals: number;
  totalMeals: number;
  /** completed ÷ total. Never null: a row exists only for a day that had meals. */
  fraction: number;
};

/** Today's row, shaped for that card — null when today has nothing reported yet. */
export function todayAdherenceOf(rows: readonly AdherenceRow[], today: IsoDate): TodayAdherence | null {
  const row = rows.find((candidate) => candidate.date === today);
  if (!row) return null;

  const fraction = rowFraction(row);
  if (fraction === null) return null;

  return {
    level: row.level,
    completedMeals: row.completedMeals,
    totalMeals: row.totalMeals,
    fraction,
  };
}

/**
 * A day's level, from how many of its meals are ticked complete.
 *
 * The one place this fraction turns into a level — `toggleMealCompletion`
 * calls it after every tick, so `client_plan_adherence` never disagrees with
 * the meals it was derived from. `null` when the day has no meals to tick at
 * all, which leaves the day's existing row untouched rather than writing a
 * `missed` nobody could have prevented.
 *
 * It is a **label, not a score**: three words for the encouragement line and
 * the streak's "did this day count" test. Anything that draws a quantity takes
 * {@link adherenceFraction} instead.
 */
export function deriveAdherenceLevel(completed: number, total: number): AdherenceLevel | null {
  if (total <= 0) return null;
  if (completed <= 0) return 'missed';
  if (completed >= total) return 'full';
  return 'partial';
}

/**
 * What a day looks like in the week strip.
 *
 * `today` is its own state rather than a flag on the others, same reasoning
 * as `check-ins.ts`'s `DayState`: the current day draws olive whatever was
 * reported, so no combination of "today and full" has to be resolved by the
 * component.
 */
export type AdherenceDayState = AdherenceLevel | 'empty' | 'today' | 'future';

export type AdherenceDay = {
  date: IsoDate;
  /** 0 = Sunday, matching `weekdayOf`. */
  weekday: number;
  state: AdherenceDayState;
  /**
   * The day's exact adherence, 0–1, or null when nothing was reported.
   *
   * This replaced a `score` out of 10 that only ever held 0, 5 or 10, because
   * the three levels were all it could be derived from. Everything that draws
   * this day — the flame's arc, the ring, the spoken label — reads the
   * fraction, so a 3-of-4 day and a 1-of-4 day no longer look identical.
   */
  fraction: number | null;
  /** The pair the fraction came from, for labels that say "3 of 4 meals". */
  completedMeals: number;
  totalMeals: number;
};

export type WeekAdherence = {
  /** Always seven entries, Sunday first. */
  days: AdherenceDay[];
  /** Days in this week with a report, past or present — any level counts. */
  recordedCount: number;
  /** Days in this week reported as `full` — a stricter count than {@link recordedCount}. */
  fullyCompletedCount: number;
  /** Mean of the week's reported days as a 0–1 fraction, or null when none were reported. */
  averageFraction: number | null;
};

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * A run of days averaged as one number: the mean of each day's own exact
 * fraction.
 *
 * **Per day, not per meal.** A week of one 1-of-4 day and one 4-of-4 day
 * averages to 62.5%, not to the 5-of-8 (62.5% here too, but they diverge the
 * moment the days have different meal counts) a pooled count would give. The
 * card calls this "average adherence", and a day the client kept is a day they
 * kept whether the dietitian planned three meals for it or five — pooling
 * would quietly weight the busiest days heaviest.
 *
 * Days with no meals to tick contribute nothing rather than a zero, the same
 * rule the callers already apply to days with no report at all.
 */
function meanFraction(rows: readonly AdherenceRow[]): number | null {
  return mean(rows.map(rowFraction).filter((fraction): fraction is number => fraction !== null));
}

function stateOf(date: IsoDate, today: IsoDate, row: AdherenceRow | undefined): AdherenceDayState {
  if (date === today) return 'today';
  if (date > today) return 'future';
  if (!row) return 'empty';
  return row.level;
}

/**
 * Whether a level continues an adherence streak. `missed` is an explicit
 * report — it is not the same as a day nobody answered — but it still breaks
 * continuity exactly like an empty day does; only `partial` and `full` keep a
 * run going. See {@link currentAdherenceStreak} and {@link continuityPath}.
 */
function isKept(level: AdherenceLevel): boolean {
  return level !== 'missed';
}

/**
 * One {@link AdherenceDay} per date given, in the order given.
 *
 * Split out of {@link summariseAdherenceWeek} because the meal-plan screen draws
 * the same seven flames over **its** week, and a published plan is not always
 * the week `today` falls in — a client reading next week's plan, or looking back
 * at last week's, gets a strip whose dates the summary below cannot produce
 * (it is hardcoded to `weekDates(today)`, which is the right contract for the
 * progress tab and the wrong one there).
 *
 * `weekday` is the position in `dates` rather than a computed day-of-week. Every
 * caller passes a Sunday-first run of seven, so the two agree — and a caller that
 * passes something else gets an index, which is what the field is used as.
 */
export function adherenceDaysFor(
  dates: readonly IsoDate[],
  rows: readonly AdherenceRow[],
  today: IsoDate,
): AdherenceDay[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));

  return dates.map((date, index) => {
    const row = byDate.get(date);

    return {
      date,
      weekday: index,
      state: stateOf(date, today, row),
      fraction: row ? rowFraction(row) : null,
      completedMeals: row?.completedMeals ?? 0,
      totalMeals: row?.totalMeals ?? 0,
    };
  });
}

/**
 * The week strip and the weekly percentage, derived from one pass over the
 * rows the query returned.
 *
 * `rows` may be sparse, out of order, and may contain dates outside the week;
 * only the seven dates of `today`'s week are read, the same contract
 * `summariseWeek` documents in `check-ins.ts`. Dates after `today` are
 * dropped from the average even if a stray row exists for one, so a future
 * day can never pull the week's number down.
 */
export function summariseAdherenceWeek(rows: AdherenceRow[], today: IsoDate): WeekAdherence {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const dates = weekDates(today);

  const days = adherenceDaysFor(dates, rows, today);

  const recorded = dates
    .filter((date) => date <= today)
    .map((date) => byDate.get(date))
    .filter((row): row is AdherenceRow => Boolean(row));

  const averageFraction = meanFraction(recorded);
  const fullyCompletedCount = recorded.filter((row) => row.completedMeals >= row.totalMeals).length;

  return { days, recordedCount: recorded.length, fullyCompletedCount, averageFraction };
}

/**
 * Consecutive days ending today — or yesterday, when today has no report
 * yet — where the plan was followed at least partially.
 *
 * Grace for an unanswered today is decided by whether **any** report exists
 * for it, but the run itself is only counted over days that were `kept`
 * (`partial` or `full`). That split matters exactly once: a `missed` report
 * logged for today is not "no report yet", so it does not get the grace —
 * the streak reads zero the moment it is tapped, the same day, rather than
 * waiting for tomorrow's rollover. A filter feeding the generic
 * `check-ins.ts` `currentStreak` cannot express that difference, because
 * filtering out today's `missed` row would make it indistinguishable from
 * today simply not having been answered yet.
 */
export function currentAdherenceStreak(rows: AdherenceRow[], today: IsoDate): number {
  const reported = new Set(rows.map((row) => row.date));
  const kept = new Set(rows.filter((row) => isKept(row.level)).map((row) => row.date));

  return runEndingAt(kept, reported.has(today) ? today : addDays(today, -1));
}

/**
 * How many days the continuity card's curve draws.
 *
 * Six, because the axis under it names every point — "منذ ٥ أيام" through
 * "اليوم" — and six labels is what a phone-width card can print without
 * shrinking them below the 12px floor. It is a drawing width, not a limit on
 * what counts: the run itself is still walked back as far as
 * `STREAK_WINDOW_DAYS` allows, so a curve that arrives already high is showing
 * a streak that started before the window.
 */
export const CONTINUITY_DAYS = 6;

/** One day of the continuity path. */
export type ContinuityDay = {
  date: IsoDate;
  /** 0 for today, 1 for yesterday, … — what the axis label is built from. */
  daysAgo: number;
  /** The streak as it stood on this day: consecutive reported days ending here. */
  streak: number;
  /** True when this day itself carries a report. */
  recorded: boolean;
};

/**
 * "مسار الاستمرارية" — the streak as it stood on each of the last
 * {@link CONTINUITY_DAYS} days, oldest first.
 *
 * The curve plots the **run length**, not the day's score. The card it feeds is
 * about continuity, and a card whose headline number is "3 أيام متواصلة" over a
 * line drawn from adherence scores would be two different measures stacked on
 * one another. Plotting the run means the last point *is* the headline number,
 * and a broken streak shows as the line returning to the floor rather than as a
 * dip someone has to interpret.
 *
 * Today gets {@link currentAdherenceStreak}'s grace and no other day does: a
 * report that has not been filed yet at 9am is not a broken streak, but a day
 * that ended with nothing in it — or with an explicit `missed` — is. That
 * asymmetry is what keeps the last point equal to the number printed beside
 * it all day long. `recorded` still reflects **any** report, `missed`
 * included: it answers "did this day get a tap", not "did the run survive
 * it", which is the streak column's question.
 */
export function continuityPath(
  rows: AdherenceRow[],
  today: IsoDate,
  days = CONTINUITY_DAYS,
): ContinuityDay[] {
  const reported = new Set(rows.map((row) => row.date));
  const kept = new Set(rows.filter((row) => isKept(row.level)).map((row) => row.date));

  return Array.from({ length: days }, (_, index) => {
    const daysAgo = days - 1 - index;
    const date = addDays(today, -daysAgo);
    const recorded = reported.has(date);
    const isToday = daysAgo === 0;

    return {
      date,
      daysAgo,
      streak: runEndingAt(kept, recorded || !isToday ? date : addDays(date, -1)),
      recorded,
    };
  });
}

/** One week of the four-week adherence trend. */
export type MonthlyTrendWeek = {
  /** The Sunday this week begins. */
  weekStartDate: IsoDate;
  /** Mean adherence for the week, 0–1, or null when nothing was reported. */
  averageFraction: number | null;
  /** True for the week `today` falls in — the bar the trend card highlights. */
  isCurrent: boolean;
};

export const TREND_WEEKS = 4;

/**
 * The last {@link TREND_WEEKS} calendar weeks, oldest first, each averaged the
 * same way {@link summariseAdherenceWeek} averages one week — over the days
 * that were actually reported, not over all seven.
 */
export function fourWeekTrend(rows: AdherenceRow[], today: IsoDate, weeks = TREND_WEEKS): MonthlyTrendWeek[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const currentWeekStart = weekDates(today)[0] ?? today;

  return Array.from({ length: weeks }, (_, index) => {
    const weekOffset = index - (weeks - 1);
    const weekStartDate = addDays(currentWeekStart, weekOffset * DAYS_PER_WEEK);
    const dates = weekDates(weekStartDate);

    const recorded = dates
      .filter((date) => date <= today)
      .map((date) => byDate.get(date))
      .filter((row): row is AdherenceRow => Boolean(row));

    return {
      weekStartDate,
      averageFraction: meanFraction(recorded),
      isCurrent: weekStartDate === currentWeekStart,
    };
  });
}
