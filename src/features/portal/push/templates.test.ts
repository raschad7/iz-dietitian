import { describe, expect, test } from 'bun:test';

import { type IsoDate } from '@/features/booking/date';

import { pushConsentKind, pushDestination, renderPushPayload, type PushMessage } from './templates';

const APPOINTMENT: PushMessage = {
  kind: 'appointment_reminder',
  date: '2026-09-01' as IsoDate,
  startMinute: 9 * 60 + 30,
};

describe('pushDestination', () => {
  test('carries the locale prefix every portal URL has', () => {
    expect(pushDestination('ar', 'plan_update')).toBe('/ar/portal');
    expect(pushDestination('en', 'plan_update')).toBe('/en/portal');
  });

  test('each kind opens the screen that holds its detail', () => {
    expect(pushDestination('ar', 'appointment_reminder')).toBe('/ar/portal/appointments');
    expect(pushDestination('ar', 'clinic_message')).toBe('/ar/portal/notifications');
    expect(pushDestination('ar', 'check_in_reminder')).toBe('/ar/portal');
  });

  test('a tail overrides the default without escaping the portal', () => {
    expect(pushDestination('en', 'clinic_message', 'profile')).toBe('/en/portal/profile');
  });
});

describe('renderPushPayload', () => {
  test('writes the message in the device locale, not the sender', () => {
    const ar = renderPushPayload(APPOINTMENT, 'ar', { dedupeKey: 'reminder:a:2026-09-01' });
    const en = renderPushPayload(APPOINTMENT, 'en', { dedupeKey: 'reminder:a:2026-09-01' });

    expect(ar.title).toBe('تذكير بموعدك');
    expect(en.title).toBe('Appointment reminder');
    expect(ar.body).not.toBe(en.body);
  });

  test('formats the appointment date and time in that same locale', () => {
    const en = renderPushPayload(APPOINTMENT, 'en', { dedupeKey: 'k' });

    // The whole message is written in one language — the date included, which
    // is the reason the template takes raw values rather than formatted ones.
    expect(en.body).toContain('9:30');
    expect(en.body).toContain('2026');
  });

  test('the tag is the dedupe key, so one event collapses and two do not', () => {
    const first = renderPushPayload(APPOINTMENT, 'ar', { dedupeKey: 'reminder:a:2026-09-01' });
    const again = renderPushPayload(APPOINTMENT, 'ar', { dedupeKey: 'reminder:a:2026-09-01' });
    const other = renderPushPayload(APPOINTMENT, 'ar', { dedupeKey: 'reminder:b:2026-09-02' });

    expect(first.tag).toBe(again.tag);
    expect(first.tag).not.toBe(other.tag);
  });

  test('every kind renders a title, a body and a portal URL', () => {
    const messages: PushMessage[] = [
      APPOINTMENT,
      { kind: 'appointment_changed', change: 'cancelled', date: '2026-09-01' as IsoDate, startMinute: 570 },
      { kind: 'appointment_changed', change: 'moved', date: '2026-09-01' as IsoDate, startMinute: 570 },
      { kind: 'check_in_reminder' },
      { kind: 'plan_update' },
      { kind: 'clinic_message', outcome: 'approved' },
      { kind: 'clinic_message', outcome: 'declined' },
      { kind: 'clinic_message', outcome: 'answered' },
    ];

    for (const message of messages) {
      for (const locale of ['ar', 'en'] as const) {
        const payload = renderPushPayload(message, locale, { dedupeKey: 'k' });

        expect(payload.title.length).toBeGreaterThan(0);
        expect(payload.body.length).toBeGreaterThan(0);
        expect(payload.url.startsWith(`/${locale}/portal`)).toBe(true);
        // The consent kind, which is not always the message kind — see
        // `MESSAGE_CONSENT`.
        expect(payload.kind).toBe(pushConsentKind(message));
      }
    }
  });

  test('the three clinic-message outcomes are three different sentences', () => {
    const approved = renderPushPayload({ kind: 'clinic_message', outcome: 'approved' }, 'ar', {
      dedupeKey: 'k',
    });
    const declined = renderPushPayload({ kind: 'clinic_message', outcome: 'declined' }, 'ar', {
      dedupeKey: 'k',
    });
    const answered = renderPushPayload({ kind: 'clinic_message', outcome: 'answered' }, 'ar', {
      dedupeKey: 'k',
    });

    expect(new Set([approved.body, declined.body, answered.body]).size).toBe(3);
  });

  test('carries nothing that would be unwelcome on a lock screen', () => {
    // The rule the templates file states: a notification names an event and
    // points at the screen holding the detail. Nothing here interpolates a
    // free-text value, so there is no path for a dish, a note or a
    // measurement to reach a payload — this asserts the shape that guarantees
    // it, since a future template taking a string would break it.
    const payload = renderPushPayload({ kind: 'plan_update' }, 'en', { dedupeKey: 'plan:2026-08-31' });

    expect(Object.keys(payload).toSorted()).toEqual(['body', 'kind', 'tag', 'title', 'url']);
  });
});

describe('appointment changes', () => {
  const MOVED: PushMessage = {
    kind: 'appointment_changed',
    change: 'moved',
    date: '2026-09-01' as IsoDate,
    startMinute: 14 * 60,
  };
  const CANCELLED: PushMessage = { ...MOVED, change: 'cancelled' } as PushMessage;

  test('a move and a cancellation are two different messages', () => {
    const moved = renderPushPayload(MOVED, 'ar', { dedupeKey: 'rescheduled:a:2026-09-01:840' });
    const cancelled = renderPushPayload(CANCELLED, 'ar', { dedupeKey: 'cancelled:a' });

    expect(moved.title).not.toBe(cancelled.title);
    expect(moved.body).not.toBe(cancelled.body);
  });

  test('both name the slot, in the device locale', () => {
    const en = renderPushPayload(MOVED, 'en', { dedupeKey: 'k' });

    expect(en.body).toContain('2:00');
    expect(en.body).toContain('2026');
  });

  test('both open the appointments screen', () => {
    expect(renderPushPayload(MOVED, 'ar', { dedupeKey: 'k' }).url).toBe('/ar/portal/appointments');
    expect(renderPushPayload(CANCELLED, 'en', { dedupeKey: 'k' }).url).toBe('/en/portal/appointments');
  });

  test('they answer to the clinic-message switch, not the reminder one', () => {
    // A cancellation is news to act on rather than a nudge before a visit —
    // see `MESSAGE_CONSENT`. Getting this wrong would let a client who
    // switched off pre-appointment reminders miss being told their visit was
    // cancelled.
    expect(pushConsentKind(CANCELLED)).toBe('clinic_message');
    expect(pushConsentKind(MOVED)).toBe('clinic_message');
    expect(pushConsentKind(APPOINTMENT)).toBe('appointment_reminder');
  });
});
