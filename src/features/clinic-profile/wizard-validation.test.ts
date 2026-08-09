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

  test('clears a day-pair error from either end of that day', () => {
    // `closingAfterOpening` is keyed on the close, but moving the *opening*
    // time is an equally valid fix — the message describes the pair.
    expect(clearFieldError({ 'close-3': 'closingAfterOpening' }, 'open-3')).toEqual({});
    expect(clearFieldError({ 'close-3': 'closingAfterOpening' }, 'close-3')).toEqual({});
  });

  test('leaves another day alone when one day is corrected', () => {
    expect(
      clearFieldError({ 'close-3': 'closingAfterOpening', 'close-4': 'invalidTime' }, 'open-3'),
    ).toEqual({ 'close-4': 'invalidTime' });
  });

  test('clears every time error when the whole week is rewritten at once', () => {
    // What "apply these hours to every open day" reports: seven rows changed,
    // so no per-day time error can still be describing what is on screen.
    expect(
      clearFieldError(
        { schedule: 'workingDayRequired', 'open-1': 'invalidTime', 'close-4': 'closingAfterOpening' },
        'schedule',
      ),
    ).toEqual({});
  });

  test('the week-level clear does not touch the other sections', () => {
    expect(clearFieldError({ clinicName: 'required', 'open-1': 'invalidTime' }, 'schedule')).toEqual({
      clinicName: 'required',
    });
  });
});
