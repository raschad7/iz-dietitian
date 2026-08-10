import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { Sidebar } from '@/components/layout/sidebar';
import { PORTAL_NAV, PORTAL_NAV_ICONS } from '@/features/portal/nav';
import { resolveLocale } from '@/i18n/params';

type PortalScreenLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

/**
 * A screen the client opened on purpose and will back out of: account
 * settings and the screens nested under it.
 *
 * **No tab bar, and no greeting header.** On a phone these are pushed screens,
 * not destinations — the client got here through the drawer, and what they
 * need at the top is the way back, not five ways sideways. The tab
 * destinations belong to `(tabs)`, which is why this is a separate group
 * rather than a flag.
 *
 * **The header belongs to the page, not to this layout.** Each screen names
 * itself and carries its own trailing action, and a layout cannot be told
 * either by the page inside it. So this supplies the column and the desktop
 * rail, and the page renders `PortalScreenHeader` followed by its own `main`.
 *
 * The sidebar stays from `md` up. "Standalone" is a phone idea: on a desktop
 * the rail is the only navigation there is, and removing it would strand
 * someone who arrived from a bookmark.
 */
export default async function PortalScreenLayout({ children, params }: PortalScreenLayoutProps) {
  const locale = await resolveLocale(params);

  const t = await getTranslations({ locale, namespace: 'portal' });

  return (
    <div className="flex flex-1">
      {/*
        `showTitle={false}`, as in `(tabs)`: each screen in this group renders
        its own `PortalScreenHeader` naming itself, so the portal's own name is
        never drawn. The string stays as the drawer's accessible name.

        `showMobileBar={false}`, as in `(tabs)`: nothing in this column offsets
        a `fixed` strip, so the bar was sitting on top of each screen's own
        `PortalScreenHeader` — including the back control that is how a client
        leaves a pushed screen. The header's back link is the phone navigation
        here, and it is now reachable.
      */}
      <Sidebar
        items={PORTAL_NAV}
        title={t('title')}
        showTitle={false}
        showMobileBar={false}
        icons={PORTAL_NAV_ICONS}
      />

      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
