import { describe, expect, test } from 'bun:test';

import { validateClinicProfile } from './validation';

const valid = {
  clinic: {
    name: 'Qiwam Clinic',
    phone: '+970 59 123 4567',
    contactEmail: 'clinic@qiwam.test',
    address: 'Ramallah',
  },
  schedule: {
    days: Array.from({ length: 7 }, (_, weekday) => weekday < 5
      ? { weekday, isWorking: true as const, openMinute: 8 * 60, closeMinute: 18 * 60 }
      : { weekday, isWorking: false as const, openMinute: null, closeMinute: null }),
  },
  professional: {
    name: 'Rania Khalil',
    professionalTitle: 'Clinical Dietitian',
    specialty: 'Clinical nutrition',
    phone: '+970 59 765 4321',
    licenseNumber: null,
  },
};

describe('validateClinicProfile', () => {
  test('names every missing required clinic field', () => {
    const result = validateClinicProfile({
      ...valid,
      clinic: { name: '', phone: '', contactEmail: '', address: '' },
    });

    expect(result).toEqual({
      success: false,
      section: 'clinic',
      fieldErrors: {
        clinicName: 'required',
        clinicPhone: 'required',
        contactEmail: 'required',
        address: 'required',
      },
    });
  });

  test('distinguishes invalid email and phone formats', () => {
    const result = validateClinicProfile({
      ...valid,
      clinic: { ...valid.clinic, phone: 'phone', contactEmail: 'wrong' },
    });

    expect(result).toEqual({
      success: false,
      section: 'clinic',
      fieldErrors: { clinicPhone: 'invalidPhone', contactEmail: 'invalidEmail' },
    });
  });

  test('identifies the exact weekday whose closing time is invalid', () => {
    const days = valid.schedule.days.map((day) => day.weekday === 2
      ? { weekday: 2, isWorking: true as const, openMinute: 17 * 60, closeMinute: 9 * 60 }
      : day);

    expect(validateClinicProfile({ ...valid, schedule: { days } })).toEqual({
      success: false,
      section: 'schedule',
      fieldErrors: { 'close-2': 'closingAfterOpening' },
    });
  });

  test('explains that the week needs a working day', () => {
    const days = Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      isWorking: false as const,
      openMinute: null,
      closeMinute: null,
    }));

    expect(validateClinicProfile({ ...valid, schedule: { days } })).toEqual({
      success: false,
      section: 'schedule',
      fieldErrors: { schedule: 'workingDayRequired' },
    });
  });

  test('names every missing required professional field', () => {
    const result = validateClinicProfile({
      ...valid,
      professional: { name: '', professionalTitle: '', specialty: '', phone: '', licenseNumber: '' },
    });

    expect(result).toEqual({
      success: false,
      section: 'professional',
      fieldErrors: {
        name: 'required',
        professionalTitle: 'required',
        specialty: 'required',
        professionalPhone: 'required',
      },
    });
  });

  test('validates one visible section without rejecting untouched later sections', () => {
    const result = validateClinicProfile({
      ...valid,
      professional: { name: '', professionalTitle: '', specialty: '', phone: '', licenseNumber: '' },
    }, ['clinic']);

    expect(result.success).toBe(true);
  });

  test('returns parsed data when every section is valid', () => {
    const result = validateClinicProfile(valid);

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.clinic?.contactEmail).toBe('clinic@qiwam.test');
  });
});
