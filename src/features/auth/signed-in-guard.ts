import { redirect } from 'next/navigation';

import type { Locale } from '@/i18n/routing';
import { REQUIRE_EMAIL_VERIFICATION } from '@/lib/auth';
import { getSession } from '@/lib/session';

import { areaHomePath, resolveSafeRedirect, toUserRole } from './redirect';

/**
 * The reverse of `requireStaffSession` — it turns away the people those guards
 * let in.
 *
 * A sign-in form is the one screen that means nothing to someone who is already
 * signed in, and every auth screen in the product rendered one to them anyway.
 * The ways to arrive there are ordinary rather than exotic: the browser
 * restoring yesterday's tab, a bookmark saved on the day the account was set
 * up, the "sign in" link in an old invitation email, or simply pressing back
 * once after signing in. Each of those put a dietitian in front of a password
 * field for an account whose session was live in the same tab.
 *
 * `redirectTo` is honoured when it is there, through the same allow-list a real
 * sign-in uses. That covers the case this exists for most: `src/proxy.ts` sends
 * an expired-looking request here with `?redirect=/ar/app/clients`, the session
 * turns out to be fine after all, and the reader lands on the register they
 * asked for instead of on the dashboard.
 *
 * ⚠ **This is not a security boundary and grants nothing.** It only decides
 * whether to show a form. The authoritative checks are `requireStaffSession`
 * and `requireClientSession`, which run on arrival at whatever this points to.
 *
 * It costs one session lookup per render of an auth screen. `getSession` is
 * wrapped in React's `cache`, so a screen that also reads the session for its
 * own reasons pays for one read between them.
 */
export async function redirectIfSignedIn(
  locale: Locale,
  redirectTo?: string | null,
): Promise<void> {
  const session = await getSession();
  if (!session) return;

  const role = toUserRole(session.user.role);

  /*
    Unverified staff are the exception, and they have to be: `requireStaffSession`
    bounces them from `/app` to `/verify-email`, so sending them to `/app` here
    would be one hop to a screen that immediately makes a second. Aim at the end
    of that chain directly.

    A `redirectTo` is ignored for them for the same reason — wherever they asked
    to go under `/app`, the answer is the same verification screen.

    Gated on the same `REQUIRE_EMAIL_VERIFICATION` the guard reads, so that
    turning the setting off does not leave this file redirecting to a screen
    nothing is enforcing.
  */
  if (REQUIRE_EMAIL_VERIFICATION && role === 'staff' && !session.user.emailVerified) {
    redirect(`/${locale}/verify-email`);
  }

  redirect(
    redirectTo ? resolveSafeRedirect(redirectTo, locale, role) : areaHomePath(locale, role),
  );
}
