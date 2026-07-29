import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { Header } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';
import { resolveLocale } from '@/i18n/params';
import { requireStaffSession } from '@/lib/session';

type AppLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

const NAV_ITEMS = [
  { href: '/app', labelKey: 'dashboard' },
  { href: '/app/clients', labelKey: 'clients' },
  { href: '/app/calendar', labelKey: 'calendar' },
  { href: '/app/meal-plans', labelKey: 'mealPlans' },
  { href: '/app/settings/security', labelKey: 'security' },
] as const;

export default async function AppLayout({ children, params }: AppLayoutProps) {
  const locale = await resolveLocale(params);

  // Authoritative guard for the whole dietitian area.
  const session = await requireStaffSession(locale);

  const t = await getTranslations('app');

  return (
    <div className="flex min-h-dvh">
      <Sidebar items={NAV_ITEMS} title={t('shortName')} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header title={t('shortName')} userName={session.user.name} locale={locale} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
