import { describe, expect, test } from 'bun:test';

import { clearFieldError, validateWizardSubmission } from './wizard-validation';

const completedForm = () => {
  const form = new FormData();
  form.set('clinicName', 'Rashad Atallah');
  form.set('clinicPhone', '0232333322');
  form.set('contactEmail', 'rashad@example.com');
  form.set('address', 'Ramallah');
  form.set('name', 'Rashad Atallah');
  form.set('professionalTitle', 'deitetions');
  form.set('specialty', 'diet');
  form.set('professionalPhone', '0232333322');
  for (let weekday = 0; weekday < 5; weekday += 1) {
    form.set(`working-${weekday}`, 'on');
    form.set(`open-${weekday}`, '08:00');
    form.set(`close-${weekday}`, '18:00');
  }
  return form;
};

describe('validateWizardSubmission', () => {
  test('accepts the completed values shown in the reported form', () => {
    expect(validateWizardSubmission(completedForm())).toEqual({ submit: true });
  });

  test('blocks locally and identifies the professional section before a server action can reset the form', () => {
    const form = completedForm();
    form.set('professionalTitle', '');

    expect(validateWizardSubmission(form)).toEqual({
      submit: false,
      section: 'professional',
      fieldErrors: { professionalTitle: 'required' },
    });
  });
});

describe('clearFieldError', () => {
  test('clears the corrected field while retaining other actionable errors', () => {
    expect(clearFieldError({ professionalTitle: 'required', specialty: 'required' }, 'professionalTitle')).toEqual({
      specialty: 'required',
    });
  });

  test('clears the week-level error when a working day is selected', () => {
    expect(clearFieldError({ schedule: 'workingDayRequired' }, 'working-2')).toEqual({});
  });
});
