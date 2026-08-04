import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { Sidebar } from '@/components/layout/sidebar';
import { type IconName } from '@/components/ui/icon';
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
  { href: '/app/dishes', labelKey: 'dishes' },
  { href: '/app/settings/whatsapp', labelKey: 'whatsapp' },
  { href: '/app/settings/security', labelKey: 'security' },
] as const;

/**
 * One glyph per destination. Text-only rows are hard to scan at a glance; the
 * icon is what lets someone find "Dishes" without reading the whole rail.
 *
 * `satisfies` ties this to the nav list, so adding a destination without an
 * icon is a compile error rather than a row that quietly sits misaligned.
 */
const NAV_ICONS = {
  dashboard: 'dashboard',
  clients: 'clients',
  calendar: 'calendar',
  profile: 'profile',
  weeklyPlans: 'weeklyPlans',
  dishes: 'dishes',
  whatsapp: 'whatsapp',
  security: 'security',
} as const satisfies Record<(typeof NAV_ITEMS)[number]['labelKey'], IconName>;

export default async function AppLayout({ children, params }: AppLayoutProps) {
  const locale = await resolveLocale(params);

  // Authoritative guard for the whole dietitian area.
  const { clinicId } = await requireStaffClinic(locale);
  if (!(await isClinicOnboardingComplete(clinicId))) redirect(`/${locale}/onboarding`);

  const t = await getTranslations('app');

  return (
    /*
      A fixed-height shell rather than a growing one. The window itself never
      scrolls, so the rail stays put; each page scrolls inside `main`, and a
      page that manages its own scrolling — the calendar — can claim the full
      height with `h-full` and keep its toolbar fixed.

      The rail is a full-bleed column separated by a hairline, not an inset
      card — it is the wall the app hangs on, not a surface you act on.

      **There is no app bar.** The bar carried a title the rail already said, a
      name nobody needed reminding of, and a notification bell; the rail now
      carries the two controls worth keeping (language, sign-out) at its
      block-end, and the row the bar occupied goes back to the page. Each page
      owns its own heading, which is where the `h1` lives.
    */
    <div className="flex h-dvh overflow-hidden bg-background">
      <Sidebar items={NAV_ITEMS} title={t('shortName')} locale={locale} icons={NAV_ICONS} />
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 md:p-5">{children}</main>
    </div>
  );
}
