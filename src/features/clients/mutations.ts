import { eq } from 'drizzle-orm';

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

export type InviteFailureCode = 'not_found' | 'no_email' | 'email_taken' | 'already_invited';

/**
 * The success case carries the email back to the caller, so the action can send
 * the magic link without trusting a value round-tripped through the form.
 */
export type InviteResult =
  | { ok: true; userId: string; email: string }
  | { ok: false; code: InviteFailureCode };

/** PostgreSQL unique_violation. */
const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION;
}

/**
 * Grants a client access to the portal.
 *
 * The `users` row and the `clients.user_id` link are written in ONE transaction.
 * That is the whole reason this is a direct Drizzle insert rather than an
 * `auth.api.createUser` call: the Better Auth API cannot enlist in our
 * transaction, so a failure between the two steps would leave an orphaned auth
 * account that can sign in and belongs to no client.
 *
 * This is the only place domain code writes to the `users` table.
 *
 * No `accounts` row is created: clients authenticate by magic link and never
 * hold a password.
 */
export async function invitePortalAccess(clientId: string): Promise<InviteResult> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);

  if (!client) return { ok: false, code: 'not_found' };
  if (client.userId) return { ok: false, code: 'already_invited' };

  const email = client.email;
  if (!email) return { ok: false, code: 'no_email' };

  const [taken] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (taken) return { ok: false, code: 'email_taken' };

  const userId = crypto.randomUUID();

  try {
    await db.transaction(async (tx) => {
      await tx.insert(user).values({
        id: userId,
        name: client.fullName,
        email,
        emailVerified: false,
        role: 'client',
        locale: client.preferredLocale,
      });

      await tx.update(clients).set({ userId, updatedAt: new Date() }).where(eq(clients.id, clientId));
    });
  } catch (error) {
    // The check above is a fast path, not a guarantee — two staff members can
    // invite the same address concurrently. The unique constraint is the real
    // arbiter, and the transaction means nothing was written.
    if (isUniqueViolation(error)) return { ok: false, code: 'email_taken' };
    throw error;
  }

  return { ok: true, userId, email };
}

/**
 * Removes portal access. Deleting the `users` row cascades to sessions and
 * accounts, and `clients.user_id` returns to null via `on delete set null`, so
 * the clinical record survives untouched.
 */
export async function revokePortalAccess(clientId: string): Promise<boolean> {
  const [client] = await db.select({ userId: clients.userId }).from(clients).where(eq(clients.id, clientId)).limit(1);

  if (!client?.userId) return false;

  await db.delete(user).where(eq(user.id, client.userId));
  return true;
}
