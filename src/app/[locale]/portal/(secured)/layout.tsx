import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { Sidebar } from '@/components/layout/sidebar';
import { PORTAL_NAV } from '@/features/portal/nav';
import { PortalTabBar } from '@/features/portal/components/portal-tab-bar';
import { resolveLocale } from '@/i18n/params';
import { requireClientSession } from '@/lib/session';

type SecuredPortalLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

/**
 * Everything in the portal EXCEPT `set-password`: the password wall, and the
 * navigation that only makes sense once past it.
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
 *
 * ## The shell
 *
 * Mobile first: the four destinations are a bottom tab bar under `md`, and the
 * shared sidebar from `md` up. The bar is fixed, so `main` carries bottom
 * padding to keep the last card off it — dropped again at `md`, where the bar
 * is gone.
 */
export default async function SecuredPortalLayout({ children, params }: SecuredPortalLayoutProps) {
  const locale = await resolveLocale(params);

  const session = await requireClientSession(locale);

  if (session.user.mustChangePassword) {
    redirect(`/${locale}/portal/set-password`);
  }

  const t = await getTranslations('portal');

  return (
    <div className="flex flex-1">
      <Sidebar items={PORTAL_NAV} title={t('title')} />

      <main className="min-w-0 flex-1 px-4 pt-5 pb-24 md:px-6 md:pt-6 md:pb-8">
        <div className="mx-auto w-full max-w-3xl">{children}</div>
      </main>

      <PortalTabBar />
    </div>
  );
}
