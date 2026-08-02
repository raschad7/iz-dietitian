import { describe, expect, test } from 'bun:test';

import { defaultClinicScheduleRows } from './default-schedule';

describe('defaultClinicScheduleRows', () => {
  test('creates seven rows with Sunday through Thursday open 08:00 to 18:00', () => {
    expect(defaultClinicScheduleRows('clinic-id')).toEqual([
      { clinicId: 'clinic-id', weekday: 0, isWorking: true, openMinute: 480, closeMinute: 1080 },
      { clinicId: 'clinic-id', weekday: 1, isWorking: true, openMinute: 480, closeMinute: 1080 },
      { clinicId: 'clinic-id', weekday: 2, isWorking: true, openMinute: 480, closeMinute: 1080 },
      { clinicId: 'clinic-id', weekday: 3, isWorking: true, openMinute: 480, closeMinute: 1080 },
      { clinicId: 'clinic-id', weekday: 4, isWorking: true, openMinute: 480, closeMinute: 1080 },
      { clinicId: 'clinic-id', weekday: 5, isWorking: false, openMinute: null, closeMinute: null },
      { clinicId: 'clinic-id', weekday: 6, isWorking: false, openMinute: null, closeMinute: null },
    ]);
  });
});
