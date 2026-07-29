import { describe, expect, test } from 'bun:test';

import { hasEnded, isCompleted, nowLineMinute, wallClockIn } from './completed';

/** A 10:00–11:00 appointment on Wednesday 5 August 2026. */
const APPOINTMENT = { date: '2026-08-05', startMinute: 10 * 60, durationMinutes: 60 };

/** Local time, matching how the browser clock is read. */
function at(year: number, month: number, day: number, hour: number, minute: number): Date {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

describe('isCompleted', () => {
  test('is false before the clock has been read', () => {
    // First render: the server does not know the user's local time, so nothing
    // is completed until the shared clock populates after mount.
    expect(isCompleted(APPOINTMENT, null)).toBe(false);
  });

  test('is false while the appointment is still ahead on the same day', () => {
    expect(isCompleted(APPOINTMENT, at(2026, 8, 5, 9, 59))).toBe(false);
  });

  test('is false while the appointment is running', () => {
    expect(isCompleted(APPOINTMENT, at(2026, 8, 5, 10, 30))).toBe(false);
  });

  test('is false one minute before the end', () => {
    expect(isCompleted(APPOINTMENT, at(2026, 8, 5, 10, 59))).toBe(false);
  });

  test('is true at exactly the end minute', () => {
    // The boundary: the slot is over at 11:00 and the next may start then.
    expect(isCompleted(APPOINTMENT, at(2026, 8, 5, 11, 0))).toBe(true);
  });

  test('is true one minute after the end', () => {
    expect(isCompleted(APPOINTMENT, at(2026, 8, 5, 11, 1))).toBe(true);
  });

  test('is true for any time on a later day', () => {
    expect(isCompleted(APPOINTMENT, at(2026, 8, 6, 0, 1))).toBe(true);
    expect(isCompleted(APPOINTMENT, at(2027, 1, 1, 12, 0))).toBe(true);
  });

  test('is false for any time on an earlier day', () => {
    expect(isCompleted(APPOINTMENT, at(2026, 8, 4, 23, 59))).toBe(false);
    expect(isCompleted(APPOINTMENT, at(2025, 12, 31, 23, 59))).toBe(false);
  });

  test('compares dates chronologically, not by string length or month order', () => {
    const september = { ...APPOINTMENT, date: '2026-09-01' };
    expect(isCompleted(september, at(2026, 8, 31, 23, 59))).toBe(false);

    const july = { ...APPOINTMENT, date: '2026-07-31' };
    expect(isCompleted(july, at(2026, 8, 1, 0, 0))).toBe(true);
  });

  test('handles an appointment that ends at midnight', () => {
    const late = { date: '2026-08-05', startMinute: 23 * 60, durationMinutes: 60 };
    expect(isCompleted(late, at(2026, 8, 5, 23, 59))).toBe(false);
    expect(isCompleted(late, at(2026, 8, 6, 0, 0))).toBe(true);
  });
});

describe('hasEnded', () => {
  test('agrees with isCompleted, since it is the same comparison', () => {
    expect(hasEnded(APPOINTMENT, { date: '2026-08-05', minute: 10 * 60 + 59 })).toBe(false);
    expect(hasEnded(APPOINTMENT, { date: '2026-08-05', minute: 11 * 60 })).toBe(true);
    expect(hasEnded(APPOINTMENT, { date: '2026-08-04', minute: 23 * 60 + 59 })).toBe(false);
    expect(hasEnded(APPOINTMENT, { date: '2026-08-06', minute: 0 })).toBe(true);
  });
});

describe('wallClockIn', () => {
  /** 2026-08-05T06:30:00Z. Asia/Hebron is UTC+3 in August, so 09:30 locally. */
  const INSTANT = new Date(Date.UTC(2026, 7, 5, 6, 30));

  test('reads the clinic wall clock, not the machine one', () => {
    expect(wallClockIn('Asia/Hebron', INSTANT)).toEqual({ date: '2026-08-05', minute: 9 * 60 + 30 });
  });

  test('is unaffected by the runtime zone, so CI agrees with a laptop', () => {
    expect(wallClockIn('UTC', INSTANT)).toEqual({ date: '2026-08-05', minute: 6 * 60 + 30 });
  });

  test('rolls the date over when the zone is ahead', () => {
    // 22:30Z is already the 6th in Asia/Hebron.
    const late = new Date(Date.UTC(2026, 7, 5, 22, 30));
    expect(wallClockIn('Asia/Hebron', late).date).toBe('2026-08-06');
  });

  test('renders midnight as minute 0, never as hour 24 on the wrong day', () => {
    // 21:00Z is 00:00 on the 6th in Asia/Hebron — the `h23` cycle matters here.
    const midnight = new Date(Date.UTC(2026, 7, 5, 21, 0));
    expect(wallClockIn('Asia/Hebron', midnight)).toEqual({ date: '2026-08-06', minute: 0 });
  });

  test('zero-pads, so the date stays comparable as a string', () => {
    const early = new Date(Date.UTC(2026, 0, 2, 5, 5));
    expect(wallClockIn('Asia/Hebron', early).date).toBe('2026-01-02');
  });
});

describe('nowLineMinute', () => {
  test('returns minutes from midnight on today', () => {
    expect(nowLineMinute('2026-08-05', at(2026, 8, 5, 14, 30))).toBe(870);
  });

  test('returns null on any other day, so there is no line to draw', () => {
    expect(nowLineMinute('2026-08-06', at(2026, 8, 5, 14, 30))).toBeNull();
    expect(nowLineMinute('2026-08-04', at(2026, 8, 5, 14, 30))).toBeNull();
  });

  test('returns null before the clock has been read', () => {
    expect(nowLineMinute('2026-08-05', null)).toBeNull();
  });

  test('returns 0 at exactly midnight rather than a falsy-looking null', () => {
    expect(nowLineMinute('2026-08-05', at(2026, 8, 5, 0, 0))).toBe(0);
  });
});
