import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { clientNutritionProfiles, clients, user } from '@/db/schema';

import { normalizeForSearch } from './search';
import { type ClientFormInput, type IntakeInput } from './schema';

/**
 * Every write to the clients table.
 *
 * This module imports nothing from Next.js on purpose: `bun test` can call it
 * directly, whereas a `"use server"` module calling `revalidatePath` cannot run
 * outside a request scope. `actions.ts` is the thin layer that adds the Next.js
 * concerns on top.
 */

/**
 * What the `clients` row needs, as opposed to what the card collects.
 *
 * The card asks for a first and a last name; the table stores one. Typing these
 * writes against `ClientFormInput` would drag that form detail — and every
 * field the card happens to require this month — into every caller that only
 * wants to write a row, which is why the seed script and the tests had to
 * describe a whole form to create a client called "أحمد".
 *
 * `fullName` is the only thing a row cannot be written without. Everything else
 * is optional *here* and required by the schema: whether a client may exist
 * without a phone number is a question about the form, and this is the layer
 * that writes columns.
 */
export type ClientRecordInput = Pick<ClientFormInput, 'fullName'> &
  Partial<Pick<ClientFormInput, 'phone' | 'email' | 'preferredLocale' | 'dateOfBirth' | 'sex'>>;

/**
 * Maps validated card input onto columns. Optional fields become NULL, not
 * skipped — a cleared phone number has to actually clear.
 *
 * Identity only. The clinical columns this used to carry are written by
 * {@link saveIntake}, and listing them here as well would mean the card silently
 * nulled a height every time someone fixed a typo in a name.
 */
function toColumns(input: ClientRecordInput) {
  return {
    fullName: input.fullName,
    searchName: normalizeForSearch(input.fullName),
    phone: input.phone ?? null,
    email: input.email ?? null,
    preferredLocale: input.preferredLocale,
    dateOfBirth: input.dateOfBirth ?? null,
    sex: input.sex ?? null,
  };
}

/**
 * Matches one client within one clinic.
 *
 * Every write goes through this rather than `eq(clients.id, id)` alone, so a
 * client id belonging to another clinic simply matches no rows — the update
 * reports "not found" instead of quietly succeeding across the tenant boundary.
 */
function scopedToClinic(clinicId: string, id: string) {
  return and(eq(clients.id, id), eq(clients.clinicId, clinicId));
}

export async function createClient(clinicId: string, input: ClientRecordInput): Promise<{ id: string }> {
  const [row] = await db
    .insert(clients)
    .values({ ...toColumns(input), clinicId })
    .returning({ id: clients.id });

  if (!row) {
    throw new Error('insert into clients returned no row');
  }

  return row;
}

/** Returns false when this clinic has no client with that id. */
export async function updateClient(
  clinicId: string,
  id: string,
  input: ClientRecordInput,
): Promise<boolean> {
  const rows = await db
    .update(clients)
    .set({ ...toColumns(input), updatedAt: new Date() })
    .where(scopedToClinic(clinicId, id))
    .returning({ id: clients.id });

  return rows.length > 0;
}

/**
 * Writes one intake across both of the tables a client record lives in.
 *
 * `clients` takes the columns the rest of the app already reads — height, goal,
 * the portal-visible prose — and `client_nutrition_profiles` takes the ones only
 * planning needs. **One transaction**, because a saved height with an unsaved
 * weight is exactly the half-filled state this whole change exists to remove:
 * the planner would report a different set of missing fields than the dietitian
 * had just filled in.
 *
 * The profile row is still created lazily, on the first save that reaches here,
 * so every client who predates this form is valid without a backfill.
 *
 * Returns false when this clinic has no client with that id — the same "not
 * found" a cross-tenant id gets.
 */
/**
 * What the two intake tables need written, as opposed to what the dialog now
 * insists on. The same split as {@link ClientRecordInput}, for the same reason.
 *
 * Every column here is written as `input.X ?? null`, so all of them are optional
 * at this layer. That height, weight, goal and activity level are *required on
 * the form* is a rule about the form — see the ⚠ on `intakeSchema` — and a
 * backfill script or a test writing one allergen should not have to satisfy it.
 *
 * The three that stay required are the ones written straight into non-null
 * columns rather than through `?? null`.
 */
export type IntakeRecordInput = Partial<IntakeInput> &
  Pick<IntakeInput, 'clientId' | 'allergenTags' | 'customAllergens' | 'mealSchedule'>;

export async function saveIntake(clinicId: string, input: IntakeRecordInput): Promise<boolean> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(clients)
      .set({
        heightCm: input.heightCm ?? null,
        goal: input.goal ?? null,
        activityLevel: input.activityLevel ?? null,
        allergies: input.allergies ?? null,
        conditions: input.conditions ?? null,
        medications: input.medications ?? null,
        medicalNotes: input.medicalNotes ?? null,
        /*
         * Written null on every intake save, because the dialog no longer has a
         * control for it: the two note fields are one, and what the form
         * submits as `medicalNotes` is the merged text of both. Clearing the
         * column here is what makes a legacy record converge instead of keeping
         * a second copy of prose that is already in `medical_notes`.
         *
         * Unlike `care_note` below, this is a deliberate write rather than an
         * omission — the content survives the clear because `mergedNotes` put
         * it in the field above first.
         */
        notes: input.notes ?? null,
        updatedAt: new Date(),
      })
      .where(scopedToClinic(clinicId, input.clientId))
      .returning({ id: clients.id });

    // Checked through the scoped update rather than a separate SELECT: the same
    // statement that authorises the write performs it, so there is no window
    // between the two.
    if (rows.length === 0) return false;

    /*
     * `clients.care_note` and `client_nutrition_profiles.share_weight_with_client`
     * are absent from both writes on purpose. The screens that read and wrote
     * them are gone, and a column left out of an UPDATE keeps whatever it holds
     * — so removing the UI does not quietly erase notes a dietitian wrote for a
     * client. Drop the columns in a migration if the feature is never coming
     * back; until then, leaving them untouched is the reversible option.
     */
    const profile = {
      weightKg: input.weightKg ?? null,
      dailyKcalTarget: input.dailyKcalTarget ?? null,
      proteinTargetGrams: input.proteinTargetGrams ?? null,
      allergenTags: input.allergenTags,
      customAllergens: input.customAllergens,
      preferences: input.preferences ?? null,
      dislikes: input.dislikes ?? null,
      permanentInstructions: input.permanentInstructions ?? null,
      mealSchedule: input.mealSchedule,
      maritalStatus: input.maritalStatus ?? null,
      childrenCount: input.childrenCount ?? null,
      bloodType: input.bloodType ?? null,
      occupation: input.occupation ?? null,
      visitReason: input.visitReason ?? null,
      dietHistory: input.dietHistory ?? null,
      drugAllergies: input.drugAllergies ?? null,
      familyHistory: input.familyHistory ?? null,
      activityNotes: input.activityNotes ?? null,
      activityBarriers: input.activityBarriers ?? null,
      sleepHours: input.sleepHours ?? null,
      smoking: input.smoking ?? null,
      caffeineFrequency: input.caffeineFrequency ?? null,
      sweetDrinksFrequency: input.sweetDrinksFrequency ?? null,
      fastFoodFrequency: input.fastFoodFrequency ?? null,
      vegetablesFrequency: input.vegetablesFrequency ?? null,
      fruitFrequency: input.fruitFrequency ?? null,
      dairyFrequency: input.dairyFrequency ?? null,
      redMeatFrequency: input.redMeatFrequency ?? null,
      chickenFrequency: input.chickenFrequency ?? null,
      fishFrequency: input.fishFrequency ?? null,
      sweetsFrequency: input.sweetsFrequency ?? null,
    };

    await tx
      .insert(clientNutritionProfiles)
      .values({ clinicId, clientId: input.clientId, ...profile })
      .onConflictDoUpdate({
        target: clientNutritionProfiles.clientId,
        set: { ...profile, updatedAt: new Date() },
      });

    return true;
  });
}

async function setStatus(clinicId: string, id: string, status: 'active' | 'archived'): Promise<boolean> {
  const rows = await db
    .update(clients)
    .set({ status, updatedAt: new Date() })
    .where(scopedToClinic(clinicId, id))
    .returning({ id: clients.id });

  return rows.length > 0;
}

/** Hides a client from the default list. Never deletes — clients own history. */
export function archiveClient(clinicId: string, id: string): Promise<boolean> {
  return setStatus(clinicId, id, 'archived');
}

export function restoreClient(clinicId: string, id: string): Promise<boolean> {
  return setStatus(clinicId, id, 'active');
}

/**
 * Permanently deletes a client.
 *
 * Archiving is the everyday action and what the UI leads with; this exists for
 * the genuine cases — a duplicate, a test record, someone exercising their right
 * to erasure.
 *
 * The client row and its portal account are removed in ONE transaction. Deleting
 * only the client would leave the `users` row behind: `clients.user_id` is
 * `on delete set null`, so nothing would point at it, and that person would keep
 * a working portal login attached to no record at all.
 *
 * Returns false when this clinic has no client with that id.
 */
export async function deleteClient(clinicId: string, id: string): Promise<boolean> {
  const [client] = await db
    .select({ userId: clients.userId })
    .from(clients)
    .where(scopedToClinic(clinicId, id))
    .limit(1);

  if (!client) return false;

  await db.transaction(async (tx) => {
    await tx.delete(clients).where(scopedToClinic(clinicId, id));

    if (client.userId) {
      // Cascades to their sessions, so an open portal tab stops working too.
      await tx.delete(user).where(eq(user.id, client.userId));
    }
  });

  return true;
}

