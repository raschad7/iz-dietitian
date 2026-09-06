import type { Locale } from '@/i18n/routing';
import type { UserRole } from '@/lib/auth';

/**
 * Resolves where to send someone after they sign in.
 *
 * `src/proxy.ts` appends `?redirect=<pathname>` when it turns an anonymous
 * request away, so the value arrives from the URL and is entirely attacker
 * controlled. Anything other than an allow-list here is an open redirect — the
 * classic phishing primitive, where a link on the real domain bounces the victim
 * to a copy of the sign-in page.
 *
 * Pure: no Next.js import, so `bun test` drives it directly.
 */

const AREA_BY_ROLE = {
  staff: 'app',
  client: 'portal',
  /*
    The platform area, above every clinic. It is reached from the staff sign-in
    form — an admin types an email and a password exactly as a dietitian does —
    so this map is the only thing that separates the two afterwards.
  */
  admin: 'admin',
} as const satisfies Record<UserRole, string>;

/**
 * Narrows the role as Better Auth hands it over.
 *
 * `session.user.role` is typed `string | null | undefined` — the plugin widens
 * every additional field, whatever the column says. In the database it is
 * `not null` with a default of `'staff'` and it is written server-side only
 * (see the `user.create.before` hook in `src/lib/auth.ts`), so the loose half of
 * that type describes no row this app can produce.
 *
 * `'client'` and `'admin'` are the values that have to be recognised; anything
 * else resolves to the column's own default rather than throwing, because every
 * caller is only choosing *where to point a redirect*. None of them grants
 * anything: an account that somehow arrived at the wrong area meets
 * `requireStaffSession`, `requireClientSession` or `requireAdminSession` there
 * and is turned around. The cost of the fallback being wrong is one extra hop,
 * not access.
 */
export function toUserRole(role: string | null | undefined): UserRole {
  return role === 'client' || role === 'admin' ? role : 'staff';
}

/**
 * Where a role's own area starts — `/ar/app` for staff, `/ar/portal` for a
 * client, `/ar/admin` for the platform owner.
 *
 * Exported because two other places need the same answer for different
 * questions. `resolveSafeRedirect` below asks "may I send you where you asked to
 * go?"; the locale root asks "where do you belong at all?"; and `requireRole` in
 * `src/lib/session.ts` asks "you are signed in, but not here — where should you
 * be?" — no untrusted input in either of the last two, no allow-list, just the
 * mapping. Writing that mapping out a second time is how the copies come to
 * disagree, and adding a third role is precisely when they would have.
 */
export function areaHomePath(locale: Locale, role: UserRole): string {
  return `/${locale}/${AREA_BY_ROLE[role]}`;
}

export function resolveSafeRedirect(
  requested: string | null | undefined,
  locale: Locale,
  role: UserRole,
): string {
  const home = areaHomePath(locale, role);

  if (!requested) return home;

  // Reject anything that is not a plain, single-slash-rooted path. `//host` and
  // `/\host` are both read as protocol-relative URLs by browsers, and a
  // `startsWith('/')` check alone lets them straight through.
  if (!requested.startsWith('/')) return home;
  if (requested.startsWith('//')) return home;
  if (requested.includes('\\')) return home;

  // Drop the query and hash: only the path is being validated, so carrying the
  // rest through would smuggle unvalidated input into the destination.
  const path = requested.split('?')[0]?.split('#')[0] ?? '';

  // Exact match on the area root, or a real child of it. A plain `startsWith`
  // would accept `/ar/apple` as living inside `/ar/app`.
  if (path === home || path.startsWith(`${home}/`)) return path;

  return home;
}
