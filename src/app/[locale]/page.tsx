import { redirect } from 'next/navigation';

import { areaHomePath, toUserRole } from '@/features/auth/redirect';
import { resolveLocale } from '@/i18n/params';
import { getSession } from '@/lib/session';

/**
 * The root of a locale. It renders nothing — it decides where you belong and
 * sends you there.
 *
 * **There is no public landing page any more.** This used to be a pitch with
 * two buttons on it: "Clinic team sign in" and "Client portal". Everybody who
 * opened the product — the dietitian arriving at work, the client tapping the
 * installed portal icon, anyone following a bare link to the domain — was made
 * to read it and then answer a question about themselves that the app already
 * knew the answer to. A signed-in dietitian was shown a sales page for the
 * software they were already paying for, and asked to sign in again.
 *
 * So the fork moved to where the answer exists:
 *
 *  - signed in as staff → `/app`
 *  - signed in as a client → `/portal`
 *  - signed out → `/login`
 *
 * The two buttons are not lost. `/login` carries the same staff/client switch
 * above its card, so the one destination still serves both audiences — that
 * page was already the second half of the fork, and the landing page was a
 * duplicate of it wearing marketing copy.
 *
 * **Most signed-out visitors never reach this file.** `src/proxy.ts` turns an
 * anonymous request at this URL around on the cookie alone, one round trip
 * earlier. This is the authoritative pass — it reads the session for real,
 * which is the only way to tell a dietitian from a client — and it is also the
 * fallback for the case the middleware cannot judge: a cookie that exists but
 * no longer resolves to a session.
 *
 * `redirect` throws, so nothing is ever returned from here. The `never` return
 * type says so.
 */
export default async function LocaleRoot({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<never> {
  const locale = await resolveLocale(params);
  const session = await getSession();

  /*
    No email-verification check here, deliberately. An unverified staff account
    is bounced to `/verify-email` by `requireStaffSession` the moment `/app`
    renders, and repeating the rule in a second place is how the two come to
    disagree. This file answers one question: which area is yours.
  */
  redirect(
    session ? areaHomePath(locale, toUserRole(session.user.role)) : `/${locale}/login`,
  );
}
