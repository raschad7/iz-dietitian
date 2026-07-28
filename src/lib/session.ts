import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import type { Locale } from '@/i18n/routing';

import { auth, type Session, type UserRole } from './auth';

/** Returns the current session, or `null` for an anonymous request. */
export async function getSession(): Promise<Session | null> {
  return auth.api.getSession({ headers: await headers() });
}

/**
 * Guards a route area. The middleware already turns away requests with no
 * session cookie; this is the authoritative check — it hits the database and,
 * unlike the middleware, can compare roles.
 */
/** Staff and clients sign in on different pages, so they are sent to different ones. */
export const LOGIN_PATHS = {
  staff: 'login',
  client: 'client-login',
} as const satisfies Record<UserRole, string>;

async function requireRole(role: UserRole, locale: Locale): Promise<Session> {
  const session = await getSession();

  // `redirect` throws, so control never returns past these branches.
  if (!session) {
    redirect(`/${locale}/${LOGIN_PATHS[role]}`);
  }

  if (session.user.role !== role) {
    // Signed in, but in the wrong area: send them to their own.
    redirect(session.user.role === 'staff' ? `/${locale}/app` : `/${locale}/portal`);
  }

  return session;
}

/** Use in `/[locale]/app/**` — dietitian and staff only. */
export function requireStaffSession(locale: Locale): Promise<Session> {
  return requireRole('staff', locale);
}

/**
 * Staff session plus the clinic it is scoped to.
 *
 * Every read and write in the dietitian area must pass this `clinicId` down, so
 * that one clinic can never see another's clients. Returning it separately from
 * the session — rather than letting callers reach for `session.user.clinicId` —
 * means the "is it actually set?" check happens exactly once, here.
 *
 * A staff account without a clinic should be impossible: the `user.create.before`
 * hook in `src/lib/auth.ts` assigns one at sign-up. If it happens anyway, fail
 * loudly rather than fall back to an unscoped query that would leak every
 * clinic's clients.
 */
export async function requireStaffClinic(
  locale: Locale,
): Promise<{ session: Session; clinicId: string }> {
  const session = await requireStaffSession(locale);
  const clinicId = session.user.clinicId;

  if (!clinicId) {
    throw new Error(
      `Staff account ${session.user.id} has no clinic. Every staff account must belong to one; refusing to run an unscoped query.`,
    );
  }

  return { session, clinicId };
}

/** Use in `/[locale]/portal/**` — clients only. */
export function requireClientSession(locale: Locale): Promise<Session> {
  return requireRole('client', locale);
}
