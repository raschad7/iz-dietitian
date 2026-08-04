import { describe, expect, test } from 'bun:test';

import { buildNotifications, type PortalNotification } from './notifications';
import { type PortalAppointment, type PortalRequest } from './types';

/** Wednesday 5 August 2026. */
const WEDNESDAY = '2026-08-05';
const SUNDAY = '2026-08-02';
const NOW = { date: WEDNESDAY, minute: 9 * 60 };

function appointment(overrides: Partial<PortalAppointment> = {}): PortalAppointment {
  return {
    id: 'apt-1',
    date: WEDNESDAY,
    startMinute: 9 * 60,
    durationMinutes: 30,
    reason: null,
    hasOpenRequest: false,
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
});
