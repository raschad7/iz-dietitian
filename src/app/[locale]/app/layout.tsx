import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { Header } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';
import { isClinicOnboardingComplete } from '@/features/clinic-profile/queries';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

type AppLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

const NAV_ITEMS = [
  { href: '/app', labelKey: 'dashboard' },
  { href: '/app/clients', labelKey: 'clients' },
  { href: '/app/calendar', labelKey: 'calendar' },
  { href: '/app/profile', labelKey: 'profile' },
  { href: '/app/weekly-plans', labelKey: 'weeklyPlans' },
  { href: '/app/meal-plans', labelKey: 'mealPlans' },
  { href: '/app/dishes', labelKey: 'dishes' },
  { href: '/app/foods', labelKey: 'foods' },
  { href: '/app/settings/whatsapp', labelKey: 'whatsapp' },
  { href: '/app/settings/security', labelKey: 'security' },
] as const;

export default async function AppLayout({ children, params }: AppLayoutProps) {
  const locale = await resolveLocale(params);

  // Authoritative guard for the whole dietitian area.
  const { clinicId, session } = await requireStaffClinic(locale);
  if (!(await isClinicOnboardingComplete(clinicId))) redirect(`/${locale}/onboarding`);

  const t = await getTranslations('app');

  return (
    /*
      A fixed-height shell rather than a growing one. The window itself never
      scrolls, so the sidebar and header stay put; each page scrolls inside
      `main`, and a page that manages its own scrolling — the calendar — can
      claim the full height with `h-full` and keep its toolbar fixed.
    */
    <div className="flex h-dvh overflow-hidden">
      <Sidebar items={NAV_ITEMS} title={t('shortName')} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header title={t('shortName')} userName={session.user.name} locale={locale} />
        <main className="min-h-0 flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
