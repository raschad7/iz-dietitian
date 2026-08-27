import { describe, expect, test } from 'bun:test';

import { nextAppointment, splitAppointments } from './appointments';
import { type PortalAppointment } from './types';

function appointment(overrides: Partial<PortalAppointment> = {}): PortalAppointment {
  return {
    id: 'appointment-1',
    date: '2026-08-05',
    startMinute: 10 * 60,
    durationMinutes: 60,
    reason: null,
    hasOpenRequest: false,
    bookedDate: '2026-07-01',
    ...overrides,
  };
}

/** Wednesday 5 August 2026, 10:30 — during the appointment above. */
const DURING = { date: '2026-08-05', minute: 10 * 60 + 30 };

describe('splitAppointments', () => {
  test('counts an appointment that is still running as upcoming', () => {
    // It has not ended, so it is still the thing that is happening — moving it
    // to history mid-consultation would be wrong.
    const { upcoming, past } = splitAppointments([appointment()], DURING);

    expect(upcoming).toHaveLength(1);
    expect(past).toHaveLength(0);
  });

  test('counts one that ended exactly now as past', () => {
    const { past } = splitAppointments([appointment()], { date: '2026-08-05', minute: 11 * 60 });

    expect(past).toHaveLength(1);
  });

  test('orders upcoming soonest first', () => {
    const rows = [
      appointment({ id: 'later', date: '2026-08-20' }),
      appointment({ id: 'sooner', date: '2026-08-06' }),
      appointment({ id: 'same-day-later', date: '2026-08-06', startMinute: 14 * 60 }),
    ];

    expect(splitAppointments(rows, DURING).upcoming.map((row) => row.id)).toEqual([
      'sooner',
      'same-day-later',
      'later',
    ]);
  });

  test('orders history most recent first', () => {
    const rows = [
      appointment({ id: 'oldest', date: '2026-01-01' }),
      appointment({ id: 'recent', date: '2026-08-01' }),
    ];

    expect(splitAppointments(rows, DURING).past.map((row) => row.id)).toEqual(['recent', 'oldest']);
  });

  test('handles a client with nothing at all', () => {
    expect(splitAppointments([], DURING)).toEqual({ upcoming: [], past: [] });
  });
});

describe('nextAppointment', () => {
  test('is the soonest one still to come', () => {
    const rows = [
      appointment({ id: 'past', date: '2026-07-01' }),
      appointment({ id: 'next', date: '2026-08-10' }),
      appointment({ id: 'after', date: '2026-09-01' }),
    ];

    expect(nextAppointment(rows, DURING)?.id).toBe('next');
  });

  test('is null when everything has been', () => {
    expect(nextAppointment([appointment({ date: '2026-01-01' })], DURING)).toBeNull();
  });
});
