import { describe, expect, test } from 'bun:test';

import { readClinicProfileForm } from './form-data';

describe('readClinicProfileForm', () => {
  test('normalizes working and off days from native form controls', () => {
    const form = new FormData();
    form.set('clinicName', 'Qiwam Clinic');
    form.set('clinicPhone', '+970 59 000 0000');
    form.set('contactEmail', 'hello@qiwam.test');
    form.set('address', 'Ramallah');
    form.set('name', 'Dr Rima');
    form.set('professionalTitle', 'Registered Dietitian');
    form.set('specialty', 'Clinical nutrition');
    form.set('professionalPhone', '+970 59 111 1111');
    form.set('licenseNumber', 'RD-12');
    form.set('working-0', 'on');
    form.set('open-0', '09:15');
    form.set('close-0', '17:30');

    const value = readClinicProfileForm(form);

    expect(value.schedule.days[0]).toEqual({ weekday: 0, isWorking: true, openMinute: 555, closeMinute: 1050 });
    expect(value.schedule.days[1]).toEqual({ weekday: 1, isWorking: false, openMinute: null, closeMinute: null });
    expect(value.clinic.name).toBe('Qiwam Clinic');
    expect(value.professional.phone).toBe('+970 59 111 1111');
  });
});
