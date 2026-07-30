'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requirePortalClient } from './session';
import {
  createAppointmentRequest,
  updateLanguagePreference,
  withdrawRequest,
} from './mutations';
import {
  appointmentRequestSchema,
  languagePreferenceSchema,
  localeSchema,
  withdrawRequestSchema,
} from './schema';
import { type RequestFormState } from './types';

/**
 * The portal's mutations.
 *
 * A server action is a public endpoint: the layout guard protects the render,
 * never the write. So every action here re-resolves the client from the session
 * — it never accepts a client id from the form — and the ownership of anything
 * else it touches is proved in the `WHERE` clause of the write itself.
 *
 * The rules live in `./mutations.ts` and the shapes in `./schema.ts`. What is
 * added here, and only here, are the Next.js concerns: the session lookup,
 * `revalidatePath`, and the redirect.
 *
 * This module is `"use server"`, so it may only export async functions — the
 * state shapes live in `./types.ts`.
 */

function readLocale(formData: FormData) {
  return localeSchema.parse(formData.get('locale'));
}

/** Every portal page shows some slice of appointments or requests, so all of them go stale together. */
function revalidatePortal(locale: string): void {
  revalidatePath(`/${locale}/portal`, 'layout');
}

/**
 * Files a request: a new appointment, a different time, or a cancellation.
 *
 * `kind` decides which fields the schema demands, so one action serves all three
 * forms without any of them being able to submit a half-filled version of
 * another.
 */
export async function requestAppointmentAction(
  _previousState: RequestFormState,
  formData: FormData,
): Promise<RequestFormState> {
  const locale = readLocale(formData);
  const { id: clientId, clinicId, now } = await requirePortalClient(locale);

  const parsed = appointmentRequestSchema.safeParse({
    kind: formData.get('kind'),
    appointmentId: formData.get('appointmentId'),
    preferredDate: formData.get('preferredDate'),
    preferredStartMinute: formData.get('preferredStartMinute'),
    note: formData.get('note'),
  });

  if (!parsed.success) return { status: 'error', messageKey: 'errors.invalid' };

  const result = await createAppointmentRequest({ clientId, clinicId, now }, parsed.data);

  if (!result.ok) return { status: 'error', messageKey: result.error };

  revalidatePortal(locale);

  // Outside any try/catch — `redirect` signals by throwing. The new request is
  // waiting on that page, which confirms it better than a message would.
  redirect(`/${locale}/portal/appointments`);
}

/** Takes back a request the dietitian has not answered yet. */
export async function withdrawRequestAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const { id: clientId } = await requirePortalClient(locale);

  const parsed = withdrawRequestSchema.safeParse({ requestId: formData.get('requestId') });
  if (!parsed.success) return;

  await withdrawRequest(clientId, parsed.data.requestId);

  revalidatePortal(locale);
}

/**
 * Changes the client's language and takes them to the same page in it.
 *
 * The redirect is what makes the change visible immediately: `next-intl` reads
 * the locale from the URL, so writing the preference without navigating would
 * save a setting that appears to do nothing until the next sign-in.
 */
export async function updateLanguageAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const { id: clientId, session } = await requirePortalClient(locale);

  const parsed = languagePreferenceSchema.safeParse({
    preferredLocale: formData.get('preferredLocale'),
  });

  if (!parsed.success) return;

  const next = parsed.data.preferredLocale;

  await updateLanguagePreference(clientId, session.user.id, next);

  revalidatePortal(locale);
  revalidatePortal(next);

  // Outside any try/catch — `redirect` signals by throwing.
  redirect(`/${next}/portal/profile`);
}
