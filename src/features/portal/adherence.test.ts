import { describe, expect, test } from 'bun:test';

import {
  adherenceFraction,
  continuityPath,
  currentAdherenceStreak,
  deriveAdherenceLevel,
  fourWeekTrend,
  summariseAdherenceWeek,
  todayAdherenceOf,
  type AdherenceDayState,
  type AdherenceLevel,
  type AdherenceRow,
} from './adherence';

/** Wednesday 5 August 2026. Its week runs Sunday 2nd to Saturday 8th. */
const WEDNESDAY = '2026-08-05';
const SUNDAY = '2026-08-02';
const MONDAY = '2026-08-03';
const TUESDAY = '2026-08-04';
const THURSDAY = '2026-08-06';

/**
 * A day of `completed` meals out of `total`, with its level derived the way
 * the mutation derives it — so a fixture can never describe a day the database
 * could not hold.
 */
function meals(date: string, completed: number, total: number): AdherenceRow {
  const level = deriveAdherenceLevel(completed, total);
  if (!level) throw new Error(`a day of ${total} meals has no level to report`);

  return { date, level, completedMeals: completed, totalMeals: total };
}

/**
 * A day named by its level, for the tests that are about streaks and states
 * rather than percentages. Four meals, because that is the shape the
 * percentages below are easiest to read against: 0 of 4, 2 of 4, 4 of 4.
 */
function row(date: string, level: AdherenceLevel): AdherenceRow {
  const completed = { missed: 0, partial: 2, full: 4 }[level];
  return meals(date, completed, 4);
}

function statesOf(rows: AdherenceRow[], today = WEDNESDAY): AdherenceDayState[] {
  return summariseAdherenceWeek(rows, today).days.map((day) => day.state);
}

describe('summariseAdherenceWeek day states', () => {
  test('separates full, partial, missed, empty, today and future', () => {
    expect(statesOf([row(SUNDAY, 'full'), row(MONDAY, 'partial'), row(TUESDAY, 'missed')])).toEqual([
      'full',
      'partial',
      'missed',
      'today',
      'future',
      'future',
      'future',
    ]);
  });

  test('a full report on today still reads as today, not full', () => {
    expect(statesOf([row(WEDNESDAY, 'full')])[3]).toBe('today');
  });

  test('a day nobody answered is empty, distinct from an explicit missed report', () => {
    const week = summariseAdherenceWeek([row(MONDAY, 'missed')], WEDNESDAY);

    expect(week.days[0]?.state).toBe('empty');
    expect(week.days[0]?.fraction).toBeNull();
    expect(week.days[1]?.state).toBe('missed');
    expect(week.days[1]?.fraction).toBe(0);
  });

  test('ignores rows outside the week rather than counting them', () => {
    const week = summariseAdherenceWeek([row('2026-07-29', 'full'), row(MONDAY, 'full')], WEDNESDAY);

    expect(week.recordedCount).toBe(1);
    expect(week.days).toHaveLength(7);
  });

  test('order of the rows does not matter', () => {
    expect(statesOf([row(TUESDAY, 'missed'), row(SUNDAY, 'full'), row(MONDAY, 'partial')])).toEqual(
      statesOf([row(SUNDAY, 'full'), row(MONDAY, 'partial'), row(TUESDAY, 'missed')]),
    );
  });
});

describe('summariseAdherenceWeek averages', () => {
  test('averages only the days that were reported, as a 0-1 fraction', () => {
    const week = summariseAdherenceWeek([row(SUNDAY, 'full'), row(MONDAY, 'full'), row(TUESDAY, 'missed')], WEDNESDAY);

    expect(week.recordedCount).toBe(3);
    // (100% + 100% + 0%) / 3
    expect(week.averageFraction).toBeCloseTo(0.6667, 3);
  });

  test('an empty week has no average rather than a zero', () => {
    expect(summariseAdherenceWeek([], WEDNESDAY).averageFraction).toBeNull();
  });

  test('a week of partial reports averages to one half', () => {
    const week = summariseAdherenceWeek([row(SUNDAY, 'partial'), row(MONDAY, 'partial')], WEDNESDAY);
    expect(week.averageFraction).toBe(0.5);
  });

  test('a stray future-dated row cannot pull the average down', () => {
    // Nothing in this app writes a future date, but the average is a
    // client-facing number and must not depend on that being true forever.
    const withoutFuture = summariseAdherenceWeek([row(SUNDAY, 'full'), row(MONDAY, 'full')], WEDNESDAY);
    const withFuture = summariseAdherenceWeek(
      [row(SUNDAY, 'full'), row(MONDAY, 'full'), row(THURSDAY, 'missed')],
      WEDNESDAY,
    );

    expect(withFuture.averageFraction).toBe(withoutFuture.averageFraction);
    expect(withFuture.recordedCount).toBe(withoutFuture.recordedCount);
  });
});

describe('summariseAdherenceWeek fullyCompletedCount', () => {
  test('counts only `full` reports, separately from recordedCount', () => {
    const week = summariseAdherenceWeek(
      [row(SUNDAY, 'full'), row(MONDAY, 'partial'), row(TUESDAY, 'missed')],
      WEDNESDAY,
    );

    expect(week.recordedCount).toBe(3);
    expect(week.fullyCompletedCount).toBe(1);
  });

  test('is zero, not null, for a week with reports but no full day', () => {
    const week = summariseAdherenceWeek([row(SUNDAY, 'partial'), row(MONDAY, 'missed')], WEDNESDAY);
    expect(week.fullyCompletedCount).toBe(0);
  });
});

describe('continuityPath', () => {
  test('counts the run up, oldest first, and labels each day by its distance from today', () => {
    const path = continuityPath([row(MONDAY, 'full'), row(TUESDAY, 'partial'), row(WEDNESDAY, 'full')], WEDNESDAY, 4);

    // Sunday, Monday, Tuesday, Wednesday
    expect(path.map((day) => day.streak)).toEqual([0, 1, 2, 3]);
    expect(path.map((day) => day.daysAgo)).toEqual([3, 2, 1, 0]);
    expect(path.map((day) => day.recorded)).toEqual([false, true, true, true]);
  });

  test('a day that ended with nothing in it returns to zero', () => {
    const path = continuityPath([row(SUNDAY, 'full'), row(TUESDAY, 'full')], WEDNESDAY, 4);

    // The Sunday run breaks on Monday rather than carrying across it; Tuesday
    // starts a new one, and today inherits it unfinished.
    expect(path.map((day) => day.streak)).toEqual([1, 0, 1, 1]);
  });

  test('today not being logged yet does not end the run', () => {
    const path = continuityPath([row(MONDAY, 'full'), row(TUESDAY, 'full')], WEDNESDAY, 3);

    expect(path.map((day) => day.streak)).toEqual([1, 2, 2]);
    expect(path.at(-1)?.recorded).toBe(false);
  });

  test('the last point is the number the card prints beside it', () => {
    const rows = [row(MONDAY, 'full'), row(TUESDAY, 'partial'), row(WEDNESDAY, 'full')];

    expect(continuityPath(rows, WEDNESDAY).at(-1)?.streak).toBe(currentAdherenceStreak(rows, WEDNESDAY));
  });

  test('counts a run that started before the window it draws', () => {
    const rows = [row(SUNDAY, 'full'), row(MONDAY, 'full'), row(TUESDAY, 'full')];

    // Two days wide, so Sunday is off the chart — the Tuesday point still
    // knows the run behind it is three days long.
    expect(continuityPath(rows, TUESDAY, 2).map((day) => day.streak)).toEqual([2, 3]);
  });

  test('an explicit missed report breaks the run just like an empty day', () => {
    const path = continuityPath([row(MONDAY, 'full'), row(TUESDAY, 'missed'), row(WEDNESDAY, 'full')], WEDNESDAY, 4);

    // Sunday, Monday, Tuesday, Wednesday — Tuesday's `missed` resets the run,
    // and Wednesday starts a fresh one rather than inheriting Monday's.
    expect(path.map((day) => day.streak)).toEqual([0, 1, 0, 1]);
    // Tuesday still carries a report — it is not the same as an empty day.
    expect(path[2]?.recorded).toBe(true);
  });

  test('partial reports keep the run going, same as full', () => {
    const path = continuityPath([row(MONDAY, 'partial'), row(TUESDAY, 'partial')], WEDNESDAY, 3);

    expect(path.map((day) => day.streak)).toEqual([1, 2, 2]);
  });

  test('fraction reflects each day\'s own adherence, not the run climbing', () => {
    // Monday, Tuesday, Wednesday(today). Monday kept at 1 of 4, Tuesday at
    // 4 of 4 — the streak rises both days, but a lighter Monday must still
    // read lower than a fuller Tuesday.
    const path = continuityPath([meals(MONDAY, 1, 4), meals(TUESDAY, 4, 4)], WEDNESDAY, 3);

    expect(path.map((day) => day.streak)).toEqual([1, 2, 2]);
    expect(path.map((day) => day.fraction)).toEqual([0.25, 1, null]);
  });

  test('an unreported day has no fraction, distinct from an explicit zero', () => {
    // Monday: reported and missed (0). Tuesday: unreported (null).
    // Wednesday (today): reported at 2 of 4 (0.5).
    const path = continuityPath([meals(MONDAY, 0, 4), meals(WEDNESDAY, 2, 4)], WEDNESDAY, 3);

    expect(path.map((day) => day.fraction)).toEqual([0, null, 0.5]);
  });
});

describe('currentAdherenceStreak', () => {
  test('partial reports extend the run, same as full', () => {
    const rows = [row(MONDAY, 'partial'), row(TUESDAY, 'full'), row(WEDNESDAY, 'partial')];
    expect(currentAdherenceStreak(rows, WEDNESDAY)).toBe(3);
  });

  test('an explicit missed report breaks the run ending today, without waiting for tomorrow', () => {
    const rows = [row(MONDAY, 'full'), row(TUESDAY, 'full'), row(WEDNESDAY, 'missed')];
    expect(currentAdherenceStreak(rows, WEDNESDAY)).toBe(0);
  });

  test('a missed day two days back ends the run for what comes after', () => {
    const rows = [row(SUNDAY, 'full'), row(MONDAY, 'missed'), row(TUESDAY, 'full'), row(WEDNESDAY, 'full')];
    expect(currentAdherenceStreak(rows, WEDNESDAY)).toBe(2);
  });

  test('today not being reported at all still gets the grace — unlike an explicit missed', () => {
    const rows = [row(MONDAY, 'full'), row(TUESDAY, 'full')];
    expect(currentAdherenceStreak(rows, WEDNESDAY)).toBe(2);
  });

  test('is zero with nothing reported at all', () => {
    expect(currentAdherenceStreak([], WEDNESDAY)).toBe(0);
  });
});

describe('deriveAdherenceLevel', () => {
  test('none ticked is missed', () => {
    expect(deriveAdherenceLevel(0, 4)).toBe('missed');
  });

  test('all ticked is full', () => {
    expect(deriveAdherenceLevel(4, 4)).toBe('full');
  });

  test('some ticked is partial', () => {
    expect(deriveAdherenceLevel(2, 4)).toBe('partial');
  });

  test('a day with no meals has no level rather than a fabricated missed', () => {
    expect(deriveAdherenceLevel(0, 0)).toBeNull();
  });
});

describe('adherenceFraction', () => {
  test('is completed over total, exactly', () => {
    expect(adherenceFraction(1, 4)).toBe(0.25);
    expect(adherenceFraction(2, 4)).toBe(0.5);
    expect(adherenceFraction(3, 4)).toBe(0.75);
    expect(adherenceFraction(4, 4)).toBe(1);
  });

  test('a day of three meals divides by three, not by four', () => {
    expect(adherenceFraction(1, 3)).toBeCloseTo(0.3333, 4);
    expect(adherenceFraction(2, 3)).toBeCloseTo(0.6667, 4);
  });

  /**
   * The bug this whole measure replaced: every partially-followed day was
   * worth a flat half, so a client who ate three of their four meals and one
   * who ate one read the same number on every screen.
   */
  test('two partial days of the same size are not the same number', () => {
    expect(adherenceFraction(1, 4)).not.toBe(adherenceFraction(3, 4));
  });

  test('a day with no meals has no fraction rather than a zero', () => {
    expect(adherenceFraction(0, 0)).toBeNull();
  });

  test('clamps a pair the database constraints already forbid', () => {
    expect(adherenceFraction(5, 4)).toBe(1);
    expect(adherenceFraction(-1, 4)).toBe(0);
  });
});

describe('the day the week strip draws', () => {
  test('carries the exact fraction and the meals behind it', () => {
    const week = summariseAdherenceWeek([meals(SUNDAY, 1, 4), meals(MONDAY, 2, 3)], WEDNESDAY);

    expect(week.days[0]?.fraction).toBe(0.25);
    expect(week.days[0]?.completedMeals).toBe(1);
    expect(week.days[0]?.totalMeals).toBe(4);
    expect(week.days[1]?.fraction).toBeCloseTo(0.6667, 4);
  });

  test('averages days of different sizes per day, not per meal', () => {
    // 25% and 100%, not 5 of 8.
    const week = summariseAdherenceWeek([meals(SUNDAY, 1, 4), meals(MONDAY, 4, 4)], WEDNESDAY);

    expect(week.averageFraction).toBe(0.625);
  });

  test('a fully completed day counts whatever its meal count', () => {
    const week = summariseAdherenceWeek([meals(SUNDAY, 3, 3), meals(MONDAY, 3, 4)], WEDNESDAY);

    expect(week.fullyCompletedCount).toBe(1);
  });
});

describe('todayAdherenceOf', () => {
  test('is the exact fraction of today, with the pair it came from', () => {
    const today = todayAdherenceOf([meals(MONDAY, 4, 4), meals(WEDNESDAY, 1, 4)], WEDNESDAY);

    expect(today).toEqual({ level: 'partial', completedMeals: 1, totalMeals: 4, fraction: 0.25 });
  });

  test('is null when today has nothing reported, rather than a zero day', () => {
    expect(todayAdherenceOf([meals(MONDAY, 4, 4)], WEDNESDAY)).toBeNull();
  });
});

describe('fourWeekTrend', () => {
  test('returns four weeks, oldest first, with the current week last', () => {
    const trend = fourWeekTrend([row(SUNDAY, 'full')], WEDNESDAY);

    expect(trend).toHaveLength(4);
    expect(trend[3]?.weekStartDate).toBe(SUNDAY);
    expect(trend[3]?.isCurrent).toBe(true);
    expect(trend.slice(0, 3).every((week) => !week.isCurrent)).toBe(true);
  });

  test('a week nobody reported in has no average', () => {
    const trend = fourWeekTrend([row(SUNDAY, 'full')], WEDNESDAY);
    expect(trend[0]?.averageFraction).toBeNull();
    expect(trend[3]?.averageFraction).toBe(1);
  });

  test('a stray future-dated row in the current week cannot pull its average down', () => {
    const withoutFuture = fourWeekTrend([row(SUNDAY, 'full'), row(MONDAY, 'full')], WEDNESDAY);
    const withFuture = fourWeekTrend(
      [row(SUNDAY, 'full'), row(MONDAY, 'full'), row(THURSDAY, 'missed')],
      WEDNESDAY,
    );

    expect(withFuture[3]?.averageFraction).toBe(withoutFuture[3]?.averageFraction);
  });
});
