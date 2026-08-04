import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { Card } from '@/components/ui/card';
import { NotificationsList } from '@/features/notifications/components/notifications-list';
import { loadNotifications } from '@/features/notifications/page-data';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

type NotificationsPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: NotificationsPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'notifications' });
  return { title: t('title') };
}

/**
 * Everything waiting on the dietitian, as a page.
 *
 * The same feed used to live in a bell popover in the app bar. There is no app
 * bar any more, and a popover is the wrong home for it besides: it is a list
 * with a scrollbar, links out of every row and an empty state, which is a page
 * that was being read three rows at a time through a hole in a toolbar.
 *
 * It is reached from the rail's profile menu rather than from the rail itself —
 * a count of things pending is something you check, not somewhere you work.
 *
 * `loadNotifications` reads the clinic the guard resolves here, so nothing about
 * this feed is loaded for screens that never open it — which is the other half
 * of why it left the layout.
 */
export default async function NotificationsPage({ params }: NotificationsPageProps) {
  const locale = await resolveLocale(params);
  const { clinicId } = await requireStaffClinic(locale);

  const [t, data] = await Promise.all([
    getTranslations('notifications'),
    loadNotifications(clinicId),
  ]);

  return (
    <div className="space-y-4 text-start">
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>

      {/*
        `p-0` because the list draws its own rows edge to edge — the card is the
        frame around the feed, not a box with a feed sitting inside it.
      */}
      <Card className="mx-auto w-full max-w-2xl overflow-hidden p-0">
        <NotificationsList
          items={data.items}
          pendingRequestCount={data.pendingRequestCount}
          locale={locale}
          now={data.now}
        />
      </Card>
    </div>
  );
}
