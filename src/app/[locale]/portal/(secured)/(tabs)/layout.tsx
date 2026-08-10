import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { Sidebar } from '@/components/layout/sidebar';
import { PORTAL_NAV, PORTAL_NAV_ICONS } from '@/features/portal/nav';
import { HomeGlow } from '@/features/portal/components/home-glow';
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
      {/*
        The home screen's glow, rendered here rather than by `page.tsx`.

        It has to sit outside `(tabs)/template.tsx` — that wrapper is
        `.q-route-stage`, whose enter animation puts a `transform` on it, and a
        transformed ancestor is the containing block for anything `fixed`
        inside it. From in there the glow could only ever cover `main`'s own
        box. It decides for itself whether this is the home tab; see the note
        in `home-glow.tsx`.
      */}
      <HomeGlow />

      <PortalHeader
        name={context.profile.fullName}
        greeting={greetingKey(context.now.minute)}
        month={formatDate(locale, context.now.date, { dateStyle: undefined, month: 'short' })}
        pendingCount={pendingCount}
        locale={locale}
        showNav
      />

      <div className="flex flex-1">
        {/*
          `showTitle={false}`: the portal's name is not drawn anywhere in the
          client's own app. `PortalHeader` directly above already opens the
          screen with who they are and what day it is, and a second bar naming
          the product told them which app they had just opened. The string is
          still the drawer's accessible name — see `Sidebar`.

          `showMobileBar={false}`: below `md` this group already has two pieces
          of navigation — `PortalTabBar` along the block-end edge with these
          same five destinations, and `PortalHeader` above with the bell and
          settings. The rail's own phone bar was a third, and because it is
          `fixed` and nothing here offsets it, it was covering the header's two
          controls outright. It is not rendered rather than padded around.
        */}
        <Sidebar
          items={PORTAL_NAV}
          title={t('title')}
          showTitle={false}
          showMobileBar={false}
          icons={PORTAL_NAV_ICONS}
        />

        <main className="min-w-0 flex-1 px-4 pt-5 pb-24 md:px-6 md:pt-6 md:pb-8">
          <div className="mx-auto w-full max-w-3xl">{children}</div>
        </main>

        <PortalTabBar />
      </div>
    </>
  );
}
