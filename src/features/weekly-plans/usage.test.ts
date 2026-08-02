import { describe, expect, test } from 'bun:test';

import { ordinalUse } from './usage';

const WEEKS = ['2026-08-02', '2026-07-26', '2026-07-19'];

describe('ordinalUse', () => {
  test('counts the plan being edited as this week', () => {
    const usage = ordinalUse(WEEKS, [{ dishId: 'd1', weekStartDate: '2026-08-02' }]);

    expect(usage.d1).toEqual({ weeksAgo: 0 });
  });

  test('counts each earlier plan by position, not by calendar distance', () => {
    // A month-long gap between the last two weeks still reads as "one plan back",
    // because the question is whether the client has had it recently, not how many
    // Sundays have passed.
    const usage = ordinalUse(['2026-08-02', '2026-06-28'], [
      { dishId: 'd1', weekStartDate: '2026-06-28' },
    ]);

    expect(usage.d1).toEqual({ weeksAgo: 1 });
  });

  test('keeps the most recent appearance when a dish repeats', () => {
    const usage = ordinalUse(WEEKS, [
      { dishId: 'd1', weekStartDate: '2026-07-19' },
      { dishId: 'd1', weekStartDate: '2026-07-26' },
    ]);

    expect(usage.d1).toEqual({ weeksAgo: 1 });
  });

  test('ignores an appearance outside the window', () => {
    const usage = ordinalUse(WEEKS, [{ dishId: 'd1', weekStartDate: '2026-01-04' }]);

    expect(usage).toEqual({});
  });

  test('returns nothing for a client with no plans', () => {
    expect(ordinalUse([], [{ dishId: 'd1', weekStartDate: '2026-08-02' }])).toEqual({});
  });

  test('keys every dish it saw', () => {
    const usage = ordinalUse(WEEKS, [
      { dishId: 'd1', weekStartDate: '2026-08-02' },
      { dishId: 'd2', weekStartDate: '2026-07-26' },
    ]);

    expect(Object.keys(usage).sort()).toEqual(['d1', 'd2']);
  });
});
