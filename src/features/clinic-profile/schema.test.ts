import { describe, expect, test } from 'bun:test';

import { PROFESSIONAL_TITLE_OPTIONS, SPECIALTY_OPTIONS } from './professional-options';
import {
  FIELD_LIMITS,
  clinicInformationSchema,
  professionalProfileSchema,
  weeklyScheduleSchema,
} from './schema';

const workingDay = (weekday: number, openMinute = 9 * 60, closeMinute = 17 * 60) => ({
  weekday,
  isWorking: true as const,
  openMinute,
  closeMinute,
});

const offDay = (weekday: number) => ({
  weekday,
  isWorking: false as const,
  openMinute: null,
  closeMinute: null,
});

describe('clinicInformationSchema', () => {
  test('normalizes required clinic contact information', () => {
    expect(
      clinicInformationSchema.parse({
        name: '  Enzyme Clinic  ',
        phone: '  0599123456  ',
        contactEmail: '  TEAM@ENZYME.TEST ',
        address: '  Ramallah, Main Street  ',
      }),
    ).toEqual({
      name: 'Enzyme Clinic',
      phone: '0599123456',
      contactEmail: 'team@enzyme.test',
      address: 'Ramallah, Main Street',
    });
  });

  test('requires the phone to be exactly ten digits', () => {
    const base = { name: 'Enzyme Clinic', contactEmail: 'team@enzyme.test', address: 'Ramallah' };
    const accepts = (phone: string) => clinicInformationSchema.safeParse({ ...base, phone }).success;

    expect(accepts('0599123456')).toBe(true);
    expect(accepts('059912345')).toBe(false); // nine
    expect(accepts('05991234567')).toBe(false); // eleven

    // Separators are rejected rather than stripped, so the counter the reader
    // watches ("n of 10") counts the same characters the rule does.
    expect(accepts('059 912 3456')).toBe(false);
    expect(accepts('+970599123456')).toBe(false);
    expect(accepts('059-912-3456')).toBe(false);
    expect(accepts('abcdefghij')).toBe(false);
  });

  test('rejects a missing required clinic field', () => {
    expect(
      clinicInformationSchema.safeParse({
        name: 'Enzyme Clinic',
        phone: '',
        contactEmail: 'team@enzyme.test',
        address: 'Ramallah',
      }).success,
    ).toBe(false);
  });
});

describe('weeklyScheduleSchema', () => {
  test('accepts exactly seven distinct days with at least one working day', () => {
    const days = [workingDay(0), workingDay(1), workingDay(2), workingDay(3), workingDay(4), offDay(5), offDay(6)];
    expect(weeklyScheduleSchema.parse({ days }).days).toEqual(days);
  });

  test('rejects a duplicate weekday', () => {
    const days = [workingDay(0), workingDay(0), workingDay(2), workingDay(3), workingDay(4), offDay(5), offDay(6)];
    expect(weeklyScheduleSchema.safeParse({ days }).success).toBe(false);
  });

  test('rejects a week with every day off', () => {
    expect(weeklyScheduleSchema.safeParse({ days: Array.from({ length: 7 }, (_, day) => offDay(day)) }).success).toBe(false);
  });

  test('rejects working times outside 15-minute boundaries', () => {
    const days = [workingDay(0, 541), workingDay(1), workingDay(2), workingDay(3), workingDay(4), offDay(5), offDay(6)];
    expect(weeklyScheduleSchema.safeParse({ days }).success).toBe(false);
  });

  test('rejects incoherent off-day times', () => {
    const days: unknown[] = [workingDay(0), workingDay(1), workingDay(2), workingDay(3), workingDay(4), offDay(5), offDay(6)];
    days[5] = { ...(days[5] as object), openMinute: 540 };
    expect(weeklyScheduleSchema.safeParse({ days }).success).toBe(false);
  });
});

describe('FIELD_LIMITS', () => {
  test('holds the lengths the product asked for', () => {
    // Pinned rather than inferred: these three are product decisions, not
    // arithmetic, and a silent widening is exactly the drift that let a clinic
    // name look unbounded in the first place.
    expect(FIELD_LIMITS.clinicName).toBe(50);
    expect(FIELD_LIMITS.address).toBe(120);
    expect(FIELD_LIMITS.practitionerName).toBe(50);
    // The ceiling on what "أخرى" lets someone type.
    expect(FIELD_LIMITS.professionalTitle).toBe(50);
    expect(FIELD_LIMITS.specialty).toBe(50);
    // Both the digit count and the character ceiling for the clinic phone.
    expect(FIELD_LIMITS.clinicPhone).toBe(10);
  });

  test('every offered option fits inside its own limit', () => {
    // A list that offered a value its own schema rejects would be a trap the
    // reader walks into by picking the obvious answer.
    for (const option of PROFESSIONAL_TITLE_OPTIONS) {
      expect(option.value.length).toBeLessThanOrEqual(FIELD_LIMITS.professionalTitle);
    }
    for (const option of SPECIALTY_OPTIONS) {
      expect(option.value.length).toBeLessThanOrEqual(FIELD_LIMITS.specialty);
    }
  });

  test('caps a typed "other" title and specialty at 50', () => {
    const professional = { name: 'Rania Khalil', specialty: 'التغذية السريرية' };

    expect(professionalProfileSchema.safeParse({ ...professional, professionalTitle: 'ت'.repeat(50) }).success).toBe(true);
    expect(professionalProfileSchema.safeParse({ ...professional, professionalTitle: 'ت'.repeat(51) }).success).toBe(false);

    const title = { name: 'Rania Khalil', professionalTitle: 'أخصائي تغذية' };
    expect(professionalProfileSchema.safeParse({ ...title, specialty: 'خ'.repeat(50) }).success).toBe(true);
    expect(professionalProfileSchema.safeParse({ ...title, specialty: 'خ'.repeat(51) }).success).toBe(false);
  });

  test('the schemas actually enforce them', () => {
    const base = { phone: '0599123456', contactEmail: 'a@b.com', address: 'Ramallah' };

    expect(clinicInformationSchema.safeParse({ ...base, name: 'ع'.repeat(50) }).success).toBe(true);
    expect(clinicInformationSchema.safeParse({ ...base, name: 'ع'.repeat(51) }).success).toBe(false);

    expect(clinicInformationSchema.safeParse({ ...base, name: 'Clinic', address: 'x'.repeat(120) }).success).toBe(true);
    expect(clinicInformationSchema.safeParse({ ...base, name: 'Clinic', address: 'x'.repeat(121) }).success).toBe(false);

    const professional = { professionalTitle: 'أخصائي تغذية', specialty: 'التغذية السريرية' };
    expect(professionalProfileSchema.safeParse({ ...professional, name: 'ن'.repeat(50) }).success).toBe(true);
    expect(professionalProfileSchema.safeParse({ ...professional, name: 'ن'.repeat(51) }).success).toBe(false);
  });
});

describe('professionalProfileSchema', () => {
  test('requires professional identity and trims what it is given', () => {
    expect(
      professionalProfileSchema.parse({
        name: '  Rania Khalil ',
        professionalTitle: ' أخصائي تغذية سريرية ',
        specialty: ' التغذية الرياضية ',
      }),
    ).toEqual({
      name: 'Rania Khalil',
      professionalTitle: 'أخصائي تغذية سريرية',
      specialty: 'التغذية الرياضية',
    });
  });

  test('ignores a phone or a licence number that is still being sent', () => {
    // Both fields were removed from every screen; the columns stay. A stale
    // caller passing them must not be able to write them back in by accident.
    const parsed = professionalProfileSchema.parse({
      name: 'Rania Khalil',
      professionalTitle: 'أخصائي تغذية',
      specialty: 'التغذية السريرية',
      phone: '0599123456',
      licenseNumber: 'RD-12',
    });

    expect(parsed).not.toHaveProperty('phone');
    expect(parsed).not.toHaveProperty('licenseNumber');
  });

  test('accepts a title the list does not offer, because "other" is typed', () => {
    expect(
      professionalProfileSchema.parse({
        name: 'Rania Khalil',
        professionalTitle: 'أخصائي تغذية الأطفال',
        specialty: 'تغذية كبار السن',
      }).professionalTitle,
    ).toBe('أخصائي تغذية الأطفال');
  });
});
