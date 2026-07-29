import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { account, clients, session, user } from '@/db/schema';
import { generateTemporaryPassword } from '@/features/auth/password-policy';
import { auth } from '@/lib/auth';

/**
 * Portal credentials, issued by a dietitian.
 *
 * Clients do not sign up and do not receive email. Their dietitian creates the
 * account, hands over a username and a temporary password, and the client
 * replaces the password the first time they sign in — after which nobody at the
 * clinic knows it.
 *
 * Imports nothing from Next.js so `bun test` drives it directly. `actions.ts` is
 * the thin layer that adds revalidation.
 */

/**
 * `.invalid` is reserved by RFC 2606 and can never resolve.
 *
 * `users.email` is NOT NULL UNIQUE, but a client may have no address at all, and
 * families share one — which is exactly why `clients.email` is nullable and NOT
 * unique. Deriving a synthetic address from the username satisfies the
 * constraint, guarantees uniqueness, and makes it impossible to accidentally
 * send mail to a patient.
 */
export function syntheticEmail(username: string): string {
  return `${username}@portal.invalid`;
}

export type IssueFailureCode = 'not_found' | 'already_issued' | 'username_taken';

export type IssueResult =
  | { ok: true; username: string; temporaryPassword: string }
  | { ok: false; code: IssueFailureCode };

function scopedToClinic(clinicId: string, id: string) {
  return and(eq(clients.id, id), eq(clients.clinicId, clinicId));
}

const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION;
}

export async function issuePortalCredentials(
  clinicId: string,
  clientId: string,
  username: string,
): Promise<IssueResult> {
  const [client] = await db.select().from(clients).where(scopedToClinic(clinicId, clientId)).limit(1);

  if (!client) return { ok: false, code: 'not_found' };
  if (client.userId) return { ok: false, code: 'already_issued' };

  const [taken] = await db.select({ id: user.id }).from(user).where(eq(user.username, username)).limit(1);
  if (taken) return { ok: false, code: 'username_taken' };

  const temporaryPassword = generateTemporaryPassword();

  // Better Auth's own hasher, so the password verifies at sign-in. Same approach
  // as `scripts/seed.ts`, and for the same reason: there is no request scope
  // here, so `auth.api.signUp*` cannot be used.
  const hashed = await (await auth.$context).password.hash(temporaryPassword);

  const userId = crypto.randomUUID();

  try {
    await db.transaction(async (tx) => {
      await tx.insert(user).values({
        id: userId,
        name: client.fullName,
        email: syntheticEmail(username),
        /**
         * TRUE ON PURPOSE, and required twice over. `requireEmailVerification`
         * is global, so an unverified account cannot sign in at all — and a
         * `.invalid` address can never be verified. Verification means "this
         * address was proven to belong to this person"; this one belongs to
         * nobody and can receive nothing, so there is nothing to prove.
         */
        emailVerified: true,
        username,
        displayUsername: username,
        role: 'client',
        locale: client.preferredLocale,
        mustChangePassword: true,
      });

      await tx.insert(account).values({
        id: crypto.randomUUID(),
        accountId: userId,
        providerId: 'credential',
        userId,
        password: hashed,
      });

      await tx
        .update(clients)
        .set({ userId, updatedAt: new Date() })
        .where(scopedToClinic(clinicId, clientId));
    });
  } catch (error) {
    // The check above is a fast path, not a guarantee: two staff members can
    // submit the same username at once. The unique index is the real arbiter,
    // and the transaction means nothing was written.
    if (isUniqueViolation(error)) return { ok: false, code: 'username_taken' };
    throw error;
  }

  return { ok: true, username, temporaryPassword };
}

/**
 * Issues a fresh temporary password for a client who has forgotten theirs.
 *
 * The username does not change. Existing sessions are revoked: a re-issue is
 * what happens when the old credentials may be in someone else's hands.
 */
export async function reissuePortalPassword(clinicId: string, clientId: string): Promise<IssueResult> {
  const [client] = await db
    .select({ userId: clients.userId })
    .from(clients)
    .where(scopedToClinic(clinicId, clientId))
    .limit(1);

  if (!client?.userId) return { ok: false, code: 'not_found' };

  const [existing] = await db
    .select({ username: user.username })
    .from(user)
    .where(eq(user.id, client.userId))
    .limit(1);

  if (!existing?.username) return { ok: false, code: 'not_found' };

  const temporaryPassword = generateTemporaryPassword();
  const hashed = await (await auth.$context).password.hash(temporaryPassword);

  await db.transaction(async (tx) => {
    await tx
      .update(account)
      .set({ password: hashed, updatedAt: new Date() })
      .where(and(eq(account.userId, client.userId!), eq(account.providerId, 'credential')));

    await tx.update(user).set({ mustChangePassword: true }).where(eq(user.id, client.userId!));

    // Ends any open portal tab immediately.
    await tx.delete(session).where(eq(session.userId, client.userId!));
  });

  return { ok: true, username: existing.username, temporaryPassword };
}

/**
 * Removes portal access. Deleting the `users` row cascades to sessions and
 * accounts, and `clients.user_id` returns to null via `on delete set null`, so
 * the clinical record survives untouched.
 */
export async function revokePortalAccess(clinicId: string, clientId: string): Promise<boolean> {
  const [client] = await db
    .select({ userId: clients.userId })
    .from(clients)
    .where(scopedToClinic(clinicId, clientId))
    .limit(1);

  if (!client?.userId) return false;

  await db.delete(user).where(eq(user.id, client.userId));
  return true;
}

/**
 * The username shown on the client detail page for someone who already has
 * portal access.
 *
 * `clients` does not store a copy of the username — `users` is the source of
 * truth — so the detail page needs a read that crosses that join. It lives here
 * rather than in `queries.ts` because everything else about portal credentials
 * (issuing, reissuing, revoking) already lives in this module.
 */
export async function getPortalUsername(clinicId: string, clientId: string): Promise<string | null> {
  const [row] = await db
    .select({ username: user.username })
    .from(clients)
    .innerJoin(user, eq(user.id, clients.userId))
    .where(scopedToClinic(clinicId, clientId))
    .limit(1);

  return row?.username ?? null;
}
