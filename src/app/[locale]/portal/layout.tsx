import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { Header } from '@/components/layout/header';
import { resolveLocale } from '@/i18n/params';
import { requireClientSession } from '@/lib/session';

type PortalLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

/**
 * Shell for the whole client area: authenticates, puts a header on top, and
 * nothing more.
 *
 * The navigation deliberately does NOT live here — it is in
 * `(secured)/layout.tsx`, alongside the `mustChangePassword` guard. A client
 * who has not yet replaced their temporary password can reach exactly one page,
 * and offering them four tabs that all bounce back to it would be a shell with
 * no floor.
 *
 * That guard is in the route group for the same reason: route groups do not
 * appear in the URL, so `/portal` still resolves to `(secured)/page.tsx` while
 * `/portal/set-password` is reached through this layout alone. Putting the check
 * here instead would lock every client out permanently — in the App Router a
 * nested layout wraps its parent rather than replacing it, so `set-password`
 * would inherit the redirect and bounce to itself forever.
 */
export default async function PortalLayout({ children, params }: PortalLayoutProps) {
  const locale = await resolveLocale(params);

  const session = await requireClientSession(locale);

  const t = await getTranslations('portal');

  return (
    <div className="flex min-h-dvh flex-col">
      <Header title={t('title')} userName={session.user.name} locale={locale} />
      {children}
    </div>
  );
}
