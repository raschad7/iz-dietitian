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
} as const satisfies Record<UserRole, string>;

export function resolveSafeRedirect(
  requested: string | null | undefined,
  locale: Locale,
  role: UserRole,
): string {
  const home = `/${locale}/${AREA_BY_ROLE[role]}`;

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
