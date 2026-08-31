import { describe, expect, test } from 'bun:test';

import { CALENDAR_VIEWS } from './schema';
import { covers, loadedRangeFor, rangeFor } from './range';

describe('rangeFor', () => {
  test('a day is itself', () => {
    expect(rangeFor('day', '2026-08-24')).toEqual({ from: '2026-08-24', to: '2026-08-24' });
  });

  test('a week runs Sunday to Saturday around the anchor', () => {
    // 2026-08-24 is a Monday.
    expect(rangeFor('week', '2026-08-24')).toEqual({ from: '2026-08-23', to: '2026-08-29' });
    // The anchor is already the Sunday.
    expect(rangeFor('week', '2026-08-23')).toEqual({ from: '2026-08-23', to: '2026-08-29' });
  });

  test('a month is the padded grid, not the month', () => {
    // August 2026 starts on a Saturday and ends on a Monday, so the six-row
    // grid reaches back into July and forward into September.
    expect(rangeFor('month', '2026-08-24')).toEqual({ from: '2026-07-26', to: '2026-09-05' });
  });

  test('every anchor inside a month asks for the same grid', () => {
    const first = rangeFor('month', '2026-08-01');
    expect(rangeFor('month', '2026-08-15')).toEqual(first);
    expect(rangeFor('month', '2026-08-31')).toEqual(first);
  });
});

describe('covers', () => {
  test('holds a span inside itself, and its own edges', () => {
    const august = { from: '2026-08-01', to: '2026-08-31' };
    expect(covers(august, { from: '2026-08-10', to: '2026-08-12' })).toBe(true);
    expect(covers(august, august)).toBe(true);
  });

  test('rejects a span that runs past either end', () => {
    const august = { from: '2026-08-01', to: '2026-08-31' };
    expect(covers(august, { from: '2026-07-31', to: '2026-08-02' })).toBe(false);
    expect(covers(august, { from: '2026-08-30', to: '2026-09-01' })).toBe(false);
  });
});

/**
 * The invariant the calendar's view switch rests on.
 *
 * `loadCalendarPage` reads `loadedRangeFor` whatever view is on, and `Calendar`
 * draws a requested view immediately — no placeholder, no wait — when the span
 * it needs is inside the span already loaded. Both halves of that only work if
 * the one span really does hold all three views at the anchor, so it is spelled
 * out here rather than derived: a change to any view's shape that pushed it
 * outside would otherwise show up as a grid drawn with appointments missing.
 */
describe('the span the calendar loads', () => {
  const anchor = '2026-08-24';
  const loaded = loadedRangeFor(anchor);

  test('holds every view at that anchor, so no switch between them waits', () => {
    for (const view of CALENDAR_VIEWS) {
      expect(covers(loaded, rangeFor(view, anchor))).toBe(true);
    }
  });

  test('holds every view at every anchor it draws, so the month can open any of its days', () => {
    // The grid is padded to whole weeks, so both the day clicked and the week
    // around it are inside it — including at the two edges, where the grid is
    // showing days from the neighbouring months.
    for (const date of ['2026-07-26', '2026-08-01', '2026-08-24', '2026-08-31', '2026-09-05']) {
      expect(covers(loaded, rangeFor('day', date))).toBe(true);
      expect(covers(loaded, rangeFor('week', date))).toBe(true);
    }
  });

  test('stops at its own edges — a date outside the grid is a real navigation', () => {
    expect(covers(loaded, rangeFor('day', '2026-07-25'))).toBe(false);
    expect(covers(loaded, rangeFor('day', '2026-09-06'))).toBe(false);
    expect(covers(loaded, rangeFor('month', '2026-09-15'))).toBe(false);
  });

  test('is the same span from any anchor inside the month, so it is stable as the date steps', () => {
    expect(loadedRangeFor('2026-08-01')).toEqual(loaded);
    expect(loadedRangeFor('2026-08-31')).toEqual(loaded);
  });
});
