import { describe, expect, test } from 'bun:test';

import {
  clampMessageBody,
  formatAppointmentList,
  MAX_BODY_LENGTH,
  renderWhatsappMessage,
} from './templates';

const variables = {
  clientName: 'أحمد خليل',
  clinicName: 'عيادة التغذية',
  date: '5 August 2026',
  time: '9:15 AM',
};

describe('renderWhatsappMessage', () => {
  test('renders the Arabic reminder with every value filled in', () => {
    const body = renderWhatsappMessage('appointmentReminder', 'ar', variables);

    expect(body).toContain('أحمد خليل');
    expect(body).toContain('عيادة التغذية');
    expect(body).toContain('5 August 2026');
    expect(body).toContain('9:15 AM');
    // Nothing may reach a patient with a placeholder still in it.
    expect(body).not.toContain('{');
  });

  test('renders the English reminder', () => {
    const body = renderWhatsappMessage('appointmentReminder', 'en', variables);

    expect(body).toContain('A reminder of your appointment');
    expect(body).not.toContain('{');
  });

  test('the two locales produce different text for the same variables', () => {
    expect(renderWhatsappMessage('appointmentConfirmation', 'ar', variables)).not.toBe(
      renderWhatsappMessage('appointmentConfirmation', 'en', variables),
    );
  });

  test('throws rather than sending a message containing a placeholder', () => {
    expect(() =>
      renderWhatsappMessage('portalCredentials', 'en', {
        ...variables,
        username: 'ahmad-1234',
        // password deliberately absent
      }),
    ).toThrow(/\{password\}/);
  });

  test('treats an empty string as a missing value', () => {
    expect(() => renderWhatsappMessage('appointmentReminder', 'en', { ...variables, time: '' })).toThrow(/\{time\}/);
  });

  test('includes the credentials and no sign-in link', () => {
    const body = renderWhatsappMessage('portalCredentials', 'ar', {
      ...variables,
      username: 'ahmad-1234',
      password: 'temp-pass-99',
    });

    expect(body).toContain('ahmad-1234');
    expect(body).toContain('temp-pass-99');

    // The link was removed from this template deliberately; asserting its
    // absence is what stops it drifting back in beside the password.
    expect(body).not.toContain('client-login');
    expect(body).not.toContain('http');
  });

  test('the reschedule names both the old slot and the new one', () => {
    const body = renderWhatsappMessage('appointmentRescheduled', 'ar', {
      ...variables,
      previousDate: '3 August 2026',
      previousTime: '10:00 AM',
    });

    // Both, or the patient cannot tell which of the two is now in their diary.
    expect(body).toContain('3 August 2026');
    expect(body).toContain('10:00 AM');
    expect(body).toContain('5 August 2026');
    expect(body).toContain('9:15 AM');
    expect(body).toContain('تم تغيير موعدك');
    expect(body).not.toContain('{');
  });

  test('the reschedule renders in English too', () => {
    const body = renderWhatsappMessage('appointmentRescheduled', 'en', {
      ...variables,
      previousDate: '3 August 2026',
      previousTime: '10:00 AM',
    });

    expect(body).toContain('has been changed');
    expect(body).not.toContain('{');
  });

  test('a reschedule with no previous slot throws rather than sending half a sentence', () => {
    expect(() => renderWhatsappMessage('appointmentRescheduled', 'ar', variables)).toThrow(/\{previousDate\}/);
  });

  test('the cancellation names the appointment being cancelled', () => {
    const body = renderWhatsappMessage('appointmentCancelled', 'ar', variables);

    expect(body).toContain('تم إلغاء موعدك');
    expect(body).toContain('5 August 2026');
    expect(body).toContain('9:15 AM');
    expect(body).not.toContain('{');
  });

  test('the cancellation renders in English too', () => {
    expect(renderWhatsappMessage('appointmentCancelled', 'en', variables)).toContain('has been cancelled');
  });

  test('the cancellation needs no previous slot', () => {
    expect(() => renderWhatsappMessage('appointmentCancelled', 'en', variables)).not.toThrow();
  });

  test('truncates a pathological value instead of producing a body the gateway rejects', () => {
    const body = renderWhatsappMessage('appointmentReminder', 'en', {
      ...variables,
      clientName: 'x'.repeat(MAX_BODY_LENGTH * 2),
    });

    expect(body.length).toBe(MAX_BODY_LENGTH);
    expect(body.endsWith('…')).toBe(true);
  });
});

describe('clampMessageBody', () => {
  test('trims surrounding whitespace', () => {
    expect(clampMessageBody('  hello  ')).toBe('hello');
  });

  test('caps a hand-typed message at what WhatsApp accepts', () => {
    expect(clampMessageBody('a'.repeat(MAX_BODY_LENGTH + 100)).length).toBe(MAX_BODY_LENGTH);
  });

  test('leaves an ordinary message untouched', () => {
    expect(clampMessageBody('تذكير بموعدك غدًا')).toBe('تذكير بموعدك غدًا');
  });
});

/**
 * The one message that covers a course of appointments booked together.
 *
 * The count in these is the point: a patient told "your 4 appointments" must be
 * able to count four lines, whatever span the doctor chose.
 */
describe('the appointment series', () => {
  const course = [
    { date: '12 August 2026', time: '10:00 AM', duration: '30 min' },
    { date: '19 August 2026', time: '10:00 AM', duration: '30 min' },
    { date: '26 August 2026', time: '10:00 AM', duration: '30 min' },
    { date: '2 September 2026', time: '10:00 AM', duration: '30 min' },
  ];

  test('lists every appointment, numbered, one per line', () => {
    const list = formatAppointmentList(course);

    expect(list.split('\n')).toHaveLength(4);
    expect(list).toContain('1. 📅 12 August 2026 — 🕐 10:00 AM (30 min)');
    expect(list).toContain('4. 📅 2 September 2026 — 🕐 10:00 AM (30 min)');
  });

  test('the message states the count and carries every date', () => {
    const body = renderWhatsappMessage('appointmentSeries', 'ar', {
      ...variables,
      count: String(course.length),
      appointments: formatAppointmentList(course),
    });

    expect(body).toContain('4');
    for (const appointment of course) expect(body).toContain(appointment.date);
    expect(body).not.toContain('{');
  });

  test('the count follows the list, whatever span was chosen', () => {
    // Thirteen weeks and one week render from the same template — nothing about
    // the copy assumes four.
    for (const size of [2, 13, 26]) {
      const many = Array.from({ length: size }, (_, index) => ({
        date: `date-${index}`,
        time: '10:00 AM',
        duration: '30 min',
      }));

      const body = renderWhatsappMessage('appointmentSeries', 'en', {
        ...variables,
        count: String(size),
        appointments: formatAppointmentList(many),
      });

      expect(body).toContain(`Your ${size} appointments`);
      expect(body).toContain(`${size}. 📅 date-${size - 1}`);
      expect(body).not.toContain('{');
    }
  });

  test('refuses to send a series with nothing listed in it', () => {
    expect(() =>
      renderWhatsappMessage('appointmentSeries', 'en', { ...variables, count: '0', appointments: '' }),
    ).toThrow(/\{appointments\}/);
  });
});
