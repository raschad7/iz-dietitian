'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { NotificationInboxPopover } from '@/components/ui/notification-inbox-popover';
import { EMPTY_NOTIFICATION_STATE, notificationView } from '@/features/notifications/browser-state';
import { type StaffAttentionNotification } from '@/features/notifications/types';
import { useBrowserNotificationState } from '@/features/notifications/use-browser-notification-state';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

import { NotificationRow } from './notification-row';

const PREVIEW_LIMIT = 4;

/** Client-attention notifications behind the dashboard bell. */
export function NotificationsBell({ attention }: { attention: StaffAttentionNotification[] }) {
  const t = useTranslations('notifications');
  const [open, setOpen] = useState(false);
  const { state, markRead, dismiss } = useBrowserNotificationState();

  const read = new Set(state?.read ?? []);
  const view = notificationView(
    attention.map((item) => item.id),
    state ?? EMPTY_NOTIFICATION_STATE,
  );
  const visibleIds = new Set(view.visibleIds);
  const visible = attention.filter((item) => visibleIds.has(item.id));
  const preview = visible.slice(0, PREVIEW_LIMIT);
  const count = visible.length;
  const unread = state ? view.unreadCount : 0;
  const empty = attention.length > 0 && visible.length === 0 ? t('dismissed') : t('empty');

  return (
    <NotificationInboxPopover
      open={open}
      onOpenChange={setOpen}
      title={t('title')}
      count={count}
      unread={unread}
      empty={empty}
      footer={
        <Link
          href="/app/notifications"
          onClick={() => setOpen(false)}
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'w-full')}
        >
          {t('seeAll')}
          <Icon name="chevronEnd" className="size-4" />
        </Link>
      }
    >
      {preview.map((item) => (
        <NotificationRow
          key={item.id}
          item={item}
          compact
          unread={!read.has(item.id)}
          onOpen={() => {
            markRead(item.id);
            setOpen(false);
          }}
          onDelete={() => dismiss(item.id)}
        />
      ))}
    </NotificationInboxPopover>
  );
}
