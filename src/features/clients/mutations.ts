import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { clients } from '@/db/schema';

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

export async function createClient(input: ClientFormInput): Promise<{ id: string }> {
  const [row] = await db.insert(clients).values(toColumns(input)).returning({ id: clients.id });

  if (!row) {
    throw new Error('insert into clients returned no row');
  }

  return row;
}

/** Returns false when no client has that id. */
export async function updateClient(id: string, input: ClientFormInput): Promise<boolean> {
  const rows = await db
    .update(clients)
    .set({ ...toColumns(input), updatedAt: new Date() })
    .where(eq(clients.id, id))
    .returning({ id: clients.id });

  return rows.length > 0;
}

async function setStatus(id: string, status: 'active' | 'archived'): Promise<boolean> {
  const rows = await db
    .update(clients)
    .set({ status, updatedAt: new Date() })
    .where(eq(clients.id, id))
    .returning({ id: clients.id });

  return rows.length > 0;
}

/** Hides a client from the default list. Never deletes — clients own history. */
export function archiveClient(id: string): Promise<boolean> {
  return setStatus(id, 'archived');
}

export function restoreClient(id: string): Promise<boolean> {
  return setStatus(id, 'active');
}
