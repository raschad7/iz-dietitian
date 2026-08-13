import {
  clinicInformationSchema,
  professionalProfileSchema,
  weeklyScheduleSchema,
  type ClinicInformationInput,
  type ProfessionalProfileInput,
  type WeeklyScheduleInput,
} from './schema';

export type ProfileSection = 'clinic' | 'schedule' | 'professional';
export type ValidationMessageKey =
  | 'required'
  | 'invalidEmail'
  | 'invalidPhone'
  | 'invalidTime'
  | 'closingAfterOpening'
  | 'workingDayRequired'
  | 'invalidImage';
export type ClinicProfileFieldErrors = Record<string, ValidationMessageKey>;

export type ClinicProfileRaw = {
  clinic: { name: unknown; phone: unknown; contactEmail: unknown; address: unknown; logoUrl?: unknown };
  schedule: { days: Array<{ weekday: number; isWorking: boolean; openMinute: number | null; closeMinute: number | null }> };
  professional: {
    name: unknown;
    professionalTitle: unknown;
    specialty: unknown;
    phone: unknown;
    licenseNumber: unknown;
  };
};

type ValidatedProfile = {
  clinic?: ClinicInformationInput;
  schedule?: WeeklyScheduleInput;
  professional?: ProfessionalProfileInput;
};

export type ClinicProfileValidationResult =
  | { success: true; data: ValidatedProfile }
  | { success: false; section: ProfileSection; fieldErrors: ClinicProfileFieldErrors };

const ALL_SECTIONS: readonly ProfileSection[] = ['clinic', 'schedule', 'professional'];

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0;
}

function validateClinic(raw: ClinicProfileRaw['clinic']): ClinicProfileValidationResult | ClinicInformationInput {
  const fieldErrors: ClinicProfileFieldErrors = {};
  if (isBlank(raw.name)) fieldErrors.clinicName = 'required';
  if (isBlank(raw.phone)) fieldErrors.clinicPhone = 'required';
  if (isBlank(raw.contactEmail)) fieldErrors.contactEmail = 'required';
  if (isBlank(raw.address)) fieldErrors.address = 'required';
  if (Object.keys(fieldErrors).length > 0) return { success: false, section: 'clinic', fieldErrors };

  const parsed = clinicInformationSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (field === 'phone') fieldErrors.clinicPhone = 'invalidPhone';
    if (field === 'contactEmail') fieldErrors.contactEmail = 'invalidEmail';
    if (field === 'name') fieldErrors.clinicName = 'required';
    if (field === 'address') fieldErrors.address = 'required';
    if (field === 'logoUrl') fieldErrors.clinicLogoUrl = 'invalidImage';
  }
  return { success: false, section: 'clinic', fieldErrors };
}

function validateSchedule(raw: ClinicProfileRaw['schedule']): ClinicProfileValidationResult | WeeklyScheduleInput {
  const fieldErrors: ClinicProfileFieldErrors = {};
  if (!raw.days.some((day) => day.isWorking)) fieldErrors.schedule = 'workingDayRequired';

  for (const day of raw.days) {
    if (!day.isWorking) continue;
    if (!Number.isFinite(day.openMinute) || day.openMinute === null || day.openMinute % 15 !== 0) {
      fieldErrors[`open-${day.weekday}`] = 'invalidTime';
    }
    if (!Number.isFinite(day.closeMinute) || day.closeMinute === null || day.closeMinute % 15 !== 0) {
      fieldErrors[`close-${day.weekday}`] = 'invalidTime';
    }
    if (
      Number.isFinite(day.openMinute)
      && Number.isFinite(day.closeMinute)
      && day.openMinute !== null
      && day.closeMinute !== null
      && day.openMinute >= day.closeMinute
    ) {
      fieldErrors[`close-${day.weekday}`] = 'closingAfterOpening';
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { success: false, section: 'schedule', fieldErrors };
  const parsed = weeklyScheduleSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return { success: false, section: 'schedule', fieldErrors: { schedule: 'invalidTime' } };
}

function validateProfessional(raw: ClinicProfileRaw['professional']): ClinicProfileValidationResult | ProfessionalProfileInput {
  const fieldErrors: ClinicProfileFieldErrors = {};
  if (isBlank(raw.name)) fieldErrors.name = 'required';
  if (isBlank(raw.professionalTitle)) fieldErrors.professionalTitle = 'required';
  if (isBlank(raw.specialty)) fieldErrors.specialty = 'required';
  if (isBlank(raw.phone)) fieldErrors.professionalPhone = 'required';
  if (Object.keys(fieldErrors).length > 0) return { success: false, section: 'professional', fieldErrors };

  const parsed = professionalProfileSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (field === 'phone') fieldErrors.professionalPhone = 'invalidPhone';
    if (field === 'name') fieldErrors.name = 'required';
    if (field === 'professionalTitle') fieldErrors.professionalTitle = 'required';
    if (field === 'specialty') fieldErrors.specialty = 'required';
  }
  return { success: false, section: 'professional', fieldErrors };
}

export function validateClinicProfile(
  raw: ClinicProfileRaw,
  sections: readonly ProfileSection[] = ALL_SECTIONS,
): ClinicProfileValidationResult {
  const data: ValidatedProfile = {};
  for (const section of sections) {
    const result = section === 'clinic'
      ? validateClinic(raw.clinic)
      : section === 'schedule'
        ? validateSchedule(raw.schedule)
        : validateProfessional(raw.professional);

    if ('success' in result) return result;
    data[section] = result as never;
  }
  return { success: true, data };
}
