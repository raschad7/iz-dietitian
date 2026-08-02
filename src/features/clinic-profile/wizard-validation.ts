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

export function clearFieldError(
  fieldErrors: ClinicProfileFieldErrors,
  fieldName: string,
): ClinicProfileFieldErrors {
  const relatedNames = fieldName.startsWith('working-') ? new Set([fieldName, 'schedule']) : new Set([fieldName]);
  return Object.fromEntries(Object.entries(fieldErrors).filter(([name]) => !relatedNames.has(name)));
}
