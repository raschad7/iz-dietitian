import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
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

  // A client holding a dietitian-issued temporary password reaches exactly one
  // page until they replace it. The flag rides on the session, so this costs no
  // extra query. `set-password` has its own layout (not this one) precisely so
  // this redirect cannot target the page it is already on.
  if (session.user.mustChangePassword) {
    redirect(`/${locale}/portal/set-password`);
  }

  const t = await getTranslations('portal');

  return (
    <div className="flex min-h-dvh flex-col">
      <Header title={t('title')} userName={session.user.name} locale={locale} />
      <main className="mx-auto w-full max-w-3xl flex-1 p-6">{children}</main>
    </div>
  );
}
