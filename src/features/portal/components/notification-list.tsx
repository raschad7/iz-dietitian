import { useLocale, useTranslations } from 'next-intl';

import { Card, CardContent } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { formatLongDate, formatMinute } from '@/features/booking/format';
import { type PortalNotification } from '@/features/portal/notifications';
import { type Locale } from '@/i18n/routing';
import { formatDate } from '@/lib/format';

/**
 * One row per {@link PortalNotification}, read top to bottom like the
 * requests list on `/portal/appointments` — an icon tile naming what kind of
 * thing this is, a title, and the one sentence that explains it. Nothing here
 * is a link or a control: every item already points at a screen the client
 * can reach from the tab bar, so this is a summary, not a second inbox.
 */

const ICON: Record<PortalNotification['kind'], IconName> = {
  adherenceReminder: 'progress',
  appointmentReminder: 'calendar',
  planUpdate: 'myPlan',
  clinicMessage: 'chat',
};

function useNotificationCopy(item: PortalNotification): { title: string; body: string } {
  const locale = useLocale() as Locale;
  const t = useTranslations('portal.notifications.items');
  const tRequest = useTranslations('portal.request');

  switch (item.kind) {
    case 'adherenceReminder':
      return { title: t('adherenceReminder.title'), body: t('adherenceReminder.body') };

    case 'appointmentReminder':
      return {
        title: t('appointmentReminder.title'),
        body: t('appointmentReminder.body', {
          date: formatLongDate(locale, item.date),
          time: formatMinute(locale, item.date, item.startMinute),
        }),
      };

    case 'planUpdate':
      return {
        title: t('planUpdate.title'),
        body: t('planUpdate.body', { date: formatLongDate(locale, item.weekStartDate) }),
      };

    case 'clinicMessage':
      return {
        title: t('clinicMessage.title'),
        body: t('clinicMessage.body', {
          kind: tRequest(`kind.${item.requestKind}`),
          status: tRequest(`status.${item.status}`),
          date: formatDate(locale, item.respondedAt),
        }),
      };
  }
}

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
            <Icon name={ICON[item.kind]} className="size-4.5" />
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
