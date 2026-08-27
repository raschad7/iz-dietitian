import { describe, expect, test } from 'bun:test';

import { OTHER_OPTION } from './professional-options';
import {
  ARRIVAL_GRACE_MS,
  clearFieldError,
  FINISH_BUTTON_ID,
  isDeliberateFinish,
  validateWizardSubmission,
} from './wizard-validation';

const completedForm = () => {
  const form = new FormData();
  form.set('clinicName', 'Rashad Atallah');
  // As `PhoneField` writes it — a calling code and the national digits. The
  // wizard used to post ten bare digits; see the note on `phoneSchema`.
  form.set('clinicPhone', '+970232333322');
  form.set('contactEmail', 'rashad@example.com');
  form.set('address', 'Ramallah');
  form.set('name', 'Rashad Atallah');
  form.set('professionalTitle', 'أخصائي تغذية');
  form.set('specialty', 'التغذية العلاجية');
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
      firstSection: 'professional',
      failures: { professional: { professionalTitle: 'required' } },
    });
  });

  test('reports every broken section, not just the earliest one', () => {
    // Finish is a claim about all three steps, so the answer to it is
    // everything still outstanding. Returning only the first meant one press
    // per broken section, each one relocating the reader to a step they had
    // not seen fail.
    const form = completedForm();
    form.set('address', '');
    form.set('specialty', '');

    const decision = validateWizardSubmission(form);

    expect(decision.submit).toBe(false);
    if (decision.submit) return;
    expect(decision.firstSection).toBe('clinic');
    expect(decision.failures).toEqual({
      clinic: { address: 'required' },
      professional: { specialty: 'required' },
    });
  });

  test('resolves the custom box when the reader chose "other"', () => {
    const form = completedForm();
    form.set('specialty', OTHER_OPTION);
    form.set('specialtyCustom', 'تغذية الحوامل');

    expect(validateWizardSubmission(form)).toEqual({ submit: true });
  });

  test('rejects "other" with nothing typed beside it', () => {
    const form = completedForm();
    form.set('specialty', OTHER_OPTION);
    form.set('specialtyCustom', '   ');

    expect(validateWizardSubmission(form)).toEqual({
      submit: false,
      firstSection: 'professional',
      failures: { professional: { specialty: 'required' } },
    });
  });
});

describe('isDeliberateFinish', () => {
  const finishPress = {
    submitterId: FINISH_BUTTON_ID,
    onLastStep: true,
    sinceStepChange: 5_000,
  };

  test('accepts a press of Finish on the last step', () => {
    expect(isDeliberateFinish(finishPress)).toBe(true);
  });

  test('rejects the submit that rides along with the arrival on the last step', () => {
    // The reported bug. Continue and Finish are one DOM node whose `type` flips
    // to `submit` as the step lands, so a second activation in the same burst —
    // the tail of a double click, a repeating Enter — reaches this with the last
    // step already current. It is the arrival, not a decision.
    expect(isDeliberateFinish({ ...finishPress, sinceStepChange: 0 })).toBe(false);
    expect(isDeliberateFinish({ ...finishPress, sinceStepChange: ARRIVAL_GRACE_MS - 1 })).toBe(
      false,
    );
    expect(isDeliberateFinish({ ...finishPress, sinceStepChange: ARRIVAL_GRACE_MS })).toBe(true);
  });

  test('rejects an implicit submission, which reports no submitter', () => {
    expect(isDeliberateFinish({ ...finishPress, submitterId: null })).toBe(false);
  });

  test('rejects a submit raised by any other control', () => {
    expect(isDeliberateFinish({ ...finishPress, submitterId: 'apply-to-all' })).toBe(false);
  });

  test('rejects a submit raised anywhere but the last step', () => {
    expect(isDeliberateFinish({ ...finishPress, onLastStep: false })).toBe(false);
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
