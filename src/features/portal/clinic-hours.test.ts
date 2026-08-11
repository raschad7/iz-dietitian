import { describe, expect, test } from 'bun:test';

import {
  formatClockMinute,
  formatWorkingDays,
  weekdayName,
  weekdayRuns,
  workingHourRuns,
} from './clinic-hours';

describe('weekdayRuns', () => {
  test('collapses the default Sunday–Thursday week into one range', () => {
    expect(weekdayRuns([0, 1, 2, 3, 4])).toEqual([{ from: 0, to: 4 }]);
  });

  test('keeps separate stretches separate', () => {
    expect(weekdayRuns([0, 1, 4])).toEqual([
      { from: 0, to: 1 },
      { from: 4, to: 4 },
    ]);
  });

  test('joins across the end of the week, because Saturday and Sunday are adjacent', () => {
    // Friday, Saturday, Sunday is three days in a row, not "Sunday, and also
    // Friday to Saturday".
    expect(weekdayRuns([5, 6, 0])).toEqual([{ from: 5, to: 0 }]);
  });

  test('a full week has no boundary to start at, so it reads Sunday to Saturday', () => {
    expect(weekdayRuns([0, 1, 2, 3, 4, 5, 6])).toEqual([{ from: 0, to: 6 }]);
  });

  test('is unbothered by unsorted input, duplicates and out-of-range values', () => {
    expect(weekdayRuns([3, 1, 2, 2, 9, -1])).toEqual([{ from: 1, to: 3 }]);
  });

  test('a clinic with no open days reports none rather than an empty range', () => {
    expect(weekdayRuns([])).toEqual([]);
  });
});

describe('weekdayName', () => {
  test('counts from Sunday in both locales', () => {
    expect(weekdayName('en', 0)).toBe('Sunday');
    expect(weekdayName('en', 6)).toBe('Saturday');
    expect(weekdayName('ar', 0)).toBe('الأحد');
    expect(weekdayName('ar', 4)).toBe('الخميس');
  });
});

describe('formatWorkingDays', () => {
  test('reads as a range, in the locale', () => {
    expect(formatWorkingDays('en', [0, 1, 2, 3, 4])).toBe('Sunday – Thursday');
    expect(formatWorkingDays('ar', [0, 1, 2, 3, 4])).toBe('الأحد – الخميس');
  });

  test('joins two stretches with the locale’s own separator', () => {
    expect(formatWorkingDays('en', [0, 1, 4])).toBe('Sunday – Monday and Thursday');
  });

  test('is empty when the clinic lists no open days, so the caller can omit the line', () => {
    expect(formatWorkingDays('ar', [])).toBe('');
  });
});

describe('formatClockMinute', () => {
  test('renders minutes from midnight as a wall clock', () => {
    expect(formatClockMinute('en', 8 * 60)).toBe('8:00 AM');
    expect(formatClockMinute('en', 18 * 60)).toBe('6:00 PM');
  });

  test('uses Western digits in Arabic, per the project’s Intl rules', () => {
    // The digits are what this asserts; the AM/PM marker is the locale's own.
    expect(formatClockMinute('ar', 8 * 60)).toContain('8:00');
    expect(formatClockMinute('ar', 14 * 60 + 30)).toContain('2:30');
  });
});

describe('workingHourRuns', () => {
  /** A working day, with hours in whole hours for readability. */
  const open = (weekday: number, from: number, to: number) => ({
    weekday,
    isWorking: true,
    openMinute: from * 60,
    closeMinute: to * 60,
  });

  const closed = (weekday: number) => ({
    weekday,
    isWorking: false,
    openMinute: null,
    closeMinute: null,
  });

  const week = [0, 1, 2, 3, 4, 5, 6];

  test('a week on one clock is a single run', () => {
    const days = week.map((day) => (day <= 4 ? open(day, 8, 18) : closed(day)));

    expect(workingHourRuns(days)).toEqual([
      { from: 0, to: 4, openMinute: 8 * 60, closeMinute: 18 * 60 },
    ]);
  });

  test('splits on a change of hours, not only on a gap in the days', () => {
    // Sunday–Wednesday 08:00–18:00, then Thursday closes at 14:00. The envelope
    // would report 08:00–18:00 for all five, which is wrong about Thursday.
    const days = week.map((day) => {
      if (day <= 3) return open(day, 8, 18);
      if (day === 4) return open(day, 8, 14);
      return closed(day);
    });

    expect(workingHourRuns(days)).toEqual([
      { from: 0, to: 3, openMinute: 8 * 60, closeMinute: 18 * 60 },
      { from: 4, to: 4, openMinute: 8 * 60, closeMinute: 14 * 60 },
    ]);
  });

  test('a gap in the days breaks a run even when the hours match', () => {
    const days = week.map((day) => (day === 0 || day === 1 || day === 4 ? open(day, 9, 17) : closed(day)));

    expect(workingHourRuns(days)).toEqual([
      { from: 0, to: 1, openMinute: 9 * 60, closeMinute: 17 * 60 },
      { from: 4, to: 4, openMinute: 9 * 60, closeMinute: 17 * 60 },
    ]);
  });

  test('wraps across the end of the week when the hours match too', () => {
    const days = week.map((day) => (day >= 5 || day === 0 ? open(day, 10, 14) : closed(day)));

    expect(workingHourRuns(days)).toEqual([
      { from: 5, to: 0, openMinute: 10 * 60, closeMinute: 14 * 60 },
    ]);
  });

  test('does not wrap when the two ends keep different hours', () => {
    const days = week.map((day) => {
      if (day === 0) return open(day, 8, 12);
      if (day >= 5) return open(day, 10, 14);
      return closed(day);
    });

    expect(workingHourRuns(days)).toEqual([
      { from: 0, to: 0, openMinute: 8 * 60, closeMinute: 12 * 60 },
      { from: 5, to: 6, openMinute: 10 * 60, closeMinute: 14 * 60 },
    ]);
  });

  test('a clinic open every day on one clock is one run, with no wrap to apply', () => {
    expect(workingHourRuns(week.map((day) => open(day, 8, 18)))).toEqual([
      { from: 0, to: 6, openMinute: 8 * 60, closeMinute: 18 * 60 },
    ]);
  });

  test('is empty when nothing is open, so the card can show "not recorded"', () => {
    expect(workingHourRuns(week.map(closed))).toEqual([]);
  });

  test('ignores a working row with no hours on it, rather than trusting the flag alone', () => {
    // The database forbids this pair, but the type allows it and a bad row
    // should not render an "open 00:00" day.
    const days = [{ weekday: 0, isWorking: true, openMinute: null, closeMinute: null }];

    expect(workingHourRuns(days)).toEqual([]);
  });
});
