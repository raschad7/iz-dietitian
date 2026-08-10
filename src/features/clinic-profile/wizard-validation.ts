import { readClinicProfileForm } from './form-data';
import {
  validateClinicProfile,
  type ClinicProfileFieldErrors,
  type ProfileSection,
} from './validation';

export type WizardSubmissionDecision =
  | { submit: true }
  | { submit: false; section: ProfileSection; fieldErrors: ClinicProfileFieldErrors };

/** Stops an invalid wizard before React's form action can reset its fields. */
export function validateWizardSubmission(formData: FormData): WizardSubmissionDecision {
  const result = validateClinicProfile(readClinicProfileForm(formData));
  return result.success
    ? { submit: true }
    : { submit: false, section: result.section, fieldErrors: result.fieldErrors };
}

/**
 * Drops the errors a change to `fieldName` could have fixed.
 *
 * Three of the schedule's messages are about something wider than the box that
 * carries them, so correcting one field has to clear more than its own name:
 *
 * - `workingDayRequired` is keyed on `schedule` and answered by turning *any*
 *   day on.
 * - `closingAfterOpening` is keyed on `close-N` but is a fact about the pair —
 *   moving the opening time is just as valid a fix, so either end clears both.
 * - `schedule` itself is what "apply these hours to every day" reports, and
 *   that rewrites all seven rows at once, so it clears every time error too.
 */
export function clearFieldError(
  fieldErrors: ClinicProfileFieldErrors,
  fieldName: string,
): ClinicProfileFieldErrors {
  if (fieldName === 'schedule') {
    return Object.fromEntries(
      Object.entries(fieldErrors).filter(([name]) => !/^(?:schedule|open-\d|close-\d)$/.test(name)),
    );
  }

  const related = new Set([fieldName]);

  if (fieldName.startsWith('working-')) related.add('schedule');

  const dayPair = /^(?:open|close)-(\d)$/.exec(fieldName);
  if (dayPair) {
    related.add(`open-${dayPair[1]}`);
    related.add(`close-${dayPair[1]}`);
  }

  return Object.fromEntries(Object.entries(fieldErrors).filter(([name]) => !related.has(name)));
}
