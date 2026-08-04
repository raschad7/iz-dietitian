import { describe, expect, test } from 'bun:test';

import {
  currentStreak,
  metricFraction,
  progressTier,
  summariseWeek,
  weekDates,
  STREAK_WINDOW_DAYS,
  type CheckInRow,
  type DayState,
} from './check-ins';

/** Wednesday 5 August 2026. Its week runs Sunday 2nd to Saturday 8th. */
const WEDNESDAY = '2026-08-05';
const SUNDAY = '2026-08-02';
const MONDAY = '2026-08-03';
const TUESDAY = '2026-08-04';
const THURSDAY = '2026-08-06';
const SATURDAY = '2026-08-08';

function row(date: string, score: number, metrics: Partial<CheckInRow> = {}): CheckInRow {
  return {
    date,
    score,
    energy: null,
    sleep: null,
    appetite: null,
    mood: null,
    water: null,
    ...metrics,
  };
}

function statesOf(rows: CheckInRow[], today = WEDNESDAY): DayState[] {
  return summariseWeek(rows, today).days.map((day) => day.state);
}

describe('weekDates', () => {
  test('returns the clinic week, Sunday first', () => {
    expect(weekDates(WEDNESDAY)).toEqual([
      SUNDAY,
      MONDAY,
      TUESDAY,
      WEDNESDAY,
      THURSDAY,
      '2026-08-07',
      SATURDAY,
    ]);
  });

  test('a Sunday is its own week start', () => {
    expect(weekDates(SUNDAY)[0]).toBe(SUNDAY);
  });
});

describe('summariseWeek day states', () => {
  test('separates complete, partial, empty, today and future', () => {
    expect(
      statesOf([row(SUNDAY, 10), row(MONDAY, 10), row(TUESDAY, 7)]),
    ).toEqual(['complete', 'complete', 'partial', 'today', 'future', 'future', 'future']);
  });

  test('a full score on today still reads as today, not complete', () => {
    expect(statesOf([row(WEDNESDAY, 10)])[3]).toBe('today');
  });

  test('a day with no row before today is empty, never a failure state', () => {
    expect(statesOf([])).toEqual(['empty', 'empty', 'empty', 'today', 'future', 'future', 'future']);
  });

  test('a real zero is partial — an answered day, not a missing one', () => {
    const week = summariseWeek([row(MONDAY, 0)], WEDNESDAY);

    expect(week.days[1]?.state).toBe('partial');
    expect(week.days[1]?.score).toBe(0);
    // Silence keeps its own state and no score at all.
    expect(week.days[0]?.state).toBe('empty');
    expect(week.days[0]?.score).toBeNull();
  });

  test('ignores rows outside the week rather than counting them', () => {
    const week = summariseWeek([row('2026-07-29', 10), row(MONDAY, 10)], WEDNESDAY);

    expect(week.recordedCount).toBe(1);
    expect(week.days).toHaveLength(7);
  });

  test('order of the rows does not matter', () => {
    expect(statesOf([row(TUESDAY, 7), row(SUNDAY, 10), row(MONDAY, 10)])).toEqual(
      statesOf([row(SUNDAY, 10), row(MONDAY, 10), row(TUESDAY, 7)]),
    );
  });
});

describe('summariseWeek scores', () => {
  test('averages only the days that were answered', () => {
    const week = summariseWeek([row(SUNDAY, 10), row(MONDAY, 10), row(TUESDAY, 7)], WEDNESDAY);

    expect(week.recordedCount).toBe(3);
    expect(week.averageScore).toBe(9);
  });

  test('rounds the average to one decimal', () => {
    const week = summariseWeek([row(SUNDAY, 10), row(MONDAY, 9), row(TUESDAY, 8)], WEDNESDAY);

    expect(week.averageScore).toBe(9);

    const uneven = summariseWeek([row(SUNDAY, 10), row(MONDAY, 10), row(TUESDAY, 6)], WEDNESDAY);

    expect(uneven.averageScore).toBe(8.7);
  });

  test('an empty week has no average rather than a zero', () => {
    expect(summariseWeek([], WEDNESDAY).averageScore).toBeNull();
  });
});

describe('summariseWeek metrics', () => {
  test('reports one entry per metric, in schema order', () => {
    const week = summariseWeek([], WEDNESDAY);

    expect(week.metrics.map((metric) => metric.metric)).toEqual([
      'energy',
      'sleep',
      'appetite',
      'mood',
      'water',
    ]);
  });

  test('keeps unanswered days as gaps in the trend', () => {
    const week = summariseWeek([row(SUNDAY, 8, { energy: 3 }), row(TUESDAY, 8, { energy: 5 })], WEDNESDAY);
    const energy = week.metrics[0];

    expect(energy?.trend).toEqual([3, null, 5, null, null, null, null]);
    expect(energy?.average).toBe(4);
  });

  test('a metric nobody answered is none, even on a day that was scored', () => {
    const week = summariseWeek([row(SUNDAY, 10)], WEDNESDAY);

    expect(week.metrics[0]?.status).toBe('none');
    expect(week.metrics[0]?.average).toBeNull();
  });

  test('flags both ends of the scale as attention, not just the low one', () => {
    const low = summariseWeek([row(SUNDAY, 5, { appetite: 1 }), row(MONDAY, 5, { appetite: 2 })], WEDNESDAY);
    const high = summariseWeek([row(SUNDAY, 5, { appetite: 5 }), row(MONDAY, 5, { appetite: 5 })], WEDNESDAY);

    expect(low.metrics[2]?.status).toBe('attention');
    expect(high.metrics[2]?.status).toBe('attention');
  });

  test('separates good from merely on track inside the band', () => {
    const onTrack = summariseWeek([row(SUNDAY, 5, { sleep: 3 })], WEDNESDAY);
    const good = summariseWeek([row(SUNDAY, 5, { sleep: 4 })], WEDNESDAY);

    expect(onTrack.metrics[1]?.status).toBe('onTrack');
    expect(good.metrics[1]?.status).toBe('good');
  });
});

describe('metricFraction', () => {
  test('maps the scale ends to 0 and 1', () => {
    expect(metricFraction(1)).toBe(0);
    expect(metricFraction(5)).toBe(1);
    expect(metricFraction(3)).toBe(0.5);
  });

  test('clamps values the database would have refused', () => {
    expect(metricFraction(0)).toBe(0);
    expect(metricFraction(9)).toBe(1);
  });
});

describe('progressTier', () => {
  test('bands the week into the five messages the card can show', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(progressTier)).toEqual([
      'empty',
      'starting',
      'starting',
      'halfway',
      'halfway',
      'strong',
      'strong',
      'full',
    ]);
  });

  test('a full week cannot be reported as anything else', () => {
    // Nothing should produce this, but a count above the week's length must not
    // fall through to `strong` — the message would contradict the ring.
    expect(progressTier(9)).toBe('full');
  });
});

describe('currentStreak', () => {
  test('counts consecutive days ending today', () => {
    const rows = [row(MONDAY, 8), row(TUESDAY, 9), row(WEDNESDAY, 7)];
    expect(currentStreak(rows, WEDNESDAY)).toBe(3);
  });

  test('today not being recorded yet does not end the streak', () => {
    // The client checks in each evening; at 9am their streak must not read 0.
    const rows = [row(MONDAY, 8), row(TUESDAY, 9)];
    expect(currentStreak(rows, WEDNESDAY)).toBe(2);
  });

  test('a gap two days back ends it', () => {
    const rows = [row(SUNDAY, 8), row(TUESDAY, 9), row(WEDNESDAY, 7)];
    expect(currentStreak(rows, WEDNESDAY)).toBe(2);
  });

  test('is zero when neither today nor yesterday was recorded', () => {
    expect(currentStreak([row(SUNDAY, 8), row(MONDAY, 9)], WEDNESDAY)).toBe(0);
  });

  test('is zero with nothing recorded at all', () => {
    expect(currentStreak([], WEDNESDAY)).toBe(0);
  });

  test('ignores order and duplicates', () => {
    const rows = [row(WEDNESDAY, 7), row(MONDAY, 8), row(TUESDAY, 9), row(TUESDAY, 9)];
    expect(currentStreak(rows, WEDNESDAY)).toBe(3);
  });

  test('crosses a month boundary', () => {
    const rows = [row('2026-07-31', 8), row('2026-08-01', 9)];
    expect(currentStreak(rows, '2026-08-01')).toBe(2);
  });

  test('stops at the window rather than walking an unbounded history', () => {
    const rows = Array.from({ length: 400 }, (_, offset) => {
      const date = new Date(Date.UTC(2026, 7, 5) - offset * 86_400_000);
      return row(date.toISOString().slice(0, 10), 10);
    });

    expect(currentStreak(rows, WEDNESDAY)).toBe(STREAK_WINDOW_DAYS);
  });
});
