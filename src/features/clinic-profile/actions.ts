'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { locales, type Locale } from '@/i18n/routing';
import { requireStaffClinic } from '@/lib/session';

import { readClinicProfileForm } from './form-data';
import type { ClinicProfileFormState, FieldEditState } from './form-state';
import {
  completeOnboarding,
  saveClinicInformation,
  saveProfessionalProfile,
  saveWeeklySchedule,
  updateClinicField,
  updateProfessionalField,
} from './mutations';
import { countFutureScheduleConflicts, getClinicProfile } from './queries';
import {
  clinicInformationSchema,
  clinicLogoInputSchema,
  professionalProfileSchema,
  type ClinicInformationInput,
  type ProfessionalProfileInput,
} from './schema';
import { validateClinicProfile, type ValidationMessageKey } from './validation';

const localeSchema = z.enum(locales);

function localeFrom(formData: FormData): Locale {
  return localeSchema.parse(formData.get('locale'));
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Which validation message a field's failure produces.
 *
 * The whole-form validator in `validation.ts` derives these from Zod issue
 * paths across three sections at once. A dialog knows exactly which field it is
 * editing before it submits, so the mapping is a lookup rather than a scan —
 * and being a `satisfies` record, adding a field to either schema without
 * giving it a message is a compile error rather than a dialog that fails
 * silently.
 */
const CLINIC_FIELD_MESSAGES = {
  name: 'required',
  phone: 'invalidPhone',
  contactEmail: 'invalidEmail',
  address: 'required',
  logoUrl: 'invalidImage',
} as const satisfies Record<keyof ClinicInformationInput | 'logoUrl', ValidationMessageKey>;

/**
 * The logo is not a member of `clinicInformationSchema` — see the ⚠ there — so
 * a field editor targeting it validates against the standalone schema instead.
 */
const CLINIC_FIELD_SCHEMAS = {
  ...clinicInformationSchema.shape,
  logoUrl: clinicLogoInputSchema,
};

const PROFESSIONAL_FIELD_MESSAGES = {
  name: 'required',
  professionalTitle: 'required',
  specialty: 'required',
  phone: 'invalidPhone',
  licenseNumber: 'required',
} as const satisfies Record<keyof ProfessionalProfileInput, ValidationMessageKey>;

type ClinicEditableField = keyof typeof CLINIC_FIELD_SCHEMAS;

const clinicFieldSchema = z.enum(Object.keys(CLINIC_FIELD_MESSAGES) as [ClinicEditableField]);
const professionalFieldSchema = z.enum(
  Object.keys(PROFESSIONAL_FIELD_MESSAGES) as [keyof ProfessionalProfileInput],
);

/** One clinic field, edited in a dialog. */
export async function updateClinicFieldAction(
  _previous: FieldEditState,
  formData: FormData,
): Promise<FieldEditState> {
  const locale = localeFrom(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const field = clinicFieldSchema.parse(formData.get('field'));
  // `?? ''` and not `?? null`: an absent field and a cleared one are the same
  // intent, and every field schema already turns an empty string into whatever
  // its own empty means — `null` for the logo, a length error for a name.
  const parsed = CLINIC_FIELD_SCHEMAS[field].safeParse(formData.get('value') ?? '');
  if (!parsed.success) return { status: 'invalid', validationKey: CLINIC_FIELD_MESSAGES[field] };

  try {
    if (!(await updateClinicField(clinicId, field, parsed.data as string | null))) {
      return { status: 'error', messageKey: 'unexpected' };
    }
  } catch (error) {
    console.error('[clinic-profile] clinic field update failed', error);
    return { status: 'error', messageKey: 'unexpected' };
  }

  revalidatePath(`/${locale}/app/settings/clinic`);
  // The rail draws the clinic's mark and name, and it is rendered by the app
  // layout — so a logo or rename that only revalidated this page would leave
  // the old one on screen until a full reload.
  revalidatePath(`/${locale}/app`, 'layout');
  return { status: 'success' };
}

/** One field of the signed-in practitioner's profile, edited in a dialog. */
export async function updateProfessionalFieldAction(
  _previous: FieldEditState,
  formData: FormData,
): Promise<FieldEditState> {
  const locale = localeFrom(formData);
  const { clinicId, session } = await requireStaffClinic(locale);

  const field = professionalFieldSchema.parse(formData.get('field'));
  const parsed = professionalProfileSchema.shape[field].safeParse(formData.get('value') ?? '');
  if (!parsed.success) return { status: 'invalid', validationKey: PROFESSIONAL_FIELD_MESSAGES[field] };

  try {
    const profile = await getClinicProfile(clinicId, session.user.id);
    if (!profile) return { status: 'error', messageKey: 'unexpected' };

    const saved = await updateProfessionalField(
      clinicId,
      session.user.id,
      profile.professional,
      field,
      parsed.data as string | null,
    );
    if (!saved) return { status: 'error', messageKey: 'unexpected' };
  } catch (error) {
    console.error('[clinic-profile] professional field update failed', error);
    return { status: 'error', messageKey: 'unexpected' };
  }

  revalidatePath(`/${locale}/app/settings/profile`);
  // `name` is mirrored onto `user.name`, which the rail's account row draws.
  revalidatePath(`/${locale}/app`, 'layout');
  return { status: 'success' };
}

export async function saveClinicInformationAction(
  _previous: ClinicProfileFormState,
  formData: FormData,
): Promise<ClinicProfileFormState> {
  const locale = localeFrom(formData);
  const { clinicId } = await requireStaffClinic(locale);
  const parsed = validateClinicProfile(readClinicProfileForm(formData), ['clinic']);
  if (!parsed.success) return { status: 'error', messageKey: 'invalid', ...parsed };

  try {
    if (!(await saveClinicInformation(clinicId, parsed.data.clinic!))) return { status: 'error', messageKey: 'unexpected' };
    revalidatePath(`/${locale}/app/settings/clinic`);
    return { status: 'success', messageKey: 'saved' };
  } catch (error) {
    console.error('[clinic-profile] clinic information save failed', error);
    return { status: 'error', messageKey: 'unexpected' };
  }
}

export async function saveWeeklyScheduleAction(
  _previous: ClinicProfileFormState,
  formData: FormData,
): Promise<ClinicProfileFormState> {
  const locale = localeFrom(formData);
  const { clinicId } = await requireStaffClinic(locale);
  const parsed = validateClinicProfile(readClinicProfileForm(formData), ['schedule']);
  if (!parsed.success) return { status: 'error', messageKey: 'invalid', ...parsed };

  try {
    const schedule = parsed.data.schedule!;
    const conflictCount = await countFutureScheduleConflicts(clinicId, schedule.days, today());
    await saveWeeklySchedule(clinicId, schedule);
    revalidatePath(`/${locale}/app/settings/clinic`);
    revalidatePath(`/${locale}/app/calendar`);
    return conflictCount > 0
      ? { status: 'warning', messageKey: 'scheduleConflict', conflictCount }
      : { status: 'success', messageKey: 'saved' };
  } catch (error) {
    console.error('[clinic-profile] schedule save failed', error);
    return { status: 'error', messageKey: 'unexpected' };
  }
}

export async function saveProfessionalProfileAction(
  _previous: ClinicProfileFormState,
  formData: FormData,
): Promise<ClinicProfileFormState> {
  const locale = localeFrom(formData);
  const { clinicId, session } = await requireStaffClinic(locale);
  const parsed = validateClinicProfile(readClinicProfileForm(formData), ['professional']);
  if (!parsed.success) return { status: 'error', messageKey: 'invalid', ...parsed };

  try {
    if (!(await saveProfessionalProfile(clinicId, session.user.id, parsed.data.professional!))) {
      return { status: 'error', messageKey: 'unexpected' };
    }
    revalidatePath(`/${locale}/app/settings/profile`);
    return { status: 'success', messageKey: 'saved' };
  } catch (error) {
    console.error('[clinic-profile] professional profile save failed', error);
    return { status: 'error', messageKey: 'unexpected' };
  }
}

export async function completeClinicOnboardingAction(
  _previous: ClinicProfileFormState,
  formData: FormData,
): Promise<ClinicProfileFormState> {
  const locale = localeFrom(formData);
  const { clinicId, session } = await requireStaffClinic(locale);
  const raw = readClinicProfileForm(formData);
  const parsed = validateClinicProfile(raw);
  if (!parsed.success) return { status: 'error', messageKey: 'invalid', ...parsed };

  try {
    await saveClinicInformation(clinicId, parsed.data.clinic!);
    await saveWeeklySchedule(clinicId, parsed.data.schedule!);
    await saveProfessionalProfile(clinicId, session.user.id, parsed.data.professional!);
    if (!(await completeOnboarding(clinicId, session.user.id))) {
      return { status: 'error', messageKey: 'incomplete' };
    }
  } catch (error) {
    console.error('[clinic-profile] onboarding completion failed', error);
    return { status: 'error', messageKey: 'unexpected' };
  }

  revalidatePath(`/${locale}/app`, 'layout');
  redirect(`/${locale}/app`);
}
