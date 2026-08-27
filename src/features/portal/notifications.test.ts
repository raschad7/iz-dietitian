import { describe, expect, test } from 'bun:test';

import { buildNotifications, notificationHref, type PortalNotification } from './notifications';
import { type PortalAppointment, type PortalRequest } from './types';

/** Wednesday 5 August 2026. */
const WEDNESDAY = '2026-08-05';
const SUNDAY = '2026-08-02';
const NOW = { date: WEDNESDAY, minute: 9 * 60 };

/** Well outside {@link RECENTLY_BOOKED_WINDOW_DAYS}, so an ordinary fixture never triggers `appointmentBooked` by accident. */
const LONG_AGO = '2026-07-01';

function appointment(overrides: Partial<PortalAppointment> = {}): PortalAppointment {
  return {
    id: 'apt-1',
    date: WEDNESDAY,
    startMinute: 9 * 60,
    durationMinutes: 30,
    reason: null,
    hasOpenRequest: false,
    bookedDate: LONG_AGO,
    ...overrides,
  };
}

function request(overrides: Partial<PortalRequest> = {}): PortalRequest {
  return {
    id: 'req-1',
    kind: 'reschedule',
    status: 'approved',
    preferredDate: null,
    preferredStartMinute: null,
    note: null,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    appointment: null,
    ...overrides,
  };
}

function kindsOf(items: PortalNotification[]): string[] {
  return items.map((item) => item.kind);
}

describe('buildNotifications', () => {
  test('reminds about today when nothing has been logged yet', () => {
    const items = buildNotifications({
      now: NOW,
      todayAdherenceLevel: null,
      appointments: [],
      requests: [],
      currentWeekPlanStartDate: null,
    });

    expect(kindsOf(items)).toContain('adherenceReminder');
  });

  test('says nothing about adherence once today is logged', () => {
    const items = buildNotifications({
      now: NOW,
      todayAdherenceLevel: 'full',
      appointments: [],
      requests: [],
      currentWeekPlanStartDate: null,
    });

    expect(kindsOf(items)).not.toContain('adherenceReminder');
  });

  test('reminds about an appointment within the window', () => {
    const items = buildNotifications({
      now: NOW,
      todayAdherenceLevel: 'full',
      appointments: [appointment({ date: WEDNESDAY })],
      requests: [],
      currentWeekPlanStartDate: null,
    });

    expect(items).toContainEqual(
      expect.objectContaining({ kind: 'appointmentReminder', date: WEDNESDAY }),
    );
  });

  test('stays quiet about an appointment far in the future', () => {
    const items = buildNotifications({
      now: NOW,
      todayAdherenceLevel: 'full',
      appointments: [appointment({ date: '2026-08-20' })],
      requests: [],
      currentWeekPlanStartDate: null,
    });

    expect(kindsOf(items)).not.toContain('appointmentReminder');
  });

  test('flags a plan published for the current week', () => {
    const items = buildNotifications({
      now: NOW,
      todayAdherenceLevel: 'full',
      appointments: [],
      requests: [],
      currentWeekPlanStartDate: SUNDAY,
    });

    expect(items).toContainEqual(
      expect.objectContaining({ kind: 'planUpdate', weekStartDate: SUNDAY }),
    );
  });

  test('ignores a plan published for a different week', () => {
    const items = buildNotifications({
      now: NOW,
      todayAdherenceLevel: 'full',
      appointments: [],
      requests: [],
      currentWeekPlanStartDate: '2026-07-26',
    });

    expect(kindsOf(items)).not.toContain('planUpdate');
  });

  test('surfaces answered requests, newest first', () => {
    const older = request({ id: 'req-old', status: 'declined', updatedAt: new Date('2026-08-01T00:00:00Z') });
    const newer = request({ id: 'req-new', status: 'approved', updatedAt: new Date('2026-08-03T00:00:00Z') });

    const items = buildNotifications({
      now: NOW,
      todayAdherenceLevel: 'full',
      appointments: [],
      requests: [older, newer],
      currentWeekPlanStartDate: null,
    });

    const messages = items.filter((item): item is Extract<PortalNotification, { kind: 'clinicMessage' }> =>
      item.kind === 'clinicMessage',
    );

    expect(messages.map((item) => item.id)).toEqual(['request-req-new', 'request-req-old']);
  });

  test('ignores requests still pending or withdrawn', () => {
    const items = buildNotifications({
      now: NOW,
      todayAdherenceLevel: 'full',
      appointments: [],
      requests: [request({ status: 'pending' }), request({ id: 'req-2', status: 'withdrawn' })],
      currentWeekPlanStartDate: null,
    });

    expect(kindsOf(items)).not.toContain('clinicMessage');
  });

  test('an empty portal produces an empty feed', () => {
    const items = buildNotifications({
      now: NOW,
      todayAdherenceLevel: 'full',
      appointments: [],
      requests: [],
      currentWeekPlanStartDate: null,
    });

    expect(items).toEqual([]);
  });

  test('flags an appointment booked today or yesterday', () => {
    const items = buildNotifications({
      now: NOW,
      todayAdherenceLevel: 'full',
      appointments: [
        appointment({ id: 'apt-today', date: '2026-09-10', bookedDate: WEDNESDAY }),
        appointment({ id: 'apt-yesterday', date: '2026-09-11', bookedDate: '2026-08-04' }),
        appointment({ id: 'apt-too-old', date: '2026-09-12', bookedDate: SUNDAY }),
      ],
      requests: [],
      currentWeekPlanStartDate: null,
    });

    expect(items).toContainEqual(
      expect.objectContaining({ kind: 'appointmentBooked', id: 'booked-apt-today' }),
    );
    expect(items).toContainEqual(
      expect.objectContaining({ kind: 'appointmentBooked', id: 'booked-apt-yesterday' }),
    );
    expect(items.filter((item) => item.kind === 'appointmentBooked')).toHaveLength(2);
  });

  test('stays quiet about an appointment booked more than a day ago', () => {
    const items = buildNotifications({
      now: NOW,
      todayAdherenceLevel: 'full',
      appointments: [appointment({ bookedDate: LONG_AGO })],
      requests: [],
      currentWeekPlanStartDate: null,
    });

    expect(kindsOf(items)).not.toContain('appointmentBooked');
  });

  test('does not double up on the appointment already carrying the upcoming reminder', () => {
    // Booked yesterday *and* close enough to remind about — both real facts,
    // but one card each, not two about the same visit. See the exclusion in
    // `buildNotifications`.
    const items = buildNotifications({
      now: NOW,
      todayAdherenceLevel: 'full',
      appointments: [appointment({ id: 'apt-1', date: WEDNESDAY, bookedDate: WEDNESDAY })],
      requests: [],
      currentWeekPlanStartDate: null,
    });

    expect(kindsOf(items)).toContain('appointmentReminder');
    expect(kindsOf(items)).not.toContain('appointmentBooked');
  });

  test('a second, unrelated appointment booked yesterday still gets its own card', () => {
    // Same setup as above, plus a second appointment far outside the reminder
    // window that was also booked yesterday — it has no reminder card to
    // collide with, so it gets a booked card of its own.
    const items = buildNotifications({
      now: NOW,
      todayAdherenceLevel: 'full',
      appointments: [
        appointment({ id: 'apt-soon', date: WEDNESDAY, bookedDate: WEDNESDAY }),
        appointment({ id: 'apt-later', date: '2026-09-20', bookedDate: WEDNESDAY }),
      ],
      requests: [],
      currentWeekPlanStartDate: null,
    });

    expect(items).toContainEqual(
      expect.objectContaining({ kind: 'appointmentBooked', id: 'booked-apt-later' }),
    );
  });
});

describe('notificationHref', () => {
  test('every appointment-related kind opens the appointments tab', () => {
    expect(notificationHref('appointmentReminder')).toBe('/portal/appointments');
    expect(notificationHref('appointmentBooked')).toBe('/portal/appointments');
    expect(notificationHref('clinicMessage')).toBe('/portal/appointments');
  });

  test('an adherence reminder and a plan update both open the home tab', () => {
    expect(notificationHref('adherenceReminder')).toBe('/portal');
    expect(notificationHref('planUpdate')).toBe('/portal');
  });
});
