import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { Header } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';
import { type IconName } from '@/components/ui/icon';
import { NotificationsList } from '@/features/notifications/components/notifications-list';
import { NotificationsMenu } from '@/features/notifications/components/notifications-menu';
import { loadNotifications } from '@/features/notifications/page-data';
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
  { href: '/app/weekly-plans', labelKey: 'weeklyPlans' },
  { href: '/app/meal-plans', labelKey: 'mealPlans' },
  { href: '/app/dishes', labelKey: 'dishes' },
  { href: '/app/foods', labelKey: 'foods' },
  { href: '/app/settings/whatsapp', labelKey: 'whatsapp' },
  { href: '/app/settings/security', labelKey: 'security' },
] as const;

/**
 * One glyph per destination. Nine text-only rows are hard to scan at a glance;
 * the icon is what lets someone find "Foods" without reading all nine.
 *
 * `satisfies` ties this to the nav list, so adding a destination without an
 * icon is a compile error rather than a row that quietly sits misaligned.
 */
const NAV_ICONS = {
  dashboard: 'dashboard',
  clients: 'clients',
  calendar: 'calendar',
  weeklyPlans: 'weeklyPlans',
  mealPlans: 'mealPlans',
  dishes: 'dishes',
  foods: 'foods',
  whatsapp: 'whatsapp',
  security: 'security',
} as const satisfies Record<(typeof NAV_ITEMS)[number]['labelKey'], IconName>;

export default async function AppLayout({ children, params }: AppLayoutProps) {
  const locale = await resolveLocale(params);

  // Authoritative guard for the whole dietitian area.
  const session = await requireStaffSession(locale);

  const [t, tn] = await Promise.all([getTranslations('app'), getTranslations('notifications')]);

  /*
   * The bell is part of the shell, so it loads here rather than on a page.
   * Guarded on `clinicId` rather than switched to `requireStaffClinic`: a staff
   * account without a clinic can still read the shared food reference, and
   * demanding one here would turn that into a crash.
   */
  const clinicId = session.user.clinicId;
  const notifications = clinicId ? await loadNotifications(clinicId) : null;

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
            notifications ? (
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
            ) : null
          }
        />
        <main className="min-h-0 flex-1 overflow-y-auto p-3 md:p-5">{children}</main>
      </div>
    </div>
  );
}
