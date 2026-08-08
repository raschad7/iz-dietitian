import type { ReactNode } from 'react';

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
 * `showNav` is false, so the bell renders as plain text instead of a link to a
 * page that would bounce straight back here, and the header's trailing slot
 * is sign-out instead of the settings link it is everywhere else — settings
 * would redirect back to this screen too. Without this header the only way
 * off this screen would be closing the tab.
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
        greeting={greetingKey(context.now.minute)}
        pendingCount={0}
        locale={locale}
        showNav={false}
      />

      {children}
    </>
  );
}
