import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { resolveLocale } from '@/i18n/params';
import { requireClientSession } from '@/lib/session';

type SecuredPortalLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

/**
 * Everything in the portal EXCEPT `set-password`.
 *
 * A client signs in for the first time with a temporary password their dietitian
 * handed them. Until they replace it, this is the wall: every portal page
 * redirects to `set-password`, which sits outside this route group and is
 * therefore reachable.
 *
 * `(secured)` is a route group, so it contributes nothing to the URL — `/portal`
 * still resolves to `(secured)/page.tsx`. The group exists purely to give these
 * pages a guard that `set-password` does not inherit. Moving this check up into
 * `portal/layout.tsx` would make `set-password` inherit it too and redirect to
 * itself forever, locking every client out with no way back.
 *
 * The flag rides on the session object (declared in `user.additionalFields`), so
 * this costs no extra query.
 */
export default async function SecuredPortalLayout({ children, params }: SecuredPortalLayoutProps) {
  const locale = await resolveLocale(params);

  const session = await requireClientSession(locale);

  if (session.user.mustChangePassword) {
    redirect(`/${locale}/portal/set-password`);
  }

  return <>{children}</>;
}
