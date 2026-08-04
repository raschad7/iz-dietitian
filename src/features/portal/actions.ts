'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requirePortalClient } from './session';
import { updateLanguagePreference } from './mutations';
import { languagePreferenceSchema, localeSchema } from './schema';
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
 * Refuses every appointment request a client could file.
 *
 * Appointments are the dietitian's: clients do not book their own, ask to move
 * them, or ask to cancel them from the portal. The forms and links that reached
 * this are gone, but a server action is a public endpoint and a removed button
 * is not a removed capability — so the refusal has to be on this side of the
 * wire, and it is the whole body of the function.
 *
 * Kept rather than deleted because `RequestForm` still binds to it and the
 * `appointment_requests` table still holds rows the dietitian answers. Deleting
 * it would be a larger change to a feature that is dormant, not gone: if clients
 * are ever given the ability back, it is the guard below that lifts, not this
 * whole path that gets rebuilt. `createAppointmentRequest` in `./mutations.ts`
 * is unchanged and still under test.
 */
export async function requestAppointmentAction(
  _previousState: RequestFormState,
  _formData: FormData,
): Promise<RequestFormState> {
  return { status: 'error', messageKey: 'errors.invalid' };
}

/**
 * Withdrawing is likewise closed.
 *
 * With nothing able to open a request, taking one back is a button with no way
 * to have got there — and `RequestList` no longer renders it. The rows stay
 * readable; they are simply not the client's to change.
 */
export async function withdrawRequestAction(_formData: FormData): Promise<void> {
  return;
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
