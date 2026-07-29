'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { type Locale } from '@/i18n/routing';
import { requireStaffClinic } from '@/lib/session';

import {
  archiveClient,
  createClient,
  deleteClient,
  invitePortalAccess,
  restoreClient,
  revokePortalAccess,
  updateClient,
} from './mutations';
import { type ClientFormState, type PortalActionState } from './form-state';
import { clientFormSchema, clientIdSchema, localeSchema } from './schema';

/**
 * A server action is a public endpoint. The layout guard protects the page
 * render, not the mutation, so every action below re-verifies the session and
 * scopes every write to the caller's own clinic.
 *
 * State shapes and their initial values live in `./form-state` — this module is
 * `"use server"`, and such a module may only export async functions.
 */

function readForm(formData: FormData) {
  return {
    fullName: formData.get('fullName'),
    phone: formData.get('phone'),
    email: formData.get('email'),
    preferredLocale: formData.get('preferredLocale'),
    dateOfBirth: formData.get('dateOfBirth'),
    sex: formData.get('sex'),
    heightCm: formData.get('heightCm'),
    goal: formData.get('goal'),
    activityLevel: formData.get('activityLevel'),
    medicalNotes: formData.get('medicalNotes'),
    allergies: formData.get('allergies'),
    notes: formData.get('notes'),
  };
}

function readLocale(formData: FormData): Locale {
  return localeSchema.parse(formData.get('locale'));
}

export async function createClientAction(
  _previousState: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const parsed = clientFormSchema.safeParse(readForm(formData));

  if (!parsed.success) {
    return {
      status: 'error',
      messageKey: 'errors.invalid',
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  let id: string;

  try {
    ({ id } = await createClient(clinicId, parsed.data));
  } catch (error) {
    console.error('[clients] create failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }

  revalidatePath(`/${locale}/app/clients`);

  // Outside the try/catch — `redirect` signals by throwing.
  redirect(`/${locale}/app/clients/${id}`);
}

export async function updateClientAction(
  _previousState: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const id = clientIdSchema.parse(formData.get('clientId'));
  const parsed = clientFormSchema.safeParse(readForm(formData));

  if (!parsed.success) {
    return {
      status: 'error',
      messageKey: 'errors.invalid',
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  try {
    await updateClient(clinicId, id, parsed.data);
  } catch (error) {
    console.error('[clients] update failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }

  revalidatePath(`/${locale}/app/clients`);
  revalidatePath(`/${locale}/app/clients/${id}`);

  redirect(`/${locale}/app/clients/${id}`);
}

/** Archive and restore share a form; the intent arrives as a field. */
export async function setClientStatusAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const id = clientIdSchema.parse(formData.get('clientId'));
  const intent = z.enum(['archive', 'restore']).parse(formData.get('intent'));

  if (intent === 'archive') {
    await archiveClient(clinicId, id);
  } else {
    await restoreClient(clinicId, id);
  }

  revalidatePath(`/${locale}/app/clients`);
  revalidatePath(`/${locale}/app/clients/${id}`);
}

/**
 * Permanently deletes a client, then returns to the list — there is no detail
 * page left to go back to. The UI asks for confirmation first; this does not,
 * because a server action cannot.
 */
export async function deleteClientAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const id = clientIdSchema.parse(formData.get('clientId'));

  await deleteClient(clinicId, id);

  revalidatePath(`/${locale}/app/clients`);

  redirect(`/${locale}/app/clients`);
}

export async function invitePortalAccessAction(
  _previousState: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const id = clientIdSchema.parse(formData.get('clientId'));

  // NOTE: the magic-link notification this action used to send after creating
  // the account is gone along with the plugin. This whole action is superseded
  // by credential issuing (`issuePortalCredentials` in a later wave) — it is
  // left just well-formed enough to typecheck until that wave replaces it.
  try {
    const result = await invitePortalAccess(clinicId, id);

    if (!result.ok) {
      if (result.code === 'no_email') return { status: 'error', messageKey: 'errors.noEmail' };
      if (result.code === 'email_taken') return { status: 'error', messageKey: 'errors.emailTaken' };
      return { status: 'error', messageKey: 'errors.unexpected' };
    }
  } catch (error) {
    console.error('[clients] invite failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }

  revalidatePath(`/${locale}/app/clients`);
  revalidatePath(`/${locale}/app/clients/${id}`);

  return { status: 'success', messageKey: 'portal.invited' };
}

export async function revokePortalAccessAction(
  _previousState: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const id = clientIdSchema.parse(formData.get('clientId'));

  try {
    await revokePortalAccess(clinicId, id);
  } catch (error) {
    console.error('[clients] revoke failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }

  revalidatePath(`/${locale}/app/clients`);
  revalidatePath(`/${locale}/app/clients/${id}`);

  return { status: 'success', messageKey: 'portal.revoked' };
}
