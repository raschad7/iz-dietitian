import { redirect } from 'next/navigation';
import { cache } from 'react';

import { wallClockIn, type WallClock } from '@/features/booking/completed';
import { type Locale } from '@/i18n/routing';
import { DISPLAY_TIME_ZONE } from '@/lib/format';
import { requireClientSession } from '@/lib/session';
import { type Session } from '@/lib/auth';

import { getClientSettings, getPortalClient, type PortalClient } from './queries';

/**
 * Who is asking, in the portal's terms.
 *
 * `requireClientSession` proves the caller holds a client session; this goes one
 * step further and resolves the clinical record behind it, because every read
 * and write in this area is scoped to a `clients.id`, not to a user id. Getting
 * both from one call means no page can accidentally query with the wrong one.
 */
export type PortalContext = PortalClient & {
  session: Session;
  /**
   * The clinic's wall clock, read once per request. Every page in this area
   * asks the same time-dependent questions — is that appointment over, is that
   * slot still bookable — and reading the clock once means two panels on one
   * screen can never straddle a minute boundary and disagree.
   */
  now: WallClock;
};

/**
 * Wrapped in React's `cache` because two things now ask for it on every portal
 * render — the shell, for the header, and the page itself. One request should
 * mean one session check, one client row, and above all one clock: without
 * this, the header could read 23:59 and the page below it 00:00.
 */
export const requirePortalClient = cache(async (locale: Locale): Promise<PortalContext> => {
  const session = await requireClientSession(locale);

  const client = await getPortalClient(session.user.id);

  if (!client) {
    /**
     * A live session whose client row is gone. The one way this happens is
     * staff revoking portal access — `clients.user_id` is `set null` on that
     * path — while the person was signed in. There is nothing to show them, so
     * they go back to the door rather than to an empty portal.
     */
    redirect(`/${locale}/client-login`);
  }

  return { ...client, session, now: clinicNow() };
});

/**
 * The client's own account settings, read once per request.
 *
 * Two things ask for them on the settings screen — the shell, which needs the
 * theme to render the wrapper, and the page itself — and the shell asks on
 * every other portal page too. Cached for the same reason `requirePortalClient`
 * is: one request should mean one read.
 *
 * It lives here rather than in `queries.ts` because `cache` comes from React,
 * and that module is deliberately free of anything a plain script could not
 * import.
 */
export const portalSettings = cache(getClientSettings);

/**
 * The clinic's wall clock.
 *
 * Appointments are clinic-local wall-clock facts, so "is this one over?" and
 * "is that time still bookable?" are questions about the clinic's zone — not
 * about the server's, and not about the visitor's. Every portal page that needs
 * a clock reads it here so they all agree.
 */
export function clinicNow(): WallClock {
  return wallClockIn(DISPLAY_TIME_ZONE);
}
