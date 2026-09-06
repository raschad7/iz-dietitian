import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { isAccountDisabled } from '@/features/auth/account-status';
import { areaHomePath, toUserRole } from '@/features/auth/redirect';
import { isClinicSuspended } from '@/features/clinic-profile/queries';
import type { Locale } from '@/i18n/routing';

import { auth, REQUIRE_EMAIL_VERIFICATION, type Session, type UserRole } from './auth';

/**
 * Returns the current session, or `null` for an anonymous request.
 *
 * **Wrapped in React's `cache`, and it is a navigation cost rather than a
 * correctness one.** This is a database round trip — Better Auth reads the
 * session row and joins the user onto it — and one render of one staff screen
 * asks for it three times over: `generateMetadata`, the area layout's
 * `requireStaffClinic`, and the page's own. Every guard in the app funnels
 * through here, so memoising this one function collapses all of them to a
 * single read per request without a single call site changing.
 *
 * The portal has done this since it was written — see `requirePortalClient`,
 * which caches one level higher for the same reason. The staff side simply
 * never did, and paid for it on every navigation.
 *
 * `cache` is per-request, so this cannot serve one reader another's session:
 * two concurrent requests are two separate memo tables. It also means a server
 * action that signs someone in and then reads the session back in the same
 * request would see the pre-sign-in value — nothing does, and the sign-in paths
 * all end in a `redirect`, which starts a fresh request.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  return auth.api.getSession({ headers: await headers() });
});

/**
 * Where each role signs in.
 *
 * Staff and clients authenticate on different pages — a password against an
 * email address versus credentials issued by a dietitian — so bouncing one to
 * the other's form is a dead end.
 *
 * `admin` shares the staff form deliberately. A platform owner signs in with an
 * email address and a password exactly as a dietitian does; the only thing that
 * differs is where they land, which `HOME_PATHS` below decides. A third sign-in
 * page would be a third surface to rate-limit, style, and keep in two
 * languages, for no difference in what the reader types.
 */
export const LOGIN_PATHS = {
  staff: 'login',
  client: 'client-login',
  admin: 'login',
} as const satisfies Record<UserRole, string>;

/**
 * Guards a route area. The middleware already turns away requests with no
 * session cookie; this is the authoritative check — it hits the database and,
 * unlike the middleware, can compare roles.
 */
async function requireRole(role: UserRole, locale: Locale): Promise<Session> {
  const session = await getSession();

  // `redirect` throws, so control never returns past these branches.
  if (!session) {
    redirect(`/${locale}/${LOGIN_PATHS[role]}`);
  }

  /**
   * An account the platform has disabled.
   *
   * **In `requireRole`, so it covers all three areas at once.** Clinic
   * suspension sits in `requireStaffSession` because it is a dispute with a
   * practice and the practice's patients are not party to it; disabling is about
   * one account, so a disabled client is refused the portal and a disabled admin
   * is refused the platform exactly as a disabled dietitian is refused the app.
   *
   * Before the role comparison below, deliberately. A disabled account arriving
   * at the wrong area should be told it is disabled, not bounced to an area it
   * will be refused from anyway.
   *
   * `/disabled` reads the session with `getSession` and never calls back here,
   * so there is no loop — and it must not be `/login`, which would bounce a
   * still-signed-in account straight back through this guard.
   */
  if (await isAccountDisabled(session.user.id)) {
    redirect(`/${locale}/disabled`);
  }

  if (session.user.role !== role) {
    /*
      Signed in, but in the wrong area: send them to their own.

      `areaHomePath` rather than a map of our own. This used to be
      `role === 'staff' ? app : portal`, which was total while there were two
      roles and quietly wrong the moment there were three — it would have sent a
      platform owner to the client portal, an area their session is *also*
      refused from, for an unbounded bounce between two guards. The mapping is
      stated once, in `src/features/auth/redirect.ts`, which says so itself.
    */
    redirect(areaHomePath(locale, toUserRole(session.user.role)));
  }

  return session;
}

/**
 * Use in `/[locale]/app/**` — dietitian and staff only.
 *
 * The verification check is here rather than in the app layout because a server
 * action is a public endpoint: a layout guard protects the render and nothing
 * else, and every staff action in the app already funnels through this function
 * or `requireStaffClinic` below.
 *
 * It is not redundant with `requireEmailVerification` in `src/lib/auth.ts`.
 * That setting refuses to *issue* a session to an unverified account; it says
 * nothing about sessions that already exist. Accounts created before the gate
 * was turned on hold exactly such a session, and would otherwise keep the run
 * of the dashboard indefinitely.
 *
 * DELIBERATELY STAFF-ONLY. Portal clients are provisioned by their dietitian
 * and never verify an address — `issuePortalCredentials` writes
 * `emailVerified: true` against a synthetic `@portal.invalid` address precisely
 * because nobody emails a patient a confirmation link. `requireClientSession`
 * below is untouched, and this check must never be lifted into `requireRole`.
 */
export async function requireStaffSession(locale: Locale): Promise<Session> {
  const session = await requireRole('staff', locale);

  if (REQUIRE_EMAIL_VERIFICATION && !session.user.emailVerified) {
    // `/verify-email` reads the session itself and never calls back into this
    // guard, so there is no redirect loop.
    redirect(`/${locale}/verify-email`);
  }

  /**
   * A clinic the platform has turned off, and the reason the switch on
   * `/admin/clinics` is a real control rather than a column nobody reads.
   *
   * **Here rather than in the app layout, because a server action is a public
   * endpoint.** A layout guard protects a render; it does nothing about a POST
   * to an action whose id someone still has from an open tab. Every staff
   * action in the app funnels through this function or `requireStaffClinic`,
   * which is the same argument the verification gate above is placed on.
   *
   * **Staff only. The clinic's CLIENTS keep their portal**, and that is a
   * decision rather than an oversight. Suspension is the platform's dispute
   * with the practice — unpaid invoice, terms — and a patient is not a party to
   * it. Taking away someone's meal plan and their appointment times to apply
   * pressure to their dietitian punishes the one person in the arrangement who
   * cannot resolve it. `requireClientSession` is deliberately untouched.
   *
   * `/suspended` reads the session itself with `getSession` and never calls
   * back into this guard, so there is no redirect loop — the same shape as
   * `/verify-email` above.
   */
  if (session.user.clinicId && (await isClinicSuspended(session.user.clinicId))) {
    redirect(`/${locale}/suspended`);
  }

  return session;
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

/**
 * Use in `/[locale]/admin/**` — the platform owner, above every clinic.
 *
 * **This is the one guard in the application that grants an unscoped view, and
 * that is the whole reason it exists as a separate function.** Everything under
 * `/app` funnels through `requireStaffClinic` and carries a `clinicId` into
 * every query it makes; the admin area deliberately does not, because its job is
 * to compare clinics rather than to work inside one.
 *
 * That makes the tenant boundary a property of *which guard a route calls*,
 * which is a thing a reviewer can see at the top of a file, rather than a
 * permission check buried in a query somewhere that a later edit can drop. The
 * two must never be mixed, and they cannot be by accident: an admin holds no
 * `clinicId` at all, so `requireStaffClinic` throws rather than quietly running
 * the unscoped query — exactly the loud failure we want if these are ever
 * crossed.
 *
 * Reads `users.role` and nothing else. `ADMIN_EMAILS` bootstraps the first
 * account through `bun run admin:sync`, but the environment is never consulted
 * at request time: one source of truth per request, and no deployment where
 * editing an environment variable silently grants a live session.
 *
 * No email-verification gate, unlike `requireStaffSession`. An admin account is
 * not self-registered — it is an existing account promoted by someone with
 * database access — so there is no unproven address to hold at the door.
 */
export function requireAdminSession(locale: Locale): Promise<Session> {
  return requireRole('admin', locale);
}
