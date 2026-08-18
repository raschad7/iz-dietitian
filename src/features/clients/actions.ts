'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { type Locale } from '@/i18n/routing';
import { notifyPortalCredentials } from '@/features/whatsapp/notify';
import { requireStaffClinic } from '@/lib/session';

import {
  archiveClient,
  createClient,
  deleteClient,
  restoreClient,
  saveIntake,
  updateClient,
} from './mutations';
import {
  type ClientFormState,
  type IntakeFormState,
  type PortalCredentialsState,
  type RevokePortalAccessState,
} from './form-state';
import { issuePortalCredentials, reissuePortalPassword, revokePortalAccess } from './portal-credentials';
import { getClient, getClientIntake } from './queries';
import { clientFormSchema, clientIdSchema, intakeSchema, localeSchema } from './schema';
import { type ClientFormValues, type ClientIntakeValues } from './types';

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
    // Two fields, one stored column — `clientFormSchema` joins them. See
    // `./name.ts` for why the column did not become two.
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    phone: formData.get('phone'),
    email: formData.get('email'),
    preferredLocale: formData.get('preferredLocale'),
    dateOfBirth: formData.get('dateOfBirth'),
    sex: formData.get('sex'),
  };
}

/**
 * Reads the intake dialog's fields.
 *
 * The schedule arrives as parallel arrays — one set of inputs per slot, which is
 * what an HTML form can express — and is zipped back together here rather than
 * in the schema, so the schema stays about validity and not about form encoding.
 *
 * Shares are entered as whole percentages and divided by 100 here for the same
 * reason: asking a dietitian to type `0.35` would be asking them to think in the
 * storage format.
 */
function readIntakeForm(formData: FormData) {
  const slotKeys = formData.getAll('slotKey').map(String);

  return {
    clientId: formData.get('clientId'),
    heightCm: formData.get('heightCm'),
    goal: formData.get('goal'),
    activityLevel: formData.get('activityLevel'),
    weightKg: formData.get('weightKg'),
    allergenTags: formData.getAll('allergenTags'),
    customAllergens: formData.getAll('customAllergens'),
    allergies: formData.get('allergies'),
    conditions: formData.get('conditions'),
    medications: formData.get('medications'),
    medicalNotes: formData.get('medicalNotes'),
    notes: formData.get('notes'),
    dailyKcalTarget: formData.get('dailyKcalTarget'),
    proteinTargetGrams: formData.get('proteinTargetGrams'),
    preferences: formData.get('preferences'),
    dislikes: formData.get('dislikes'),
    permanentInstructions: formData.get('permanentInstructions'),

    /*
     * ⚠ The questionnaire — Background and Habits, and the drug allergies that
     * sit with the food ones on the Allergies panel.
     *
     * **These were missing, and the data was being thrown away.** Every one of
     * them is `optional()` in `intakeSchema` — an intake is filled in across
     * visits, so nothing is required — and `saveIntake` writes `input.X ?? null`
     * to each column. A field never read out of the `FormData` therefore parsed
     * as `undefined`, validated cleanly, and was written as SQL NULL: the two
     * panels reported "saved", and every answer on them was gone on reopen. A
     * dietitian filling the clinic's paper sheet into the dialog lost the whole
     * sheet, silently, every time.
     *
     * Every key on `intakeSchema` must be read here. There is no schema-level
     * "reject unknown-but-missing" that would have caught this: optional means
     * optional, and the form is the only thing that knows the field exists.
     */
    maritalStatus: formData.get('maritalStatus'),
    childrenCount: formData.get('childrenCount'),
    bloodType: formData.get('bloodType'),
    occupation: formData.get('occupation'),
    visitReason: formData.get('visitReason'),
    dietHistory: formData.get('dietHistory'),
    drugAllergies: formData.get('drugAllergies'),
    familyHistory: formData.get('familyHistory'),

    activityNotes: formData.get('activityNotes'),
    activityBarriers: formData.get('activityBarriers'),
    sleepHours: formData.get('sleepHours'),
    smoking: formData.get('smoking'),

    caffeineFrequency: formData.get('caffeineFrequency'),
    sweetDrinksFrequency: formData.get('sweetDrinksFrequency'),
    fastFoodFrequency: formData.get('fastFoodFrequency'),
    vegetablesFrequency: formData.get('vegetablesFrequency'),
    fruitFrequency: formData.get('fruitFrequency'),
    dairyFrequency: formData.get('dairyFrequency'),
    redMeatFrequency: formData.get('redMeatFrequency'),
    chickenFrequency: formData.get('chickenFrequency'),
    fishFrequency: formData.get('fishFrequency'),
    sweetsFrequency: formData.get('sweetsFrequency'),
    mealSchedule: slotKeys.map((slotKey, index) => ({
      slotKey,
      label: String(formData.getAll('slotLabel')[index] ?? ''),
      timeOfDay: String(formData.getAll('slotTime')[index] ?? ''),
      kcalShare: Number(formData.getAll('slotShare')[index] ?? 0) / 100,
    })),
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

/**
 * WhatsApps a client the credentials that were just issued: username, temporary
 * password, and the portal link to use them on.
 *
 * **Automatic, on every issue and re-issue.** This reverses an earlier decision
 * recorded here — that it should be opt-in per issue, because a temporary
 * password in a chat thread is readable by anyone holding the phone and cannot
 * be recalled. That trade-off has not changed and is worth remembering; what
 * changed is the clinic's instruction, on the reasoning that credentials nobody
 * sends are credentials the client never receives. Most of this clinic's clients
 * have no email address (see the README's portal section), so the alternative is
 * a password read aloud over the phone or left on a screen they are not standing
 * in front of.
 *
 * It stays bounded by things this code can actually check: `notifyPortalCredentials`
 * sends nothing without a live WhatsApp session and a usable phone number on the
 * client, and reports `skipped` instead. The card says so before the button is
 * pressed, so this is never a surprise.
 *
 * Awaited rather than deferred with `after()`: the dietitian is reading the
 * one-time password off the screen right now and needs to know whether they must
 * dictate it. Never throws — the account exists regardless of what WhatsApp did.
 */
async function deliverCredentials(
  clinicId: string,
  clientId: string,
  credentials: { username: string; temporaryPassword: string },
): Promise<'sent' | 'skipped' | 'failed'> {
  try {
    const result = await notifyPortalCredentials(clinicId, clientId, {
      ...credentials,
      // Part of the dedupe key, so a re-issue an hour later sends again while a
      // double-clicked button does not.
      issuedAt: Date.now(),
    });

    if (result.status === 'sent') return 'sent';

    return result.status === 'failed' ? 'failed' : 'skipped';
  } catch (error) {
    console.error('[clients] WhatsApp credential delivery failed', error);
    return 'failed';
  }
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

  // No redirect: the form is a card over the register or the record, and the
  // revalidation above is what the reader sees change behind it.
  return { status: 'success' };
}

/**
 * The record behind the edit card, read when the card opens rather than sent
 * down with the screen that offers the button.
 *
 * The register renders 20 rows; prefilling from props would mean every visit
 * to the list carrying 20 people's medical notes and allergies into the
 * browser so that one of them might be edited. This costs a round trip on
 * click and nothing at all on the other 19.
 *
 * A server action is a public endpoint, so the locale is re-parsed and the
 * lookup is scoped to the caller's own clinic — `getClient` returns null for a
 * client belonging to anyone else, which is indistinguishable from one that
 * does not exist.
 */
export async function loadClientFormAction(
  rawLocale: string,
  clientId: string,
): Promise<ClientFormValues | null> {
  const locale = localeSchema.parse(rawLocale);
  const { clinicId } = await requireStaffClinic(locale);

  const client = await getClient(clinicId, clientId);
  if (!client) return null;

  return {
    id: client.id,
    fullName: client.fullName,
    phone: client.phone,
    email: client.email,
    preferredLocale: client.preferredLocale,
    dateOfBirth: client.dateOfBirth,
    sex: client.sex,
  };
}

/**
 * The whole intake behind the dialog, read when it opens.
 *
 * Same reasoning as `loadClientFormAction` above, and more of it: the intake is
 * offered from the register, the client's own record and the planner's context
 * panel, and shipping every client's weight, allergens and schedule down with
 * each of those screens to prefill a dialog that usually is not opened would be
 * paying for the exception on every visit.
 */
export async function loadIntakeAction(
  rawLocale: string,
  clientId: string,
): Promise<ClientIntakeValues | null> {
  const locale = localeSchema.parse(rawLocale);
  const { clinicId } = await requireStaffClinic(locale);

  return getClientIntake(clinicId, clientId);
}

/**
 * Saves one intake to both tables.
 *
 * Revalidates the planner board as well as the client's own pages: the board's
 * context panel, its calorie target and its catalog filtering are all read from
 * what this just wrote, and a dietitian who fixes a missing weight and returns
 * to a board still saying "weight is missing" has been told the save failed.
 */
export async function saveIntakeAction(
  _previousState: IntakeFormState,
  formData: FormData,
): Promise<IntakeFormState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const parsed = intakeSchema.safeParse(readIntakeForm(formData));

  if (!parsed.success) {
    return {
      status: 'error',
      messageKey: 'errors.invalid',
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  try {
    const saved = await saveIntake(clinicId, parsed.data);
    if (!saved) return { status: 'error', messageKey: 'errors.clientNotFound' };
  } catch (error) {
    console.error('[clients] intake save failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }

  const { clientId } = parsed.data;

  revalidatePath(`/${locale}/app/clients/${clientId}`);
  revalidatePath(`/${locale}/app/clients/${clientId}/nutrition`);
  revalidatePath(`/${locale}/app/weekly-plans/${clientId}`);

  return { status: 'success' };
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

    const whatsapp = await deliverCredentials(clinicId, id, result);

    revalidatePath(`/${locale}/app/clients`);
    revalidatePath(`/${locale}/app/clients/${id}`);

    return {
      status: 'issued',
      username: result.username,
      temporaryPassword: result.temporaryPassword,
      whatsapp,
    };
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

    const whatsapp = await deliverCredentials(clinicId, id, result);

    revalidatePath(`/${locale}/app/clients`);
    revalidatePath(`/${locale}/app/clients/${id}`);

    return {
      status: 'issued',
      username: result.username,
      temporaryPassword: result.temporaryPassword,
      whatsapp,
    };
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
