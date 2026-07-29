'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { type Locale } from '@/i18n/routing';
import { requireStaffClinic } from '@/lib/session';

import { archiveClient, createClient, deleteClient, restoreClient, updateClient } from './mutations';
import { type ClientFormState, type PortalCredentialsState, type RevokePortalAccessState } from './form-state';
import { issuePortalCredentials, reissuePortalPassword, revokePortalAccess } from './portal-credentials';
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

/**
 * Mirrors the Better Auth username plugin's own rules (`src/lib/auth.ts`):
 * 3-60 characters, letters, digits and hyphens. Kept local rather than in
 * `./schema` — the dietitian-facing form is the only caller, and duplicating
 * three lines here beats reaching into a file outside this slice.
 */
const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]+$/)
  .min(3)
  .max(60);

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

/**
 * Issues a client's first portal credentials. Returns the temporary password
 * in the state so the card can display it once — it is never written to the
 * database in plaintext, and this is the only place it is readable at all.
 */
export async function issuePortalCredentialsAction(
  _previousState: PortalCredentialsState,
  formData: FormData,
): Promise<PortalCredentialsState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const id = clientIdSchema.parse(formData.get('clientId'));

  const parsedUsername = usernameSchema.safeParse(formData.get('username'));
  if (!parsedUsername.success) return { status: 'error', messageKey: 'errors.usernameInvalid' };

  try {
    const result = await issuePortalCredentials(clinicId, id, parsedUsername.data);

    if (!result.ok) {
      if (result.code === 'username_taken') return { status: 'error', messageKey: 'errors.usernameTaken' };
      return { status: 'error', messageKey: 'errors.unexpected' };
    }

    revalidatePath(`/${locale}/app/clients`);
    revalidatePath(`/${locale}/app/clients/${id}`);

    return { status: 'issued', username: result.username, temporaryPassword: result.temporaryPassword };
  } catch (error) {
    console.error('[clients] issuing portal credentials failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }
}

/**
 * Issues a fresh temporary password for a client who already has portal
 * access. The username the card submits back is not trusted for anything but
 * display — `reissuePortalPassword` looks the account up by `clientId`.
 */
export async function reissuePortalPasswordAction(
  _previousState: PortalCredentialsState,
  formData: FormData,
): Promise<PortalCredentialsState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const id = clientIdSchema.parse(formData.get('clientId'));

  try {
    const result = await reissuePortalPassword(clinicId, id);

    if (!result.ok) {
      if (result.code === 'username_taken') return { status: 'error', messageKey: 'errors.usernameTaken' };
      return { status: 'error', messageKey: 'errors.unexpected' };
    }

    revalidatePath(`/${locale}/app/clients`);
    revalidatePath(`/${locale}/app/clients/${id}`);

    return { status: 'issued', username: result.username, temporaryPassword: result.temporaryPassword };
  } catch (error) {
    console.error('[clients] reissuing portal password failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }
}

export async function revokePortalAccessAction(
  _previousState: RevokePortalAccessState,
  formData: FormData,
): Promise<RevokePortalAccessState> {
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
