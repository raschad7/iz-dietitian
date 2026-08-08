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
 * Maps validated card input onto columns. Optional fields become NULL, not
 * skipped — a cleared phone number has to actually clear.
 *
 * Identity only. The clinical columns this used to carry are written by
 * {@link saveIntake}, and listing them here as well would mean the card silently
 * nulled a height every time someone fixed a typo in a name.
 */
function toColumns(input: ClientFormInput) {
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

export async function createClient(clinicId: string, input: ClientFormInput): Promise<{ id: string }> {
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
  input: ClientFormInput,
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
export async function saveIntake(clinicId: string, input: IntakeInput): Promise<boolean> {
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
        careNote: input.careNote ?? null,
        medicalNotes: input.medicalNotes ?? null,
        notes: input.notes ?? null,
        updatedAt: new Date(),
      })
      .where(scopedToClinic(clinicId, input.clientId))
      .returning({ id: clients.id });

    // Checked through the scoped update rather than a separate SELECT: the same
    // statement that authorises the write performs it, so there is no window
    // between the two.
    if (rows.length === 0) return false;

    const profile = {
      weightKg: input.weightKg ?? null,
      shareWeightWithClient: input.shareWeightWithClient,
      dailyKcalTarget: input.dailyKcalTarget ?? null,
      proteinTargetGrams: input.proteinTargetGrams ?? null,
      allergenTags: input.allergenTags,
      customAllergens: input.customAllergens,
      preferences: input.preferences ?? null,
      dislikes: input.dislikes ?? null,
      permanentInstructions: input.permanentInstructions ?? null,
      mealSchedule: input.mealSchedule,
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

