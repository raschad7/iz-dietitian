import { describe, expect, test } from 'bun:test';

import { readClinicProfileForm } from './form-data';
import { OTHER_OPTION } from './professional-options';

function baseForm(): FormData {
  const form = new FormData();
  form.set('clinicName', 'Qiwam Clinic');
  form.set('clinicPhone', '+970 59 000 0000');
  form.set('contactEmail', 'hello@qiwam.test');
  form.set('address', 'Ramallah');
  form.set('name', 'Dr Rima');
  form.set('professionalTitle', 'أخصائي تغذية سريرية');
  form.set('specialty', 'التغذية السريرية');
  return form;
}

describe('readClinicProfileForm', () => {
  test('normalizes working and off days from native form controls', () => {
    const form = baseForm();
    form.set('working-0', 'on');
    form.set('open-0', '09:15');
    form.set('close-0', '17:30');

    const value = readClinicProfileForm(form);

    expect(value.schedule.days[0]).toEqual({ weekday: 0, isWorking: true, openMinute: 555, closeMinute: 1050 });
    expect(value.schedule.days[1]).toEqual({ weekday: 1, isWorking: false, openMinute: null, closeMinute: null });
    expect(value.clinic.name).toBe('Qiwam Clinic');
  });

  test('takes the selected title and specialty straight from the lists', () => {
    const value = readClinicProfileForm(baseForm());

    expect(value.professional.professionalTitle).toBe('أخصائي تغذية سريرية');
    expect(value.professional.specialty).toBe('التغذية السريرية');
  });

  test('substitutes the typed value when the reader chose "other"', () => {
    const form = baseForm();
    form.set('professionalTitle', OTHER_OPTION);
    form.set('professionalTitleCustom', 'أخصائي تغذية الأطفال');
    form.set('specialty', OTHER_OPTION);
    form.set('specialtyCustom', 'تغذية كبار السن');

    const value = readClinicProfileForm(form);

    // The literal word "أخرى" must never reach the column: the portal renders
    // the specialty to clients, and "other" tells a client nothing.
    expect(value.professional.professionalTitle).toBe('أخصائي تغذية الأطفال');
    expect(value.professional.specialty).toBe('تغذية كبار السن');
  });

  test('leaves the custom box out of it when a listed option is selected', () => {
    const form = baseForm();
    // Stale text from a box the reader opened and then closed again by picking
    // a real option. The select wins.
    form.set('professionalTitleCustom', 'something typed earlier');

    expect(readClinicProfileForm(form).professional.professionalTitle).toBe('أخصائي تغذية سريرية');
  });
});
