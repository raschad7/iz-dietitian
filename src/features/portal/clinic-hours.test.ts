import { describe, expect, test } from 'bun:test';

import { formatClockMinute, formatWorkingDays, weekdayName, weekdayRuns } from './clinic-hours';

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
