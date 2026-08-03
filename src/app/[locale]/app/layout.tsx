import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { Header } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';
import { type IconName } from '@/components/ui/icon';
import { isClinicOnboardingComplete } from '@/features/clinic-profile/queries';
import { NotificationsList } from '@/features/notifications/components/notifications-list';
import { NotificationsMenu } from '@/features/notifications/components/notifications-menu';
import { loadNotifications } from '@/features/notifications/page-data';
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
  const { clinicId, session } = await requireStaffClinic(locale);
  if (!(await isClinicOnboardingComplete(clinicId))) redirect(`/${locale}/onboarding`);

  const [t, tn] = await Promise.all([getTranslations('app'), getTranslations('notifications')]);

  /*
   * The bell is part of the shell, so it loads here rather than on a page.
   * It reads the clinic the guard above already resolved: reaching this line
   * means the account has a clinic and its onboarding is complete, so there is
   * no clinic-less case left to fall back on.
   */
  const notifications = await loadNotifications(clinicId);

  return (
    /*
      A fixed-height shell rather than a growing one. The window itself never
      scrolls, so the sidebar and header stay put; each page scrolls inside
      `main`, and a page that manages its own scrolling — the calendar — can
      claim the full height with `h-full` and keep its toolbar fixed.

      The rail is a full-bleed column separated by a hairline, not an inset
      card — it is the wall the app hangs on, not a surface you act on. The app
      bar sits unfilled on the canvas beside it, so the shell has no heavy
      surface at all and the page's own cards carry the weight.
    */
    <div className="flex h-dvh overflow-hidden bg-background">
      <Sidebar items={NAV_ITEMS} title={t('shortName')} icons={NAV_ICONS} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          title={t('shortName')}
          userName={session.user.name}
          locale={locale}
          actions={
            <NotificationsMenu
              count={notifications.pendingRequestCount}
              label={tn('trigger', { count: notifications.pendingRequestCount })}
              title={tn('title')}
            >
              <NotificationsList
                items={notifications.items}
                pendingRequestCount={notifications.pendingRequestCount}
                locale={locale}
                now={notifications.now}
              />
            </NotificationsMenu>
          }
        />
        <main className="min-h-0 flex-1 overflow-y-auto p-3 md:p-5">{children}</main>
      </div>
    </div>
  );
}
