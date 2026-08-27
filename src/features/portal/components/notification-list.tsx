'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { NOTIFICATION_ICON, useNotificationCopy } from '@/features/portal/notification-copy';
import { notificationHref, type PortalNotification } from '@/features/portal/notifications';
import { Link } from '@/i18n/navigation';

/**
 * One row per {@link PortalNotification}, read top to bottom like the
 * requests list on `/portal/appointments` — an icon tile naming what kind of
 * thing this is, a title, and the one sentence that explains it.
 *
 * The whole card is a link to `notificationHref(item.kind)` — the screen the
 * notification is about, the same destination `pushDestination` sends a
 * client to from the lock screen. The trailing chevron follows
 * `SettingsLinkRow`'s own convention for "this row goes somewhere".
 *
 * The full-list counterpart of `PortalNotificationRow`
 * (`portal-notifications-bell.tsx`), which draws the same rows flush and
 * ruled inside a 380px popover — this screen has the width for cards instead.
 */
function NotificationRow({ item }: { item: PortalNotification }) {
  const { title, body } = useNotificationCopy(item);

  return (
    <li>
      <Link
        href={notificationHref(item.kind)}
        className="block rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo focus-visible:outline-none"
      >
        <Card size="sm" interactive>
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

            {/* `chevronEnd` mirrors itself — see DIRECTIONAL in `icon.tsx`. */}
            <Icon name="chevronEnd" className="mt-0.5 size-4 shrink-0 self-center text-border" />
          </CardContent>
        </Card>
      </Link>
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
