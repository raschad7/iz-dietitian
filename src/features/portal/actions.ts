'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { routing } from '@/i18n/routing';

import { requirePortalClient } from './session';
import {
  createClientRequest,
  logPlanAdherence,
  updateContactMethod,
  updateLanguagePreference,
  updateNotificationSetting,
  withdrawClientRequest,
  withdrawRequest,
} from './mutations';
import {
  accountDeletionRequestSchema,
  contactMethodSchema,
  dataUpdateRequestSchema,
  languagePreferenceSchema,
  localeSchema,
  notificationSettingSchema,
  planAdherenceSchema,
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
 *
 * **The `NEXT_LOCALE` cookie is set here, not left to the middleware.** The
 * middleware only syncs that cookie on a "document" request — a real
 * top-level navigation — and deliberately skips it otherwise, so that its own
 * background revalidation of a route the client just switched away from can't
 * stomp the cookie back to the old locale. A server action's `redirect()` is
 * resolved by the client router as exactly that kind of background request,
 * so without writing the cookie ourselves it would keep naming the old
 * locale — invisible while every link on screen still carries `next`'s own
 * URL prefix, and only surfacing once something reads the cookie instead of
 * the path: a bare `/portal` shortcut, a fresh tab, or the next sign-in.
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

  const cookieStore = await cookies();

  // `localeCookie` is a fixed object in `src/i18n/routing.ts`, never the `boolean`
  // its type also allows — the guard is only to satisfy that wider type.
  if (typeof routing.localeCookie === 'object') {
    cookieStore.set(routing.localeCookie.name ?? 'NEXT_LOCALE', next, routing.localeCookie);
  }

  // A short-lived marker for `PortalScreenHeader`'s back arrow. `'replace'`
  // below stops the switch from leaving a duplicate of *this* screen behind in
  // the old language, but whatever screen was open before the client ever
  // opened Settings is still there in whichever language it was rendered in —
  // real `history.back()` would step onto it and flip the language back the
  // moment the client leaves. The header reads and clears this on its very
  // next back press so that one hop is safe; ten seconds is generous for a tap
  // that follows almost immediately, and it costs nothing if it's never read.
  cookieStore.set('PORTAL_LOCALE_SWITCH', '1', { maxAge: 10, path: '/', sameSite: 'lax' });

  revalidatePortal(locale);
  revalidatePortal(next);

  // Outside any try/catch — `redirect` signals by throwing. Back to the screen
  // the switch is on, so the client sees the same page in the new language
  // rather than being dropped somewhere else as a side effect of a setting.
  //
  // `'replace'` rather than the default `'push'` a server action redirect
  // otherwise gets: pushing would leave the pre-switch `/${locale}/portal/settings`
  // sitting in browser history right behind this entry, so the screen's own back
  // arrow — which steps through real history when there is any — would land the
  // client straight back on this same screen in the old language. Replacing
  // overwrites that entry instead, so back goes to wherever the client actually
  // came from.
  redirect(`/${next}/portal/settings`, 'replace');
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
