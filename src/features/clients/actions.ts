'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { type Locale } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { requireStaffSession } from '@/lib/session';

import {
  archiveClient,
  createClient,
  invitePortalAccess,
  restoreClient,
  revokePortalAccess,
  updateClient,
} from './mutations';
import { clientFormSchema, clientIdSchema, localeSchema } from './schema';

/**
 * A server action is a public endpoint. The layout guard protects the page
 * render, not the mutation, so every action below re-verifies the session.
 *
 * `messageKey` is a key inside the `clients` namespace, following the pattern in
 * `src/components/auth/actions.ts`, so the UI stays translatable.
 */
export type ClientFormState =
  | { status: 'idle' }
  | {
      status: 'error';
      messageKey: 'errors.invalid' | 'errors.unexpected';
      /** Shaped to match `z.flattenError`, so no cast is needed at either end. */
      fieldErrors?: Record<string, string[] | undefined>;
    };

export type PortalActionState =
  | { status: 'idle' }
  | { status: 'error'; messageKey: 'errors.noEmail' | 'errors.emailTaken' | 'errors.unexpected' }
  | { status: 'success'; messageKey: 'portal.invited' | 'portal.revoked' };

export const initialFormState: ClientFormState = { status: 'idle' };
export const initialPortalState: PortalActionState = { status: 'idle' };

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
  await requireStaffSession(locale);

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
    ({ id } = await createClient(parsed.data));
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
  await requireStaffSession(locale);

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
    await updateClient(id, parsed.data);
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
  await requireStaffSession(locale);

  const id = clientIdSchema.parse(formData.get('clientId'));
  const intent = z.enum(['archive', 'restore']).parse(formData.get('intent'));

  if (intent === 'archive') {
    await archiveClient(id);
  } else {
    await restoreClient(id);
  }

  revalidatePath(`/${locale}/app/clients`);
  revalidatePath(`/${locale}/app/clients/${id}`);
}

export async function invitePortalAccessAction(
  _previousState: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  const locale = readLocale(formData);
  await requireStaffSession(locale);

  const id = clientIdSchema.parse(formData.get('clientId'));

  let email: string;

  try {
    const result = await invitePortalAccess(id);

    if (!result.ok) {
      if (result.code === 'no_email') return { status: 'error', messageKey: 'errors.noEmail' };
      if (result.code === 'email_taken') return { status: 'error', messageKey: 'errors.emailTaken' };
      return { status: 'error', messageKey: 'errors.unexpected' };
    }

    // Read back from the database, never from the submitted form: the form field
    // is attacker-controlled and would let a caller aim the sign-in link
    // somewhere else.
    email = result.email;
  } catch (error) {
    console.error('[clients] invite failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }

  try {
    // In development this logs the sign-in URL to the server console; see
    // `sendMagicLink` in src/lib/auth.ts. It throws in production until an email
    // provider is configured — a pre-existing limitation, surfaced in the UI.
    await auth.api.signInMagicLink({
      body: { email, callbackURL: `/${locale}/portal` },
      headers: await headers(),
    });
  } catch (error) {
    // The account exists and is usable; only the notification failed.
    console.error('[clients] magic link send failed', error);
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
  await requireStaffSession(locale);

  const id = clientIdSchema.parse(formData.get('clientId'));

  try {
    await revokePortalAccess(id);
  } catch (error) {
    console.error('[clients] revoke failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }

  revalidatePath(`/${locale}/app/clients`);
  revalidatePath(`/${locale}/app/clients/${id}`);

  return { status: 'success', messageKey: 'portal.revoked' };
}
