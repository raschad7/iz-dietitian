import { describe, expect, test } from 'bun:test';

import { formatDateParts, nextSunday, weekDates } from './week';

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
  });
});
