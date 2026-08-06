import { describe, expect, test } from 'bun:test';

import { DEFAULT_REPEAT_WEEKS, MAX_REPEAT_WEEKS, REPEAT_PRESETS, weeklyRepeatDates } from './repeat';

/**
 * The span-to-dates rule, which both the dialog and the mutation read.
 *
 * `mutations.test.ts` proves the writes obey it; these pin down what it says,
 * without a database. The dates are fixed here rather than derived from today —
 * this module has no clock and no opinion about the past, so nothing in it can
 * start failing on a particular morning.
 */

/** A Wednesday. */
const WEDNESDAY = '2026-08-05';

describe('weeklyRepeatDates', () => {
  test('excludes the booking it repeats — the first appointment already exists', () => {
    expect(weeklyRepeatDates(WEDNESDAY, 4)).not.toContain(WEDNESDAY);
  });

  test('is one appointment a week, in order', () => {
    expect(weeklyRepeatDates(WEDNESDAY, 4)).toEqual([
      '2026-08-12',
      '2026-08-19',
      '2026-08-26',
      '2026-09-02',
    ]);
  });

  test('one week means the next week, not nothing', () => {
    expect(weeklyRepeatDates(WEDNESDAY, 1)).toEqual(['2026-08-12']);
  });

  test('keeps the weekday across a month and a year boundary', () => {
    const dates = weeklyRepeatDates('2026-12-30', 3);
    expect(dates).toEqual(['2027-01-06', '2027-01-13', '2027-01-20']);
  });

  test('never exceeds a year, however many weeks are asked for', () => {
    expect(weeklyRepeatDates(WEDNESDAY, 500).length).toBe(MAX_REPEAT_WEEKS);
  });

  test('a count that is zero, negative or fractional books nothing rather than guessing', () => {
    for (const weeks of [0, -3, 1.5, Number.NaN]) {
      expect(weeklyRepeatDates(WEDNESDAY, weeks)).toEqual([]);
    }
  });
});

describe('the spans the dialog offers', () => {
  test('every preset is a usable number of weeks', () => {
    for (const preset of REPEAT_PRESETS) {
      expect(weeklyRepeatDates(WEDNESDAY, preset.weeks).length).toBe(preset.weeks);
      expect(preset.weeks).toBeLessThanOrEqual(MAX_REPEAT_WEEKS);
    }
  });

  test('the default is one of them, so the select opens on a real choice', () => {
    expect(REPEAT_PRESETS.some((preset) => preset.weeks === DEFAULT_REPEAT_WEEKS)).toBe(true);
  });
});
