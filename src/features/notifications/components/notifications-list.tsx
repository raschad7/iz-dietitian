'use client';

import { useTranslations } from 'next-intl';

import { EmptyState } from '@/components/ui/empty-state';
import { EMPTY_NOTIFICATION_STATE, notificationView } from '@/features/notifications/browser-state';
import { type NotificationsData } from '@/features/notifications/types';
import { useBrowserNotificationState } from '@/features/notifications/use-browser-notification-state';

import { NotificationRow } from './notification-row';

/** The full client-attention feed; requests remain in their dashboard card. */
export function NotificationsList({ data }: { data: NotificationsData }) {
  const t = useTranslations('notifications');
  const { state, markRead, dismiss } = useBrowserNotificationState();
  const read = new Set(state?.read ?? []);
  const view = notificationView(
    data.attention.map((item) => item.id),
    state ?? EMPTY_NOTIFICATION_STATE,
  );
  const visibleIds = new Set(view.visibleIds);
  const visible = data.attention.filter((item) => visibleIds.has(item.id));

  if (visible.length === 0) {
    const dismissed = data.attention.length > 0;
    return (
      <EmptyState
        icon="check"
        title={t(dismissed ? 'dismissed' : 'empty')}
        description={t(dismissed ? 'dismissedDescription' : 'emptyDescription')}
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {visible.map((item) => (
        <NotificationRow
          key={item.id}
          item={item}
          unread={!read.has(item.id)}
          onOpen={() => markRead(item.id)}
          onDelete={() => dismiss(item.id)}
        />
      ))}
    </ul>
  );
}
