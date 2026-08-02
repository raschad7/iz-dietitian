import type { ClinicInformationInput, ProfessionalProfileInput } from './schema';

export type ClinicDayHours =
  | { weekday: number; isWorking: true; openMinute: number; closeMinute: number }
  | { weekday: number; isWorking: false; openMinute: null; closeMinute: null };

export type ClinicSchedule = {
  days: readonly ClinicDayHours[];
  envelope: { openMinute: number; closeMinute: number };
};

export type ClinicProfileSnapshot = {
  clinic: ClinicInformationInput;
  schedule: ClinicSchedule;
  professional: ProfessionalProfileInput;
  onboardingCompletedAt: Date | null;
};
