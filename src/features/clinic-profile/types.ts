import type { ClinicInformationInput, ProfessionalProfileInput } from './schema';

export type ClinicDayHours =
  | { weekday: number; isWorking: true; openMinute: number; closeMinute: number }
  | { weekday: number; isWorking: false; openMinute: null; closeMinute: null };

export type ClinicSchedule = {
  days: readonly ClinicDayHours[];
  envelope: { openMinute: number; closeMinute: number };
};

export type ClinicProfileSnapshot = {
  /**
   * The writable clinic fields, plus the mark — which is read here but never
   * written through `saveClinicInformation`. See `clinicInformationSchema`.
   */
  clinic: ClinicInformationInput & { logoUrl: string | null };
  schedule: ClinicSchedule;
  professional: ProfessionalProfileInput;
  onboardingCompletedAt: Date | null;
};
