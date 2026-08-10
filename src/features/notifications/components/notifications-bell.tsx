'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import {
  NotificationInboxItem,
  NotificationInboxPopover,
  notificationInboxItemLinkVariants,
  type InboxTone,
} from '@/components/ui/notification-inbox-popover';
import {
  type AttentionReason,
  type StaffAttentionNotification,
} from '@/features/notifications/types';
import { type PendingRequests } from '@/features/requests/types';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { formatTimeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The notifications inbox, behind the bell beside the date on the dashboard.
 *
 * ## Why this is a bell again
 *
 * The feed used to be a page reached from a menu at the foot of the rail — two
 * deliberate acts away from the screen a dietitian actually keeps open, and a
 * notification nobody goes looking for is not a notification. It was then a card
 * on the dashboard, which found the opposite limit: the dashboard is one screen,
 * and a permanent panel listing three names spent a column on something read
 * once a morning and then irrelevant until it changes.
 *
 * A bell is the right size for that. It costs one glyph when there is nothing,
 * says how many when there is, and opens the whole list on a click. The page it
 * links to is still where the full feed lives — this is the way *in*, not a
 * second copy of it.
 *
 * ## Where the parts live
 *
 * The panel itself — trigger, count, filter strip, scroll area, footer — is
 * `NotificationInboxPopover` in `components/ui`. This file is the half that
 * knows what a clinic notification *is*: which query each row came from, which
 * glyph names it, and where clicking it goes. The shared layer must not depend
 * on routing, so the `<Link>` around each row is composed here.
 *
 * ## What this is not
 *
 * **There is no read/unread state, and no "mark as read".** Nothing here is a
 * stored notification: every row is derived live from a pending request or from
 * a client record that has gone quiet, which is the design `loadStaffAttention`
 * and `src/features/portal/notifications.ts` both document. A row leaves when
 * the *thing* stops being true — the request is answered, the plan is written —
 * not when someone dismisses it. Marking one read would be a flag that hides a
 * fact still waiting, which is the one behaviour an inbox must not have.
 * Filtering is by *what kind of thing it is* instead, which is the question a
 * dietitian actually opens this to answer.
 */

/** Which list a row belongs to — the same split `/app/notifications` makes. */
type Group = 'requests' | 'clients';
type Filter = 'all' | Group;

type Row = {
  id: string;
  group: Group;
  href: string;
  icon: IconName;
  tone: InboxTone;
  name: string;
  message: string;
  /** Requests carry an age; an attention flag has no moment it happened at. */
  time: string | null;
};

const REQUEST_ICON = {
  new: 'bookAppointment',
  reschedule: 'refresh',
  cancel: 'close',
} as const satisfies Record<string, IconName>;

const CLIENT_REQUEST_ICON = {
  data_update: 'edit',
  account_deletion: 'archive',
} as const satisfies Record<string, IconName>;

/**
 * A glyph per reason, so three rows that all mean "this client has gone quiet"
 * are told apart before the sentence is read.
 */
const ATTENTION_ICON: Record<AttentionReason, IconName> = {
  noUpcomingAppointment: 'calendar',
  noWeeklyPlan: 'weeklyPlans',
  neverSignedIn: 'person',
};

export function NotificationsBell({
  attention,
  attentionTotal,
  requests,
  locale,
  now,
}: {
  attention: StaffAttentionNotification[];
  /** Everything the query found, not just the rows shown — the count must not lie. */
  attentionTotal: number;
  requests: PendingRequests;
  locale: Locale;
  /** The one instant every "10 minutes ago" in the panel is measured against. */
  now: Date;
}) {
  const t = useTranslations('notifications');
  const tRequests = useTranslations('requests');

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const rows = useMemo<Row[]>(
    () => [
      ...requests.appointments.map((item) => ({
        id: `appointment-${item.id}`,
        group: 'requests' as const,
        href: '/app/requests',
        icon: REQUEST_ICON[item.kind],
        tone: 'attention' as const,
        name: item.clientName,
        message: tRequests(`kind.${item.kind}`),
        time: formatTimeAgo(locale, item.createdAt, now),
      })),
      ...requests.clientRequests.map((item) => ({
        id: `client-request-${item.id}`,
        group: 'requests' as const,
        href: '/app/requests',
        icon: CLIENT_REQUEST_ICON[item.kind],
        tone: 'attention' as const,
        name: item.clientName,
        message: tRequests(`clientKind.${item.kind}`),
        time: formatTimeAgo(locale, item.createdAt, now),
      })),
      ...attention.map((item) => ({
        id: `attention-${item.id}`,
        group: 'clients' as const,
        href: `/app/clients/${item.clientId}`,
        icon: ATTENTION_ICON[item.reason],
        tone: 'incomplete' as const,
        name: item.clientName,
        message: t(`attention.${item.reason}`),
        time: null,
      })),
    ],
    [requests, attention, locale, now, t, tRequests],
  );

  const requestCount = requests.appointments.length + requests.clientRequests.length;

  /*
   * The badge counts every *pending* thing, so it uses `attentionTotal` rather
   * than the rows below it: the list is capped and the number on the bell is not
   * allowed to shrink to match a cap the reader cannot see.
   */
  const badgeCount = requestCount + attentionTotal;

  const visible = filter === 'all' ? rows : rows.filter((row) => row.group === filter);

  return (
    <NotificationInboxPopover
      open={open}
      onOpenChange={setOpen}
      title={t('title')}
      count={badgeCount}
      tabsLabel={t('tabs.label')}
      activeTab={filter}
      onTabChange={setFilter}
      tabs={[
        { value: 'all', label: t('tabs.all'), count: rows.length },
        { value: 'requests', label: t('tabs.requests'), count: requestCount },
        { value: 'clients', label: t('tabs.clients'), count: attention.length },
      ]}
      empty={t('empty')}
      footer={
        /* The full feed, including everything this panel capped. */
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
      {visible.map((row) => (
        <li key={row.id}>
          <Link
            href={row.href}
            onClick={() => setOpen(false)}
            className={notificationInboxItemLinkVariants}
          >
            <NotificationInboxItem
              icon={row.icon}
              tone={row.tone}
              title={row.name}
              description={row.message}
              timestamp={row.time}
            />
          </Link>
        </li>
      ))}
    </NotificationInboxPopover>
  );
}
