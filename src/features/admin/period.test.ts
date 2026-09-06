import { describe, expect, test } from 'bun:test';

import {
  bucketBy,
  dayKeys,
  daysBetween,
  delta,
  isNotable,
  monthKeys,
  parseUsageRange,
  periodOf,
  rangeStart,
} from './period';

/**
 * The window arithmetic every platform figure is compared through.
 *
 * The reason this is tested at all: a delta computed against the wrong baseline
 * is the one kind of dashboard error that never looks like an error. It renders,
 * it has an arrow, and it points the wrong way.
 */

const NOW = new Date('2026-09-05T12:00:00.000Z');

describe('parseUsageRange', () => {
  test('takes a known range', () => {
    expect(parseUsageRange('7d')).toBe('7d');
    expect(parseUsageRange('all')).toBe('all');
  });

  test('falls back for anything else, including undefined', () => {
    expect(parseUsageRange(undefined)).toBe('30d');
    expect(parseUsageRange('1d')).toBe('30d');
    expect(parseUsageRange('__proto__')).toBe('30d');
  });
});

describe('rangeStart', () => {
  test('counts back the range in days', () => {
    expect(rangeStart('7d', NOW)).toEqual(new Date('2026-08-29T12:00:00.000Z'));
  });

  test('"all" has no start', () => {
    expect(rangeStart('all', NOW)).toBeNull();
  });
});

describe('periodOf', () => {
  /**
   * The property the whole comparison rests on: the previous window is the same
   * length, ends exactly where this one begins, and shares no instant with it.
   * A gap would drop events; an overlap would count them twice.
   */
  test('the previous window abuts the current one and is the same length', () => {
    const period = periodOf('30d', NOW);

    expect(period.previousEnd).toEqual(period.start);
    expect(period.end.getTime() - period.start!.getTime()).toBe(
      period.previousEnd!.getTime() - period.previousStart!.getTime(),
    );
  });

  test('"all" has no previous window at all', () => {
    // Not a zero-length one: "we cannot compare" and "nothing happened" are
    // different answers, and only null can say the first.
    const period = periodOf('all', NOW);

    expect(period.start).toBeNull();
    expect(period.previousStart).toBeNull();
    expect(period.previousEnd).toBeNull();
  });
});

describe('delta', () => {
  test('reports the change and the ratio', () => {
    expect(delta(12, 10)).toMatchObject({ change: 2, ratio: 0.2, direction: 'up' });
    expect(delta(8, 10)).toMatchObject({ change: -2, direction: 'down' });
    expect(delta(10, 10)).toMatchObject({ change: 0, ratio: 0, direction: 'flat' });
  });

  /**
   * The one everybody gets wrong. Going from nothing to five is not a 500% rise
   * and not an infinite one — there is no ratio, and the only honest thing to
   * show is the count.
   */
  test('a rise from zero has no ratio', () => {
    const value = delta(5, 0);

    expect(value.change).toBe(5);
    expect(value.ratio).toBeNull();
    expect(value.direction).toBe('up');
  });

  test('no baseline means unknown, not flat', () => {
    expect(delta(5, null)).toMatchObject({ change: null, ratio: null, direction: 'unknown' });
  });
});

describe('isNotable', () => {
  test('small movements on small numbers are not shouted about', () => {
    // 1 of 30 is 3%: real, shown, and not coloured.
    expect(isNotable(delta(31, 30))).toBe(false);
    expect(isNotable(delta(33, 30))).toBe(true);
  });

  test('a rise from zero is never "notable" — it has no ratio to judge', () => {
    expect(isNotable(delta(5, 0))).toBe(false);
  });
});

describe('dayKeys', () => {
  test('includes both ends', () => {
    const keys = dayKeys(new Date('2026-09-01T23:00:00Z'), new Date('2026-09-04T01:00:00Z'));

    expect(keys).toEqual(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']);
  });

  test('a single day is one key, not none', () => {
    expect(dayKeys(NOW, NOW)).toEqual(['2026-09-05']);
  });
});

describe('monthKeys', () => {
  test('ends with the month `now` falls in and runs backwards', () => {
    expect(monthKeys(NOW, 3)).toEqual(['2026-07', '2026-08', '2026-09']);
  });

  test('crosses a year boundary', () => {
    expect(monthKeys(new Date('2026-01-15T00:00:00Z'), 3)).toEqual(['2025-11', '2025-12', '2026-01']);
  });
});

describe('bucketBy', () => {
  /**
   * The reason the keys are passed in complete rather than derived from the
   * rows: a series built only from days that have data draws a line straight
   * through a quiet week, which makes an outage look like ordinary traffic.
   */
  test('keeps empty buckets as zeroes', () => {
    const rows = [{ at: '2026-09-01' }, { at: '2026-09-03' }, { at: '2026-09-03' }];

    expect(bucketBy(rows, ['2026-09-01', '2026-09-02', '2026-09-03'], (row) => row.at)).toEqual([
      { key: '2026-09-01', value: 1 },
      { key: '2026-09-02', value: 0 },
      { key: '2026-09-03', value: 2 },
    ]);
  });

  test('drops rows outside the key set rather than inventing a bucket', () => {
    const rows = [{ at: '2026-08-30' }, { at: '2026-09-01' }];

    expect(bucketBy(rows, ['2026-09-01'], (row) => row.at)).toEqual([{ key: '2026-09-01', value: 1 }]);
  });

  test('sums a measure when one is given', () => {
    const rows = [
      { at: '2026-09-01', cost: 5 },
      { at: '2026-09-01', cost: 7 },
    ];

    expect(
      bucketBy(rows, ['2026-09-01'], (row) => row.at, (row) => row.cost),
    ).toEqual([{ key: '2026-09-01', value: 12 }]);
  });
});

describe('daysBetween', () => {
  test('rounds toward zero, so a part-day is not a day', () => {
    expect(daysBetween(new Date('2026-09-04T13:00:00Z'), NOW)).toBe(0);
    expect(daysBetween(new Date('2026-09-04T11:00:00Z'), NOW)).toBe(1);
  });
});
