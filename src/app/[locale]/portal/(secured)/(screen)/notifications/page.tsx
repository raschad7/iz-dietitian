import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { EmptyState } from '@/components/ui/empty-state';
import { NotificationList } from '@/features/portal/components/notification-list';
import { PortalScreenHeader } from '@/features/portal/components/portal-screen-header';
import { loadNotificationsPage } from '@/features/portal/page-data';
import { requirePortalClient } from '@/features/portal/session';
import { resolveLocale } from '@/i18n/params';

type NotificationsPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: NotificationsPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'portal.notifications' });
  return { title: t('title') };
}

/**
 * A pushed screen, not a tab: the bell opens this and the client backs out of
 * it, the same shape every screen under `(screen)` takes.
 *
 * Every item is derived from data another screen already owns — see
 * `src/features/portal/notifications.ts` for why there is no notifications
 * table behind this and no "mark as read" here: a reminder to log today's
 * adherence stops appearing the moment it is logged, because the thing it was
 * about no longer exists, not because a flag was flipped.
 */
export default async function NotificationsPage({ params }: NotificationsPageProps) {
  const locale = await resolveLocale(params);

  const context = await requirePortalClient(locale);
  const { items } = await loadNotificationsPage(context);

  const t = await getTranslations('portal.notifications');

  return (
    <>
      <PortalScreenHeader title={t('title')} fallbackHref="/portal" />

      <main className="min-w-0 flex-1 px-4 py-5 md:px-6">
        <div className="mx-auto w-full max-w-3xl">
          {items.length === 0 ? (
            <EmptyState icon="notifications" title={t('empty.title')} description={t('empty.body')} />
          ) : (
            <NotificationList items={items} />
          )}
        </div>
      </main>
    </>
  );
}
