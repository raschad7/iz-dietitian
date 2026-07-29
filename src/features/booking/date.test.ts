import { describe, expect, test } from 'bun:test';

import {
  addDays,
  addMonths,
  daysInMonth,
  eachDay,
  endOfMonth,
  isIsoDate,
  isSameMonth,
  minuteToClock,
  monthGridDays,
  parseDateInput,
  startOfMonth,
  startOfWeek,
  toIsoDate,
  toUtcInstant,
  weekdayOf,
} from './date';

describe('weekdayOf', () => {
  test('reads the weekday without depending on the machine time zone', () => {
    expect(weekdayOf('2026-08-05')).toBe(3); // Wednesday
    expect(weekdayOf('2026-08-07')).toBe(5); // Friday
    expect(weekdayOf('2026-08-09')).toBe(0); // Sunday
  });

  test('is correct at the start of a day, where a UTC-parsed Date would slip back one', () => {
    expect(weekdayOf('2026-01-01')).toBe(4); // Thursday
    expect(weekdayOf('2026-12-31')).toBe(4);
  });

  test('returns null for a date that never existed', () => {
    expect(weekdayOf('2026-02-30')).toBeNull();
    expect(weekdayOf('2026-13-01')).toBeNull();
    expect(weekdayOf('05/08/2026')).toBeNull();
    expect(weekdayOf('')).toBeNull();
  });
});

describe('daysInMonth', () => {
  test('knows the leap-year rules', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29); // divisible by 400
    expect(daysInMonth(1900, 2)).toBe(28); // divisible by 100, not 400
  });

  test('knows the short months', () => {
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe('isIsoDate', () => {
  test('accepts a real date and rejects an impossible one', () => {
    expect(isIsoDate('2026-08-05')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2026-8-5')).toBe(false);
  });
});

describe('parseDateInput', () => {
  test('accepts the three formats the popup advertises', () => {
    expect(parseDateInput('2026-08-05')).toBe('2026-08-05');
    expect(parseDateInput('8/5/2026')).toBe('2026-08-05');
    expect(parseDateInput('08-05-2026')).toBe('2026-08-05');
  });

  test('trims and zero-pads', () => {
    expect(parseDateInput('  8/5/2026 ')).toBe('2026-08-05');
    expect(parseDateInput('12/1/2026')).toBe('2026-12-01');
  });

  test('rejects a date that never existed rather than rolling it over', () => {
    // `new Date(2026, 1, 30)` would silently become 2 March.
    expect(parseDateInput('2/30/2026')).toBeNull();
    expect(parseDateInput('2026-02-30')).toBeNull();
    expect(parseDateInput('2/29/2026')).toBeNull();
    expect(parseDateInput('4/31/2026')).toBeNull();
  });

  test('reads the slash and dash forms month-first, so 13 is not a month', () => {
    expect(parseDateInput('13/5/2026')).toBeNull();
  });

  test('rejects junk', () => {
    expect(parseDateInput('')).toBeNull();
    expect(parseDateInput('tomorrow')).toBeNull();
    expect(parseDateInput('8/5/26')).toBeNull();
    expect(parseDateInput('2026/08/05')).toBeNull();
  });
});

describe('addDays', () => {
  test('crosses months and years', () => {
    expect(addDays('2026-08-05', 1)).toBe('2026-08-06');
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  test('crosses a leap day', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  test('moves by a week in each direction', () => {
    expect(addDays('2026-08-05', 7)).toBe('2026-08-12');
    expect(addDays('2026-08-05', -7)).toBe('2026-07-29');
  });
});

describe('addMonths', () => {
  test('moves whole months', () => {
    expect(addMonths('2026-08-05', 1)).toBe('2026-09-05');
    expect(addMonths('2026-12-05', 1)).toBe('2027-01-05');
    expect(addMonths('2026-01-05', -1)).toBe('2025-12-05');
  });

  test('clamps a day that does not exist in the target month', () => {
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2024-03-31', -1)).toBe('2024-02-29');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });
});

describe('startOfWeek', () => {
  test('returns the Sunday on or before the date', () => {
    expect(startOfWeek('2026-08-05')).toBe('2026-08-02');
    expect(startOfWeek('2026-08-02')).toBe('2026-08-02');
    expect(startOfWeek('2026-08-08')).toBe('2026-08-02');
  });

  test('honours a different first day', () => {
    expect(startOfWeek('2026-08-05', 1)).toBe('2026-08-03'); // Monday
  });
});

describe('startOfMonth / endOfMonth', () => {
  test('finds the bounds', () => {
    expect(startOfMonth('2026-08-05')).toBe('2026-08-01');
    expect(endOfMonth('2026-08-05')).toBe('2026-08-31');
    expect(endOfMonth('2026-02-05')).toBe('2026-02-28');
    expect(endOfMonth('2024-02-05')).toBe('2024-02-29');
  });
});

describe('monthGridDays', () => {
  const grid = monthGridDays('2026-08-05');

  test('is six whole weeks', () => {
    expect(grid.length).toBe(42);
  });

  test('starts on a Sunday and ends on a Saturday', () => {
    expect(weekdayOf(grid[0]!)).toBe(0);
    expect(weekdayOf(grid[41]!)).toBe(6);
  });

  test('pads with the neighbouring months', () => {
    expect(grid[0]).toBe('2026-07-26');
    expect(grid).toContain('2026-08-01');
    expect(grid).toContain('2026-08-31');
    expect(grid[41]).toBe('2026-09-05');
  });

  test('is contiguous', () => {
    for (let index = 1; index < grid.length; index += 1) {
      expect(grid[index]).toBe(addDays(grid[index - 1]!, 1));
    }
  });
});

describe('eachDay', () => {
  test('returns a run of consecutive days', () => {
    expect(eachDay('2026-08-05', 3)).toEqual(['2026-08-05', '2026-08-06', '2026-08-07']);
  });

  test('returns nothing for a non-positive count', () => {
    expect(eachDay('2026-08-05', 0)).toEqual([]);
    expect(eachDay('2026-08-05', -2)).toEqual([]);
  });
});

describe('isSameMonth', () => {
  test('compares year and month, not day', () => {
    expect(isSameMonth('2026-08-01', '2026-08-31')).toBe(true);
    expect(isSameMonth('2026-08-31', '2026-09-01')).toBe(false);
    expect(isSameMonth('2025-08-05', '2026-08-05')).toBe(false);
  });
});

describe('toIsoDate', () => {
  test('zero-pads, so string comparison stays chronological', () => {
    expect(toIsoDate(new Date(2026, 7, 5))).toBe('2026-08-05');
    expect(toIsoDate(new Date(2026, 0, 1))).toBe('2026-01-01');
  });
});

describe('toUtcInstant', () => {
  test('carries the wall clock in the UTC fields, unshifted by the machine zone', () => {
    const instant = toUtcInstant('2026-08-05', 9 * 60 + 15);

    expect(instant.getUTCFullYear()).toBe(2026);
    expect(instant.getUTCMonth()).toBe(7);
    expect(instant.getUTCDate()).toBe(5);
    expect(instant.getUTCHours()).toBe(9);
    expect(instant.getUTCMinutes()).toBe(15);
  });
});

describe('minuteToClock', () => {
  test('renders a zero-padded 24-hour clock', () => {
    expect(minuteToClock(0)).toBe('00:00');
    expect(minuteToClock(9 * 60 + 5)).toBe('09:05');
    expect(minuteToClock(13 * 60 + 45)).toBe('13:45');
    expect(minuteToClock(23 * 60 + 59)).toBe('23:59');
  });

  test('wraps rather than producing a negative or >24h clock', () => {
    expect(minuteToClock(1440)).toBe('00:00');
    expect(minuteToClock(-60)).toBe('23:00');
  });
});
