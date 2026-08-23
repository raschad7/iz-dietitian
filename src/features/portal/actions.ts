'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { routing } from '@/i18n/routing';

import { type AdherenceLevel } from './adherence';
import { requirePortalClient } from './session';
import {
  createAppointmentRequest,
  createClientRequest,
  toggleMealCompletion,
  updateContactMethod,
  updateLanguagePreference,
  updateNotificationSetting,
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
  toggleMealCompletionSchema,
  withdrawRequestSchema,
} from './schema';
import { CLIENT_REQUEST_KINDS, type ClientRequestFormState, type PortalResult, type RequestFormState } from './types';

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
 * request is now listed. That listing is part of the confirmation — it shows
 * them the thing that now exists — but it is not all of it: a note lands in a
 * section further down the page, and a client who has just pressed send and
 * been navigated somewhere has to go looking to find out whether it worked.
 * `?sent=1` is what the destination reads to say so in a sentence at the top.
 *
 * A flag in the URL rather than a flash cookie or a client-side store: the
 * redirect is the only thing carrying state between the two screens, the
 * message it triggers is not sensitive, and the notice simply stops appearing
 * the next time the client navigates.
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
  redirect(`/${locale}/portal/appointments?sent=1`);
}

/**
 * Ticks or unticks one meal on the meal-plan screen.
 *
 * Called directly from `MealCheck` rather than through a `<form action>` —
 * unlike the rest of the portal's fire-and-forget writes, the caller needs
 * the derived level back to reconcile its own optimistic state, and a plain
 * async server action returns that where a form action cannot. The client is
 * still re-resolved from the session, exactly as every other action here
 * does; `locale` arrives as a plain argument since there is no `FormData` to
 * carry it in.
 */
export async function toggleMealCompletionAction(
  input: { mealId: string; completed: boolean; locale: string },
): Promise<PortalResult<{ date: string; level: AdherenceLevel | null }>> {
  const locale = localeSchema.parse(input.locale);
  const { id: clientId, clinicId, now } = await requirePortalClient(locale);

  const parsed = toggleMealCompletionSchema.safeParse({ mealId: input.mealId, completed: input.completed });
  if (!parsed.success) return { ok: false, error: 'errors.invalid' };

  // `now.date` is the clinic's wall-clock day, resolved once per request — the
  // rule it feeds is in `toggleMealCompletion`: only today can be reported on.
  const result = await toggleMealCompletion(
    { clientId, clinicId, today: now.date },
    parsed.data.mealId,
    parsed.data.completed,
  );

  if (result.ok) {
    revalidatePortal(locale);

    // The dietitian's own Progress tab reads the same `client_plan_adherence`
    // row this just wrote (see `ClientProgressPanel`), and Next's router
    // cache would otherwise keep serving whatever it last rendered for this
    // client until the dietitian did a hard navigation — a client ticking a
    // meal would not show up there until well after the fact.
    revalidatePath(`/${locale}/app/clients/${clientId}`);
  }

  return result;
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

  // The cookie above is the whole handover. Every screen already in history was
  // rendered in the old language and still carries its prefix, and nothing here
  // can rewrite those entries — so `proxy.ts` corrects them on the way back in,
  // for any depth and for the browser's own back arrow as much as ours. This
  // used to also set a ten-second `PORTAL_LOCALE_SWITCH` marker that
  // `PortalScreenHeader` spent on the next back press; it covered one hop, and
  // it did it by pushing a fresh copy of the previous screen on top of the old
  // one, which is what made the language flip on the *second* press instead.
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
