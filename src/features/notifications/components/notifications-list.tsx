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

/**
 * A request lands in the inbox that can answer it; anything else lands on the
 * client it is about.
 *
 * This used to send requests to the calendar day they asked about, because
 * there was no staff-side inbox and the day view was the closest thing to one.
 * There is now — `/app/requests` — and it is where accepting or declining
 * actually happens, so a feed row that dropped the reader on a calendar to
 * re-do the booking by hand would be sending them the long way round.
 */
function hrefFor(item: StaffNotification) {
  if (item.kind === 'attention') return `/app/clients/${item.clientId}` as const;
  return '/app/requests' as const;
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
          <Link href="/app/requests" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
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
