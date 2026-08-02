export type ClinicProfileFormState =
  | { status: 'idle' }
  | { status: 'success'; messageKey: 'saved' }
  | { status: 'warning'; messageKey: 'scheduleConflict'; conflictCount: number }
  | { status: 'error'; messageKey: 'invalid' | 'unexpected' | 'incomplete' };

export const initialClinicProfileFormState: ClinicProfileFormState = { status: 'idle' };

