import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { Header } from '@/components/layout/header';
import { resolveLocale } from '@/i18n/params';
import { requireClientSession } from '@/lib/session';

type PortalLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function PortalLayout({ children, params }: PortalLayoutProps) {
  const locale = await resolveLocale(params);

  // Authoritative guard for the whole client area.
  const session = await requireClientSession(locale);

  const t = await getTranslations('portal');

  return (
    <div className="flex min-h-dvh flex-col">
      <Header title={t('title')} userName={session.user.name} locale={locale} />
      <main className="mx-auto w-full max-w-3xl flex-1 p-6">{children}</main>
    </div>
  );
}
