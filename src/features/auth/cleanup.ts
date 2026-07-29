import { and, eq, inArray, lt } from 'drizzle-orm';

import { db } from '@/db';
import { clients, clinics, user } from '@/db/schema';
import { UNVERIFIED_ACCOUNT_TTL_SECONDS } from '@/lib/auth-constants';

/**
 * Deletes accounts that never verified their email, and the clinics they left
 * behind.
 *
 * Two reasons this matters more than ordinary housekeeping:
 *
 * 1. A mistyped address at sign-up is unrecoverable under the hard verification
 *    gate — no session exists and the mail went elsewhere. Those rows would
 *    otherwise accumulate forever.
 * 2. Better Auth refuses to link a Google identity into an unverified local
 *    account (`dist/oauth2/link-account.mjs`). So an address squatted by an
 *    unverified sign-up blocks its genuine owner from using Google until the
 *    squatter expires. That is why the TTL is 24 hours and not a week.
 *
 * A clinic is only removed when it holds no clients. Deleting a clinic cascades
 * to its clients, and a clinical record must never be collateral damage of a
 * housekeeping pass.
 *
 * Imports nothing from Next.js so `bun test` can drive it directly.
 */
export async function purgeUnverifiedAccounts(): Promise<number> {
  const cutoff = new Date(Date.now() - UNVERIFIED_ACCOUNT_TTL_SECONDS * 1000);

  const expired = await db
    .select({ id: user.id, clinicId: user.clinicId })
    .from(user)
    .where(and(eq(user.emailVerified, false), lt(user.createdAt, cutoff)));

  if (expired.length === 0) return 0;

  await db.delete(user).where(
    inArray(
      user.id,
      expired.map((row) => row.id),
    ),
  );

  const clinicIds = [...new Set(expired.map((row) => row.clinicId).filter((id): id is string => id !== null))];

  if (clinicIds.length > 0) {
    // Only clinics with no clients, and no remaining staff, are removed.
    const withClients = await db
      .select({ clinicId: clients.clinicId })
      .from(clients)
      .where(inArray(clients.clinicId, clinicIds));

    const withStaff = await db
      .select({ clinicId: user.clinicId })
      .from(user)
      .where(inArray(user.clinicId, clinicIds));

    const keep = new Set<string>([
      ...withClients.map((row) => row.clinicId),
      ...withStaff.map((row) => row.clinicId).filter((id): id is string => id !== null),
    ]);

    const removable = clinicIds.filter((id) => !keep.has(id));

    if (removable.length > 0) {
      await db.delete(clinics).where(inArray(clinics.id, removable));
    }
  }

  return expired.length;
}
