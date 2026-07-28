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
async function requireRole(role: UserRole, locale: Locale): Promise<Session> {
  const session = await getSession();

  // `redirect` throws, so control never returns past these branches.
  if (!session) {
    redirect(`/${locale}/login`);
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

/** Use in `/[locale]/portal/**` — clients only. */
export function requireClientSession(locale: Locale): Promise<Session> {
  return requireRole('client', locale);
}
