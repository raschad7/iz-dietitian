import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { isPortalPasswordChangePending } from '@/features/clients/portal-credentials';
import { resolveLocale } from '@/i18n/params';
import { requireClientSession } from '@/lib/session';

type SecuredPortalLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

/**
 * Everything in the portal EXCEPT `set-password`: the password wall, and
 * nothing else.
 *
 * A client signs in for the first time with a temporary password their
 * dietitian handed them. Until they replace it, this is the wall: every portal
 * page redirects to `set-password`, which sits outside this route group and is
 * therefore reachable.
 *
 * `(secured)` is a route group, so it contributes nothing to the URL — `/portal`
 * still resolves to `(tabs)/page.tsx`. The group exists purely to give these
 * pages a guard that `set-password` does not inherit. Moving this check up into
 * `portal/layout.tsx` would make `set-password` inherit it too and redirect to
 * itself forever, locking every client out with no way back.
 *
 * The flag rides on the session object (declared in `user.additionalFields`), so
 * the common answer — no, this client owes nothing — costs no query at all.
 *
 * ⚠ **A session that says the flag is set is confirmed against the database
 * before anybody is turned away.** The session is served from a signed cookie
 * copy for up to `SESSION_COOKIE_CACHE_SECONDS`, and clearing the flag writes
 * to `users` — which that copy cannot see. Trusting it alone is a lockout: the
 * client chooses a password, it saves, they are sent to `/portal`, the stale
 * copy still accuses them, and they land back on the form they just completed.
 * From the outside the button does nothing. Only a client the cookie accuses
 * pays for the extra read, and only until the copy expires, so the fast path is
 * unchanged for everyone who owes nothing.
 *
 * ## Why the shell is not here
 *
 * It used to be. But the portal has two kinds of screen, and they want
 * different chrome: the five destinations a client moves between all day, and
 * the account screens they open, read and back out of. `(tabs)` and `(screen)`
 * are those two, each with its own layout, and both behind this one guard.
 * Neither group appears in the URL.
 */
export default async function SecuredPortalLayout({ children, params }: SecuredPortalLayoutProps) {
  const locale = await resolveLocale(params);

  const session = await requireClientSession(locale);

  if (session.user.mustChangePassword && (await isPortalPasswordChangePending(session.user.id))) {
    redirect(`/${locale}/portal/set-password`);
  }

  return children;
}
