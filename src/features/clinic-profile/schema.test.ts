import { describe, expect, test } from 'bun:test';

import {
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
        name: '  Qiwam Clinic  ',
        phone: '  +970 59 123 4567  ',
        contactEmail: '  TEAM@QIWAM.TEST ',
        address: '  Ramallah, Main Street  ',
      }),
    ).toEqual({
      name: 'Qiwam Clinic',
      phone: '+970 59 123 4567',
      contactEmail: 'team@qiwam.test',
      address: 'Ramallah, Main Street',
    });
  });

  test('rejects a missing required clinic field', () => {
    expect(
      clinicInformationSchema.safeParse({
        name: 'Qiwam Clinic',
        phone: '',
        contactEmail: 'team@qiwam.test',
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

describe('professionalProfileSchema', () => {
  test('requires professional identity and normalizes an empty license to null', () => {
    expect(
      professionalProfileSchema.parse({
        name: '  Rania Khalil ',
        professionalTitle: ' Clinical Dietitian ',
        specialty: ' Sports nutrition ',
        phone: ' 0599 123 456 ',
        licenseNumber: '   ',
      }),
    ).toEqual({
      name: 'Rania Khalil',
      professionalTitle: 'Clinical Dietitian',
      specialty: 'Sports nutrition',
      phone: '0599 123 456',
      licenseNumber: null,
    });
  });
});
