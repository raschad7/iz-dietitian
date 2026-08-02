import type { ClinicProfileFieldErrors, ProfileSection } from './validation';

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
