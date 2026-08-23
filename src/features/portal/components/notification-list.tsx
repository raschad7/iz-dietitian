'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { NOTIFICATION_ICON, useNotificationCopy } from '@/features/portal/notification-copy';
import { type PortalNotification } from '@/features/portal/notifications';

/**
 * One row per {@link PortalNotification}, read top to bottom like the
 * requests list on `/portal/appointments` — an icon tile naming what kind of
 * thing this is, a title, and the one sentence that explains it. Nothing here
 * is a link or a control: every item already points at a screen the client
 * can reach from the tab bar, so this is a summary, not a second inbox.
 *
 * The full-list counterpart of `PortalNotificationRow`
 * (`portal-notifications-bell.tsx`), which draws the same rows flush and
 * ruled inside a 380px popover — this screen has the width for cards instead.
 */
function NotificationRow({ item }: { item: PortalNotification }) {
  const { title, body } = useNotificationCopy(item);

  return (
    <li>
      <Card size="sm">
        <CardContent className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-icon-chip text-icon-chip-foreground"
          >
            <Icon name={NOTIFICATION_ICON[item.kind]} className="size-4.5" />
          </span>

          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="font-heading text-sm font-medium">{title}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

export function NotificationList({ items }: { items: readonly PortalNotification[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <NotificationRow key={item.id} item={item} />
      ))}
    </ul>
  );
}
