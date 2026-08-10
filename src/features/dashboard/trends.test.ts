import { describe, expect, test } from 'bun:test';

import { monthlySeries, trendOf, weeklySeries } from './trends';

/**
 * The cases that matter here are the empty ones. A clinic that took nobody on
 * last month, a week with no bookings, a register two months old — those are
 * the states the charts are most likely to meet in a real clinic's first year,
 * and each of them is a place a naive implementation returns a gap, a wrong
 * bar count, or "up ∞%".
 */

describe('monthlySeries', () => {
  test('returns a complete window ending with the current month', () => {
    const series = monthlySeries('2026-08-10', 6, []);

    expect(series.map((point) => point.month)).toEqual([
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
      '2026-06-01',
      '2026-07-01',
      '2026-08-01',
    ]);
    expect(series.every((point) => point.clients === 0)).toBe(true);
  });

  test('crosses a year boundary', () => {
    const series = monthlySeries('2026-02-01', 4, []);

    expect(series.map((point) => point.month)).toEqual([
      '2025-11-01',
      '2025-12-01',
      '2026-01-01',
      '2026-02-01',
    ]);
  });

  test('fills the months it has and zeroes the ones it does not', () => {
    const series = monthlySeries('2026-08-10', 3, [
      { month: '2026-06-01', clients: 4 },
      { month: '2026-08-01', clients: 9 },
    ]);

    expect(series).toEqual([
      { month: '2026-06-01', clients: 4 },
      { month: '2026-07-01', clients: 0 },
      { month: '2026-08-01', clients: 9 },
    ]);
  });

  test('ignores rows from outside the window', () => {
    const series = monthlySeries('2026-08-10', 2, [
      { month: '2024-01-01', clients: 99 },
      { month: '2026-08-01', clients: 2 },
    ]);

    expect(series).toEqual([
      { month: '2026-07-01', clients: 0 },
      { month: '2026-08-01', clients: 2 },
    ]);
  });
});

describe('weeklySeries', () => {
  test('returns weeks starting on Sunday, ending with the current one', () => {
    // 2026-08-10 is a Monday; its week began Sunday the 9th.
    const series = weeklySeries('2026-08-10', 3, []);

    expect(series.map((week) => week.weekStart)).toEqual(['2026-07-26', '2026-08-02', '2026-08-09']);
  });

  test('sums each week from its own days', () => {
    const series = weeklySeries('2026-08-10', 2, [
      { date: '2026-08-02', appointments: 3 }, // Sunday, previous week
      { date: '2026-08-08', appointments: 1 }, // Saturday, same week
      { date: '2026-08-10', appointments: 5 }, // Monday, current week
    ]);

    expect(series).toEqual([
      { weekStart: '2026-08-02', appointments: 4 },
      { weekStart: '2026-08-09', appointments: 5 },
    ]);
  });

  test('drops days outside the window rather than adding a bar for them', () => {
    const series = weeklySeries('2026-08-10', 1, [
      { date: '2026-07-01', appointments: 7 },
      { date: '2026-08-09', appointments: 2 },
    ]);

    expect(series).toEqual([{ weekStart: '2026-08-09', appointments: 2 }]);
  });
});

describe('trendOf', () => {
  test('has no trend from fewer than two buckets', () => {
    expect(trendOf([])).toEqual({ direction: 'flat', percent: null });
    expect(trendOf([5])).toEqual({ direction: 'flat', percent: null });
  });

  test('has no percentage when the baseline is empty', () => {
    expect(trendOf([0, 0, 6])).toEqual({ direction: 'flat', percent: null });
  });

  test('measures the latest bucket against the mean of the rest', () => {
    // Baseline 4, latest 8 — up 100%.
    expect(trendOf([2, 4, 6, 8])).toEqual({ direction: 'up', percent: 100 });
    // Baseline 8, latest 4 — down 50%.
    expect(trendOf([8, 8, 8, 4])).toEqual({ direction: 'down', percent: 50 });
  });

  test('calls a small move flat rather than a trend', () => {
    expect(trendOf([100, 100, 102])).toEqual({ direction: 'flat', percent: 2 });
  });
});
