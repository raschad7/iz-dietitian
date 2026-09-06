import { eq } from 'drizzle-orm';
import { cache } from 'react';

import { db } from '@/db';
import { user } from '@/db/schema/auth';

/**
 * Whether the platform has disabled this account.
 *
 * **Read from the database, not from the session.** Better Auth caches a session
 * in a signed cookie for `SESSION_COOKIE_CACHE_SECONDS`, so a field carried on
 * `session.user` can be up to a minute stale — and "this account is disabled" is
 * exactly the fact that must not be. The same reasoning as `isClinicSuspended`.
 *
 * `cache`d for the request, because `requireRole` runs several times over one
 * render — the layout's guard, the page's, and `generateMetadata`'s — and this
 * would otherwise be a round trip on each to read a column that is null for
 * essentially every account.
 */
export const isAccountDisabled = cache(async (userId: string): Promise<boolean> => {
  const [row] = await db
    .select({ disabledAt: user.disabledAt })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return Boolean(row?.disabledAt);
});
