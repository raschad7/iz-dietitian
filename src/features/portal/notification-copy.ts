'use client';

import { useLocale, useTranslations } from 'next-intl';

import { type IconName } from '@/components/ui/icon';
import { formatLongDate, formatMinute } from '@/features/booking/format';
import { type Locale } from '@/i18n/routing';
import { formatDate } from '@/lib/format';

import { type PortalNotification } from './notifications';

/**
 * How to read a {@link PortalNotification} in words — shared by the header's
 * bell (`PortalNotificationsBell`, a five-row preview) and the full feed at
 * `/portal/notifications` (`NotificationList`), so the two never describe the
 * same row differently.
 */
export const NOTIFICATION_ICON: Record<PortalNotification['kind'], IconName> = {
  adherenceReminder: 'progress',
  appointmentReminder: 'calendar',
  appointmentBooked: 'calendar',
  planUpdate: 'myPlan',
  clinicMessage: 'chat',
};

/**
 * One notification, in words.
 *
 * A hook rather than a plain function because every branch reads the catalogue,
 * and two of them format a date in the active locale. A `switch` exhaustive
 * over `PortalNotification['kind']` on its own — a new kind is then a compile
 * error here rather than a row that renders blank.
 */
export function useNotificationCopy(item: PortalNotification): { title: string; body: string } {
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

    case 'appointmentBooked':
      return {
        title: t('appointmentBooked.title'),
        body: t('appointmentBooked.body', {
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
