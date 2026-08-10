import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/layout/sidebar';
import { PORTAL_NAV, PORTAL_NAV_ICONS } from '@/features/portal/nav';
import { PortalHeader } from '@/features/portal/components/portal-header';
import { PortalTabBar } from '@/features/portal/components/portal-tab-bar';
import { greetingKey } from '@/features/portal/greeting';
import { countPendingRequests } from '@/features/portal/queries';
import { requirePortalClient } from '@/features/portal/session';
import { resolveLocale } from '@/i18n/params';
import { formatDate } from '@/lib/format';

type PortalTabsLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

/**
 * The five screens a client moves between while using the app.
 *
 * Mobile first: the destinations are a bottom tab bar under `md`, and the
 * shared sidebar from `md` up. The bar is fixed, so `main` carries bottom
 * padding to keep the last card off it — dropped again at `md`, where the bar
 * is gone.
 *
 * The greeting header belongs to this group and not to the portal as a whole.
 * It says who you are and what day it is, which is the right opening for a
 * screen you arrived at to check something; the account screens in `(screen)`
 * open with their own title and a way back instead, because you got there on
 * purpose and you are going to leave again.
 */
export default async function PortalTabsLayout({ children, params }: PortalTabsLayoutProps) {
  const locale = await resolveLocale(params);

  const context = await requirePortalClient(locale);
  const pendingCount = await countPendingRequests(context.id);

  const t = await getTranslations('portal');

  return (
    <>
      <PortalHeader
        name={context.profile.fullName}
        greeting={greetingKey(context.now.minute)}
        month={formatDate(locale, context.now.date, { dateStyle: undefined, month: 'short' })}
        pendingCount={pendingCount}
        locale={locale}
        showNav
      />

      <AppShell items={PORTAL_NAV} title={t('title')} icons={PORTAL_NAV_ICONS}>
        <main className="min-w-0 flex-1 px-4 pt-5 pb-24 md:px-6 md:pt-6 md:pb-8">
          <div className="mx-auto w-full max-w-3xl">{children}</div>
        </main>

        <PortalTabBar />
      </AppShell>
    </>
  );
}
