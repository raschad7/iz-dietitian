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
  | 'tooLong'
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

export const ALL_SECTIONS: readonly ProfileSection[] = ['clinic', 'schedule', 'professional'];

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0;
}

/**
 * Whether a Zod issue is "you wrote too much" rather than "you wrote nothing".
 *
 * Both land on the same field, and the mapping below used to answer `required`
 * for either — which is how a 300-character clinic name came back as "This
 * field is required" under a box the reader had just filled. `too_big` is the
 * code `.max()` raises in Zod 4; every other failure on a text field here is
 * either emptiness or a format the field has its own message for.
 */
function isTooLong(issue: { code: string }): boolean {
  return issue.code === 'too_big';
}

/**
 * The blank pass and the schema pass both run, and the blank one wins per field.
 *
 * They used to be sequential: if *any* field was empty the function returned
 * before Zod ever ran, so a 300-character clinic name beside an empty phone
 * reported only the phone — and the name's real problem appeared one round
 * later, after the phone was filled. Two visits to fix two faults that were
 * both true at the same moment.
 *
 * "Empty" still takes precedence over whatever Zod says about the same field,
 * because `required` is the more useful sentence for a box with nothing in it
 * than `too_small` translated.
 */
function validateClinic(raw: ClinicProfileRaw['clinic']): ClinicProfileValidationResult | ClinicInformationInput {
  const fieldErrors: ClinicProfileFieldErrors = {};
  if (isBlank(raw.name)) fieldErrors.clinicName = 'required';
  if (isBlank(raw.phone)) fieldErrors.clinicPhone = 'required';
  if (isBlank(raw.contactEmail)) fieldErrors.contactEmail = 'required';
  if (isBlank(raw.address)) fieldErrors.address = 'required';

  const parsed = clinicInformationSchema.safeParse(raw);
  if (parsed.success && Object.keys(fieldErrors).length === 0) return parsed.data;

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      const long = isTooLong(issue);
      if (field === 'phone') fieldErrors.clinicPhone ??= long ? 'tooLong' : 'invalidPhone';
      if (field === 'contactEmail') fieldErrors.contactEmail ??= long ? 'tooLong' : 'invalidEmail';
      if (field === 'name') fieldErrors.clinicName ??= long ? 'tooLong' : 'required';
      if (field === 'address') fieldErrors.address ??= long ? 'tooLong' : 'required';
      if (field === 'logoUrl') fieldErrors.clinicLogoUrl ??= 'invalidImage';
    }
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

/** Same two-pass merge as {@link validateClinic}; the reasoning is there. */
function validateProfessional(raw: ClinicProfileRaw['professional']): ClinicProfileValidationResult | ProfessionalProfileInput {
  const fieldErrors: ClinicProfileFieldErrors = {};
  if (isBlank(raw.name)) fieldErrors.name = 'required';
  if (isBlank(raw.professionalTitle)) fieldErrors.professionalTitle = 'required';
  if (isBlank(raw.specialty)) fieldErrors.specialty = 'required';

  const parsed = professionalProfileSchema.safeParse(raw);
  if (parsed.success && Object.keys(fieldErrors).length === 0) return parsed.data;

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      const long = isTooLong(issue);
      if (field === 'name') fieldErrors.name ??= long ? 'tooLong' : 'required';
      if (field === 'professionalTitle') fieldErrors.professionalTitle ??= long ? 'tooLong' : 'required';
      if (field === 'specialty') fieldErrors.specialty ??= long ? 'tooLong' : 'required';
    }
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

/**
 * Every section's errors at once, keyed by section.
 *
 * {@link validateClinicProfile} stops at the first section that fails, which is
 * the right shape for a server action deciding whether to write — it has one
 * message to return and nothing to draw. It is the wrong shape for the wizard's
 * Finish button: stopping at the clinic step meant the reader fixed an address,
 * pressed Finish, and was thrown to a *different* step with fresh errors they
 * had never been shown, once per broken section.
 *
 * Sections that pass are absent from the result, so an empty object means the
 * whole form is valid.
 */
export function validateEverySection(
  raw: ClinicProfileRaw,
): Partial<Record<ProfileSection, ClinicProfileFieldErrors>> {
  const failures: Partial<Record<ProfileSection, ClinicProfileFieldErrors>> = {};

  for (const section of ALL_SECTIONS) {
    const result = validateClinicProfile(raw, [section]);
    if (!result.success) failures[section] = result.fieldErrors;
  }

  return failures;
}
