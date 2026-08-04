import type { ReactNode } from 'react';

import { initialsOf } from '@/features/booking/format';
import { PortalHeader } from '@/features/portal/components/portal-header';
import { greetingKey } from '@/features/portal/greeting';
import { requirePortalClient } from '@/features/portal/session';
import { resolveLocale } from '@/i18n/params';

type SetPasswordLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

/**
 * The one screen a client can reach before they have replaced their temporary
 * password — and the header that gives them a way out of it.
 *
 * `showNav` is false, so the bell and the avatar render as plain text instead
 * of links to pages that would bounce straight back here, and the drawer
 * offers only sign-out — language lives in account settings, which this
 * screen cannot reach yet. Without this header the only way off this screen
 * would be closing the tab.
 *
 * It is a layout of its own rather than part of `portal/layout.tsx` because
 * every other portal screen now supplies its own chrome: the tabs get the
 * greeting header, the account screens get a title and a back button, and this
 * one gets the greeting header with its links switched off.
 */
export default async function SetPasswordLayout({ children, params }: SetPasswordLayoutProps) {
  const locale = await resolveLocale(params);

  const context = await requirePortalClient(locale);

  return (
    <>
      <PortalHeader
        name={context.profile.fullName}
        initials={initialsOf(context.profile.fullName)}
        photoUrl={context.profile.photoUrl}
        greeting={greetingKey(context.now.minute)}
        pendingCount={0}
        locale={locale}
        showNav={false}
      />

      {children}
    </>
  );
}
