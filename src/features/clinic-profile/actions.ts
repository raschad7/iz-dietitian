'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { locales, type Locale } from '@/i18n/routing';
import { requireStaffClinic } from '@/lib/session';

import { readClinicProfileForm } from './form-data';
import type { ClinicProfileFormState } from './form-state';
import {
  completeOnboarding,
  saveClinicInformation,
  saveProfessionalProfile,
  saveWeeklySchedule,
} from './mutations';
import { countFutureScheduleConflicts } from './queries';
import { clinicInformationSchema, professionalProfileSchema, weeklyScheduleSchema } from './schema';

const localeSchema = z.enum(locales);

function localeFrom(formData: FormData): Locale {
  return localeSchema.parse(formData.get('locale'));
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function saveClinicInformationAction(
  _previous: ClinicProfileFormState,
  formData: FormData,
): Promise<ClinicProfileFormState> {
  const locale = localeFrom(formData);
  const { clinicId } = await requireStaffClinic(locale);
  const parsed = clinicInformationSchema.safeParse(readClinicProfileForm(formData).clinic);
  if (!parsed.success) return { status: 'error', messageKey: 'invalid' };

  try {
    if (!(await saveClinicInformation(clinicId, parsed.data))) return { status: 'error', messageKey: 'unexpected' };
    revalidatePath(`/${locale}/app/profile`);
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
  const parsed = weeklyScheduleSchema.safeParse(readClinicProfileForm(formData).schedule);
  if (!parsed.success) return { status: 'error', messageKey: 'invalid' };

  try {
    const conflictCount = await countFutureScheduleConflicts(clinicId, parsed.data.days, today());
    await saveWeeklySchedule(clinicId, parsed.data);
    revalidatePath(`/${locale}/app/profile`);
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
  const parsed = professionalProfileSchema.safeParse(readClinicProfileForm(formData).professional);
  if (!parsed.success) return { status: 'error', messageKey: 'invalid' };

  try {
    if (!(await saveProfessionalProfile(clinicId, session.user.id, parsed.data))) {
      return { status: 'error', messageKey: 'unexpected' };
    }
    revalidatePath(`/${locale}/app/profile`);
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
  const clinic = clinicInformationSchema.safeParse(raw.clinic);
  const schedule = weeklyScheduleSchema.safeParse(raw.schedule);
  const professional = professionalProfileSchema.safeParse(raw.professional);
  if (!clinic.success || !schedule.success || !professional.success) {
    return { status: 'error', messageKey: 'invalid' };
  }

  try {
    await saveClinicInformation(clinicId, clinic.data);
    await saveWeeklySchedule(clinicId, schedule.data);
    await saveProfessionalProfile(clinicId, session.user.id, professional.data);
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

