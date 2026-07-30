import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { clients, user } from '@/db/schema';

import { normalizeForSearch } from './search';
import { type ClientFormInput } from './schema';

/**
 * Every write to the clients table.
 *
 * This module imports nothing from Next.js on purpose: `bun test` can call it
 * directly, whereas a `"use server"` module calling `revalidatePath` cannot run
 * outside a request scope. `actions.ts` is the thin layer that adds the Next.js
 * concerns on top.
 */

/** Maps validated form input onto columns. Optional fields become NULL, not skipped. */
function toColumns(input: ClientFormInput) {
  return {
    fullName: input.fullName,
    searchName: normalizeForSearch(input.fullName),
    phone: input.phone ?? null,
    email: input.email ?? null,
    preferredLocale: input.preferredLocale,
    dateOfBirth: input.dateOfBirth ?? null,
    sex: input.sex ?? null,
    heightCm: input.heightCm ?? null,
    goal: input.goal ?? null,
    activityLevel: input.activityLevel ?? null,
    medicalNotes: input.medicalNotes ?? null,
    allergies: input.allergies ?? null,
    notes: input.notes ?? null,
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

