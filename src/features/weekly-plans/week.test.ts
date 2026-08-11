import { describe, expect, test } from 'bun:test';

import {
  currentSunday,
  dayOfWeekForDate,
  dayStanding,
  formatDateParts,
  nextSunday,
  orderedWeekdays,
  planWeekDays,
  weekDateForDay,
  weekDates,
} from './week';

describe('nextSunday', () => {
  test('returns today when today is Sunday', () => {
    // 2026-08-02 is a Sunday. A dietitian planning on Sunday morning is planning
    // for the week that has just started.
    expect(nextSunday(new Date(2026, 7, 2, 9, 0))).toBe('2026-08-02');
  });

  test('returns the coming Sunday from midweek', () => {
    // Thursday 2026-07-30 → Sunday 2026-08-02.
    expect(nextSunday(new Date(2026, 6, 30, 14, 0))).toBe('2026-08-02');
  });

  test('crosses a month boundary', () => {
    // Monday 2026-08-31 → Sunday 2026-09-06.
    expect(nextSunday(new Date(2026, 7, 31, 10, 0))).toBe('2026-09-06');
  });

  test('does not slip a day for a late evening', () => {
    // The bug this guards: `toISOString()` on 23:30 local in Asia/Hebron renders
    // the previous day, which would plan the wrong week.
    expect(nextSunday(new Date(2026, 6, 30, 23, 30))).toBe('2026-08-02');
  });
});

describe('currentSunday', () => {
  test('returns today when today is Sunday', () => {
    // 2026-08-02 is a Sunday — the week starts today, so it is its own start.
    expect(currentSunday(new Date(2026, 7, 2, 9, 0))).toBe('2026-08-02');
  });

  test('looks back to the Sunday just gone from midweek', () => {
    // Thursday 2026-08-06 belongs to the week that began Sunday 2026-08-02 —
    // NOT to 2026-08-09, which is what nextSunday would answer.
    expect(currentSunday(new Date(2026, 7, 6, 14, 0))).toBe('2026-08-02');
  });

  test('still returns the same start on the last day of the week', () => {
    // Saturday 2026-08-08 is the seventh day of the week that began 2026-08-02.
    expect(currentSunday(new Date(2026, 7, 8, 20, 0))).toBe('2026-08-02');
  });

  test('crosses a month boundary backwards', () => {
    // Wednesday 2026-09-02 → Sunday 2026-08-30.
    expect(currentSunday(new Date(2026, 8, 2, 10, 0))).toBe('2026-08-30');
  });

  test('does not slip a day for a late evening', () => {
    // Same guard as nextSunday: toISOString() on a late local evening in
    // Asia/Hebron renders the previous day, which would name the wrong week.
    expect(currentSunday(new Date(2026, 7, 6, 23, 30))).toBe('2026-08-02');
  });
});

describe('formatDateParts', () => {
  test('zero-pads month and day', () => {
    expect(formatDateParts(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('weekDates', () => {
  test('returns seven consecutive dates from the start', () => {
    expect(weekDates('2026-08-02')).toEqual([
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
      '2026-08-08',
    ]);
  });

  test('crosses a month boundary', () => {
    expect(weekDates('2026-08-30')[6]).toBe('2026-09-05');
  });

  test('returns nothing for a malformed date rather than Invalid Date strings', () => {
    expect(weekDates('not-a-date')).toEqual([]);
    expect(weekDates('2026-02-31')).toEqual([]);
  });
});

describe('flexible plan starts', () => {
  test('reads the weekday from a date without a UTC conversion', () => {
    expect(dayOfWeekForDate('2026-08-05')).toBe(3);
    expect(dayOfWeekForDate('not-a-date')).toBeNull();
  });

  test('orders a Wednesday-starting plan through the following Tuesday', () => {
    expect(orderedWeekdays('2026-08-05')).toEqual([3, 4, 5, 6, 0, 1, 2]);
  });

  test('pairs consecutive dates with their absolute weekday ids', () => {
    expect(planWeekDays('2026-08-05')).toEqual([
      { dayOfWeek: 3, date: '2026-08-05' },
      { dayOfWeek: 4, date: '2026-08-06' },
      { dayOfWeek: 5, date: '2026-08-07' },
      { dayOfWeek: 6, date: '2026-08-08' },
      { dayOfWeek: 0, date: '2026-08-09' },
      { dayOfWeek: 1, date: '2026-08-10' },
      { dayOfWeek: 2, date: '2026-08-11' },
    ]);
  });

  test('looks up a date by weekday after the order wraps', () => {
    expect(weekDateForDay('2026-08-05', 0)).toBe('2026-08-09');
    expect(weekDateForDay('2026-08-05', 2)).toBe('2026-08-11');
  });
});

describe('dayStanding', () => {
  const TODAY = '2026-08-05';

  test('the clinic’s own date is today', () => {
    expect(dayStanding(TODAY, TODAY)).toBe('today');
  });

  test('yesterday is past and tomorrow is future', () => {
    expect(dayStanding('2026-08-04', TODAY)).toBe('past');
    expect(dayStanding('2026-08-06', TODAY)).toBe('future');
  });

  test('compares across months and years without arithmetic', () => {
    // String comparison on zero-padded ISO is chronological, which is the whole
    // reason this takes dates rather than Date objects.
    expect(dayStanding('2026-07-31', '2026-08-01')).toBe('past');
    expect(dayStanding('2027-01-01', '2026-12-31')).toBe('future');
    expect(dayStanding('2026-09-01', '2026-08-31')).toBe('future');
  });

  test('a day either side of today is decided by the date alone', () => {
    // The guard that matters: `today` is a calendar date with no time in it, so
    // there is no hour at which yesterday can still read as today. If this ever
    // takes an instant again, this is the test that will stop it.
    expect(dayStanding('2026-08-05', '2026-08-05')).toBe('today');
    expect(dayStanding('2026-08-05', '2026-08-06')).toBe('past');
    expect(dayStanding('2026-08-05', '2026-08-04')).toBe('future');
  });

  test('an undatable day is past, never today', () => {
    // `date` is null only when the plan's week_start_date is unreadable. A day
    // nobody can place on a calendar must not be the one day that opens for
    // writing.
    expect(dayStanding(null, TODAY)).toBe('past');
  });
});
