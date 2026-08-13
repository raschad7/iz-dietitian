import type { ClinicProfileFieldErrors, ProfileSection, ValidationMessageKey } from './validation';

export type ClinicProfileFormState =
  | { status: 'idle' }
  | { status: 'success'; messageKey: 'saved' }
  | { status: 'warning'; messageKey: 'scheduleConflict'; conflictCount: number }
  | {
      status: 'error';
      messageKey: 'invalid';
      section: ProfileSection;
      fieldErrors: ClinicProfileFieldErrors;
    }
  | { status: 'error'; messageKey: 'unexpected' | 'incomplete'; section?: undefined; fieldErrors?: undefined };

export const initialClinicProfileFormState: ClinicProfileFormState = { status: 'idle' };

/**
 * The result of editing a single field in a dialog.
 *
 * Narrower than `ClinicProfileFormState` on purpose: a dialog edits one value,
 * so there is exactly one possible field error and no section to name. The
 * component reads `status === 'success'` as "close me".
 */
export type FieldEditState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; messageKey: 'unexpected' }
  | { status: 'invalid'; validationKey: ValidationMessageKey };

export const initialFieldEditState: FieldEditState = { status: 'idle' };
