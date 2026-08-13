import { describe, expect, test } from 'bun:test';

import { minutesToTime, summarizeSchedule } from './schedule-summary';
import type { ClinicDayHours } from './types';

function open(weekday: number, openMinute = 8 * 60, closeMinute = 18 * 60): ClinicDayHours {
  return { weekday, isWorking: true, openMinute, closeMinute };
}

function closed(weekday: number): ClinicDayHours {
  return { weekday, isWorking: false, openMinute: null, closeMinute: null };
}

describe('summarizeSchedule', () => {
  test('collapses the ordinary week into two spans', () => {
    const spans = summarizeSchedule([open(0), open(1), open(2), open(3), open(4), closed(5), closed(6)]);

    expect(spans).toHaveLength(2);
    expect(spans[0]).toMatchObject({ from: 0, to: 4, isWorking: true, openMinute: 480, closeMinute: 1080 });
    expect(spans[1]).toMatchObject({ from: 5, to: 6, isWorking: false });
  });

  test('never spans a gap', () => {
    // Open Sunday and Tuesday but shut on Monday: printing "Sunday–Tuesday"
    // would claim the clinic is open on a day it is closed.
    const spans = summarizeSchedule([open(0), closed(1), open(2), closed(3), closed(4), closed(5), closed(6)]);

    expect(spans.map((span) => [span.from, span.to, span.isWorking])).toEqual([
      [0, 0, true],
      [1, 1, false],
      [2, 2, true],
      [3, 6, false],
    ]);
  });

  test('splits a run where the hours differ', () => {
    const spans = summarizeSchedule([
      open(0), open(1), open(2, 10 * 60, 14 * 60), open(3), open(4), closed(5), closed(6),
    ]);

    expect(spans.map((span) => [span.from, span.to])).toEqual([[0, 1], [2, 2], [3, 4], [5, 6]]);
  });

  test('returns seven spans when every day differs', () => {
    const spans = summarizeSchedule(
      Array.from({ length: 7 }, (_, weekday) => open(weekday, 8 * 60 + weekday * 60, 18 * 60)),
    );
    expect(spans).toHaveLength(7);
  });

  test('collapses a week that is closed throughout into one span', () => {
    const spans = summarizeSchedule(Array.from({ length: 7 }, (_, weekday) => closed(weekday)));
    expect(spans).toEqual([{ from: 0, to: 6, isWorking: false, openMinute: null, closeMinute: null }]);
  });
});

describe('minutesToTime', () => {
  test('pads both halves', () => {
    expect(minutesToTime(8 * 60)).toBe('08:00');
    expect(minutesToTime(9 * 60 + 5)).toBe('09:05');
    expect(minutesToTime(0)).toBe('00:00');
    expect(minutesToTime(23 * 60 + 45)).toBe('23:45');
  });
});
