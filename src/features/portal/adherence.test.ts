import { describe, expect, test } from 'bun:test';

import {
  continuityPath,
  currentAdherenceStreak,
  fourWeekTrend,
  summariseAdherenceWeek,
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

function row(date: string, level: AdherenceLevel): AdherenceRow {
  return { date, level };
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
    expect(week.days[0]?.score).toBeNull();
    expect(week.days[1]?.state).toBe('missed');
    expect(week.days[1]?.score).toBe(0);
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
    // (10 + 10 + 0) / 3 / 10
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
