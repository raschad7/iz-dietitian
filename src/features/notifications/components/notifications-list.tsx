import { getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { formatMinute } from '@/features/booking/format';
import { type StaffNotification } from '@/features/notifications/types';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { formatTimeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

type NotificationsListProps = {
  items: StaffNotification[];
  pendingRequestCount: number;
  locale: Locale;
  now: Date;
};

/**
 * The feed inside the bell's popover.
 *
 * A server component passed into the client popover as `children`, so the
 * dates, the plurals and the whole message catalogue stay on the server.
 *
 * Tone is `attention` (amber), never `destructive`/clay: clay is reserved for a
 * genuine medical flag, and none of these are one.
 */

/** There is no staff-side requests inbox yet, so a request lands on the day it asks about. */
function hrefFor(item: StaffNotification) {
  if (item.kind === 'attention') return `/app/clients/${item.clientId}` as const;
  if (item.preferredDate) {
    return { pathname: '/app/calendar/day' as const, query: { date: item.preferredDate } };
  }
  return '/app/calendar/day' as const;
}

const REQUEST_ICONS = {
  new: 'bookAppointment',
  reschedule: 'refresh',
  cancel: 'close',
} as const satisfies Record<string, IconName>;

export async function NotificationsList({ items, pendingRequestCount, locale, now }: NotificationsListProps) {
  const t = await getTranslations('notifications');

  return (
    <div className="flex flex-col">
      {items.length === 0 ? (
        <p className="flex items-center gap-3 px-4 py-6 text-body-md text-muted-foreground">
          <Icon name="check" className="size-5" />
          {t('empty')}
        </p>
      ) : (
        <ul className="flex max-h-96 flex-col overflow-y-auto p-2">
          {items.map((item) => {
            const isRequest = item.kind === 'request';

            return (
              <li key={item.id}>
                <Link
                  href={hrefFor(item)}
                  className="flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-muted"
                >
                  <span
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-full',
                      isRequest
                        ? 'bg-status-attention-bg text-status-attention-fg'
                        : 'bg-status-incomplete-bg text-status-incomplete-fg',
                    )}
                  >
                    <Icon name={isRequest ? REQUEST_ICONS[item.requestKind] : 'attention'} className="size-4" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-body-md font-medium" dir="auto">
                        {item.clientName}
                      </span>
                      {isRequest ? (
                        <span className="shrink-0 text-label text-muted-foreground">
                          {formatTimeAgo(locale, item.createdAt, now)}
                        </span>
                      ) : null}
                    </span>

                    <span className="block truncate text-caption text-muted-foreground">
                      {isRequest ? t(`request.${item.requestKind}`) : t(`attention.${item.reason}`)}
                    </span>

                    {isRequest && item.preferredDate && item.preferredStartMinute !== null ? (
                      <span className="block truncate text-caption text-muted-foreground">
                        {t('preferred', {
                          when: formatMinute(locale, item.preferredDate, item.preferredStartMinute),
                        })}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border bg-muted/50 p-3">
        {pendingRequestCount > 0 ? (
          <Link href="/app/calendar/day" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            {t('reviewRequests', { count: pendingRequestCount })}
          </Link>
        ) : null}
        <Link href="/app/clients" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          {t('viewClients')}
          <Icon name="chevronEnd" />
        </Link>
      </div>
    </div>
  );
}
