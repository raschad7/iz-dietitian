'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requirePortalClient } from './session';
import {
  createAppointmentRequest,
  createClientRequest,
  logPlanAdherence,
  updateContactMethod,
  updateLanguagePreference,
  updateNotificationSetting,
  updateThemePreference,
  withdrawClientRequest,
  withdrawRequest,
} from './mutations';
import {
  accountDeletionRequestSchema,
  appointmentRequestSchema,
  contactMethodSchema,
  dataUpdateRequestSchema,
  languagePreferenceSchema,
  localeSchema,
  notificationSettingSchema,
  planAdherenceSchema,
  themePreferenceSchema,
  withdrawRequestSchema,
} from './schema';
import { CLIENT_REQUEST_KINDS, type ClientRequestFormState, type RequestFormState } from './types';

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
 * Files an appointment request with the dietitian.
 *
 * This was a refusing stub between the portal redesign and now — clients could
 * not ask for anything, and the `appointment_requests` table only ever received
 * rows from before the change. The capability was switched off rather than
 * dismantled, exactly so that turning it back on would be this function
 * regaining a body rather than a path being rebuilt.
 *
 * **Nothing here books anything.** The row it writes carries no authority over
 * the calendar until the dietitian acts on it from `/app/requests`; see the
 * header of `src/db/schema/appointment-requests.ts` for why a request is not an
 * appointment. Two clients may ask for the same slot, and the dietitian decides.
 *
 * The client is re-resolved from the session rather than read from the form, so
 * a crafted post cannot file a request in someone else's name. `kind` is taken
 * from the payload and validated by the discriminated union, which is what
 * makes each of the three carry exactly the fields it needs.
 *
 * On success the client is sent back to their appointments list, where the
 * request is now listed as pending. That listing is the confirmation, and a
 * truer one than a message — it shows them the thing that now exists.
 */
export async function requestAppointmentAction(
  _previousState: RequestFormState,
  formData: FormData,
): Promise<RequestFormState> {
  const locale = readLocale(formData);
  const { id: clientId, clinicId, now } = await requirePortalClient(locale);

  const parsed = appointmentRequestSchema.safeParse({
    kind: formData.get('kind'),
    appointmentId: formData.get('appointmentId') ?? undefined,
    preferredDate: formData.get('preferredDate') ?? undefined,
    preferredStartMinute: formData.get('preferredStartMinute') ?? undefined,
    note: formData.get('note'),
  });

  if (!parsed.success) return { status: 'error', messageKey: 'errors.invalid' };

  const result = await createAppointmentRequest({ clientId, clinicId, now }, parsed.data);

  // An expected rejection — the slot went while the form was open, or something
  // about this appointment is already waiting. Reported in the form rather than
  // thrown, so the client reads a sentence instead of an error page.
  if (!result.ok) return { status: 'error', messageKey: result.error };

  revalidatePortal(locale);

  // The dietitian's inbox and dashboard now have one more item on them.
  revalidatePath(`/${locale}/app/requests`);
  revalidatePath(`/${locale}/app`);

  // Outside the try/catch shape of the rest: `redirect` works by throwing, so
  // it has to be the last thing this function does.
  redirect(`/${locale}/portal/appointments`);
}

/**
 * Logs how closely today went to plan.
 *
 * Always writes against `context.now.date` — the clinic's own today — never a
 * date read from the form, so a client can log or correct today's report but
 * never one from another day. Returns nothing, same reasoning as
 * `updateNotificationAction`: the segmented control re-renders in its new
 * position, which is the whole confirmation a tap like this owes.
 */
export async function logPlanAdherenceAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const { id: clientId, clinicId, now } = await requirePortalClient(locale);

  const parsed = planAdherenceSchema.safeParse({ level: formData.get('level') });
  if (!parsed.success) return;

  await logPlanAdherence({ clientId, clinicId }, now.date, parsed.data.level);

  revalidatePortal(locale);
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

  // Outside any try/catch — `redirect` signals by throwing. Back to the screen
  // the switch is on, so the client sees the same page in the new language
  // rather than being dropped somewhere else as a side effect of a setting.
  redirect(`/${next}/portal/settings`);
}

/**
 * Flips one notification switch.
 *
 * Returns nothing and reports nothing: the switch re-renders in its new
 * position, which is the whole confirmation a toggle owes. A failure leaves it
 * where it was, which is also true — the setting did not change.
 */
export async function updateNotificationAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const { id: clientId } = await requirePortalClient(locale);

  const parsed = notificationSettingSchema.safeParse({
    kind: formData.get('kind'),
    enabled: formData.get('enabled'),
  });

  if (!parsed.success) return;

  await updateNotificationSetting(clientId, parsed.data);

  revalidatePortal(locale);
}

/** Switches the client app between the phone's setting, light and dark. */
export async function updateThemeAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const { id: clientId } = await requirePortalClient(locale);

  const parsed = themePreferenceSchema.safeParse({ theme: formData.get('theme') });

  if (!parsed.success) return;

  await updateThemePreference(clientId, parsed.data.theme);

  revalidatePortal(locale);
}

/** Records how the client would rather the clinic reach them. */
export async function updateContactMethodAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const { id: clientId } = await requirePortalClient(locale);

  const parsed = contactMethodSchema.safeParse({
    preferredContact: formData.get('preferredContact'),
  });

  if (!parsed.success) return;

  await updateContactMethod(clientId, parsed.data.preferredContact);

  revalidatePortal(locale);
}

/**
 * Asks the clinic to correct something in the record.
 *
 * No redirect: the section this was submitted from re-renders as the pending
 * request, which shows the client the thing that now exists and offers them the
 * way to take it back. Same reasoning as the appointment request's redirect to
 * its own list.
 */
export async function requestDataUpdateAction(
  _previousState: ClientRequestFormState,
  formData: FormData,
): Promise<ClientRequestFormState> {
  const locale = readLocale(formData);
  const { id: clientId, clinicId } = await requirePortalClient(locale);

  const parsed = dataUpdateRequestSchema.safeParse({
    topic: formData.get('topic'),
    message: formData.get('message'),
  });

  if (!parsed.success) return { status: 'error', messageKey: 'errors.invalid' };

  const result = await createClientRequest({ clientId, clinicId }, { kind: 'data_update', ...parsed.data });

  if (!result.ok) return { status: 'error', messageKey: result.error };

  revalidatePortal(locale);

  return { status: 'idle' };
}

/**
 * Asks the clinic to close the account.
 *
 * The `confirm` field is the second step, carried as data: the screen asks
 * once, then asks again, and without the second answer reaching the server
 * nothing is filed. Deletion itself is never performed here — a client's
 * appointments and plans are the clinic's records too, so a person decides.
 */
export async function requestAccountDeletionAction(
  _previousState: ClientRequestFormState,
  formData: FormData,
): Promise<ClientRequestFormState> {
  const locale = readLocale(formData);
  const { id: clientId, clinicId } = await requirePortalClient(locale);

  const parsed = accountDeletionRequestSchema.safeParse({
    message: formData.get('message'),
    confirm: formData.get('confirm'),
  });

  if (!parsed.success) return { status: 'error', messageKey: 'errors.invalid' };

  const result = await createClientRequest(
    { clientId, clinicId },
    { kind: 'account_deletion', ...parsed.data },
  );

  if (!result.ok) return { status: 'error', messageKey: result.error };

  revalidatePortal(locale);

  return { status: 'idle' };
}

/** Takes back a correction or a deletion the clinic has not answered yet. */
export async function withdrawClientRequestAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const { id: clientId } = await requirePortalClient(locale);

  const kind = formData.get('kind');

  // Narrowed against the union rather than trusted from the form: this is a
  // public endpoint, and the value decides which row gets withdrawn.
  if (typeof kind !== 'string' || !CLIENT_REQUEST_KINDS.includes(kind as never)) return;

  await withdrawClientRequest(clientId, kind as (typeof CLIENT_REQUEST_KINDS)[number]);

  revalidatePortal(locale);
}
