import { describe, expect, test } from 'bun:test';

import { FIELD_LIMITS } from './schema';
import { validateClinicProfile, validateEverySection } from './validation';

const valid = {
  clinic: {
    name: 'Enzyme Clinic',
    phone: '0599123456',
    contactEmail: 'clinic@enzyme.test',
    address: 'Ramallah',
  },
  schedule: {
    days: Array.from({ length: 7 }, (_, weekday) => weekday < 5
      ? { weekday, isWorking: true as const, openMinute: 8 * 60, closeMinute: 18 * 60 }
      : { weekday, isWorking: false as const, openMinute: null, closeMinute: null }),
  },
  professional: {
    name: 'Rania Khalil',
    professionalTitle: 'أخصائي تغذية سريرية',
    specialty: 'التغذية السريرية',
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
      professional: { name: '', professionalTitle: '', specialty: '' },
    });

    expect(result).toEqual({
      success: false,
      section: 'professional',
      fieldErrors: {
        name: 'required',
        professionalTitle: 'required',
        specialty: 'required',
      },
    });
  });

  test('validates one visible section without rejecting untouched later sections', () => {
    const result = validateClinicProfile({
      ...valid,
      professional: { name: '', professionalTitle: '', specialty: '' },
    }, ['clinic']);

    expect(result.success).toBe(true);
  });

  test('returns parsed data when every section is valid', () => {
    const result = validateClinicProfile(valid);

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.clinic?.contactEmail).toBe('clinic@enzyme.test');
  });

  test('reports an over-long clinic name as too long, not as missing', () => {
    // The cap existed; the message did not. Every issue on this field mapped to
    // `required`, so a 300-character name was reported as "this field is
    // required" under a box with 300 characters in it.
    const result = validateClinicProfile({
      ...valid,
      clinic: { ...valid.clinic, name: 'ع'.repeat(FIELD_LIMITS.clinicName + 1) },
    });

    expect(result).toEqual({
      success: false,
      section: 'clinic',
      fieldErrors: { clinicName: 'tooLong' },
    });
  });

  test('accepts a name of exactly the maximum length', () => {
    const result = validateClinicProfile({
      ...valid,
      clinic: { ...valid.clinic, name: 'ع'.repeat(FIELD_LIMITS.clinicName) },
    });

    expect(result.success).toBe(true);
  });

  test('separates a too-long address from an empty one', () => {
    const long = validateClinicProfile({
      ...valid,
      clinic: { ...valid.clinic, address: 'x'.repeat(FIELD_LIMITS.address + 1) },
    });
    const empty = validateClinicProfile({ ...valid, clinic: { ...valid.clinic, address: '  ' } });

    expect(long).toMatchObject({ fieldErrors: { address: 'tooLong' } });
    expect(empty).toMatchObject({ fieldErrors: { address: 'required' } });
  });

  test('reports an empty field and an over-long one in the same pass', () => {
    // These were sequential: any blank field returned before the schema ran, so
    // a 300-character name beside an empty phone reported only the phone, and
    // the name's own fault surfaced a round later.
    const result = validateClinicProfile({
      ...valid,
      clinic: { ...valid.clinic, phone: '', name: 'ع'.repeat(FIELD_LIMITS.clinicName + 1) },
    });

    expect(result).toEqual({
      success: false,
      section: 'clinic',
      fieldErrors: { clinicPhone: 'required', clinicName: 'tooLong' },
    });
  });

  test('reports an over-long professional title as too long', () => {
    const result = validateClinicProfile({
      ...valid,
      professional: {
        ...valid.professional,
        professionalTitle: 'ت'.repeat(FIELD_LIMITS.professionalTitle + 1),
      },
    });

    expect(result).toMatchObject({
      section: 'professional',
      fieldErrors: { professionalTitle: 'tooLong' },
    });
  });
});

describe('validateEverySection', () => {
  test('is empty for a complete form', () => {
    expect(validateEverySection(valid)).toEqual({});
  });

  test('reports every failing section at once', () => {
    // What Finish needs and `validateClinicProfile` cannot give it: stopping at
    // the first failure meant the reader fixed the clinic, pressed Finish, and
    // was thrown to a different step with errors they had never been shown —
    // once per broken section.
    const failures = validateEverySection({
      ...valid,
      clinic: { ...valid.clinic, contactEmail: 'not-an-email' },
      professional: { name: '', professionalTitle: '', specialty: '' },
    });

    expect(Object.keys(failures).sort()).toEqual(['clinic', 'professional']);
    expect(failures.clinic).toEqual({ contactEmail: 'invalidEmail' });
    expect(failures.professional).toEqual({
      name: 'required',
      professionalTitle: 'required',
      specialty: 'required',
    });
  });

  test('leaves a passing section out entirely', () => {
    const failures = validateEverySection({
      ...valid,
      schedule: {
        days: Array.from({ length: 7 }, (_, weekday) => ({
          weekday,
          isWorking: false as const,
          openMinute: null,
          closeMinute: null,
        })),
      },
    });

    expect(failures).toEqual({ schedule: { schedule: 'workingDayRequired' } });
  });
});
