'use client';

import { useLocale, useTranslations } from 'next-intl';

import { type IconName } from '@/components/ui/icon';
import {
  NotificationInboxItem,
  NotificationInboxPopover,
} from '@/components/ui/notification-inbox-popover';
import { formatLongDate, formatMinute } from '@/features/booking/format';
import { type PortalNotification } from '@/features/portal/notifications';
import { type Locale } from '@/i18n/routing';
import { formatDate } from '@/lib/format';

/**
 * The client's feed, behind the bell in `PortalHeader`.
 *
 * ## Why this is a popup and not a screen
 *
 * It was a screen: `/portal/notifications`, reached by tapping the bell, with a
 * back control and a list. Everything on that screen was one sentence long and
 * none of it was actionable — an appointment reminder, "this week's plan is
 * ready", the clinic's answer to a request — so the whole interaction was
 * *leave what you were doing, read four lines, come back*. A feed nobody acts
 * on inside a screen you have to exit is a page that costs more to visit than
 * it returns; over the page it is a glance.
 *
 * The route is gone with it. It carried nothing this panel does not — same
 * loader, same rows, same empty state — and a screen reachable only from a
 * control that now opens a popover is a screen with no way in.
 *
 * ## Reusing the practitioner's inbox
 *
 * `NotificationInboxPopover` is the shared shell, already built for the staff
 * bell: the panel measurements, the header with its count, the ruled rows, the
 * empty state and the scroll when a short viewport cannot hold the list. Two
 * class seams on it — `triggerClassName` and `badgeClassName`, documented there
 * — are what let the portal keep its own bell rather than inherit a bordered
 * grey button into a header that has no other chrome in it.
 *
 * **The rows are flush and ruled here, where the screen drew cards.** That is
 * the shared component's shape and it is the right one: a 380px panel is
 * already a surface, and eight `Card`s inside it would be eight more.
 *
 * ## Deliberately not here
 *
 * **Tabs, a footer, and any kind of link.** Nothing in this feed is a
 * destination — every row is derived from a record that already has its own
 * screen (`features/portal/notifications.ts`), so a row that navigated would be
 * guessing which of them the client meant. There is also nowhere for a "see
 * all" to lead any more: the panel holds the whole feed, which
 * `buildNotifications` caps at eight.
 *
 * **The seen marks.** They stay in `PortalHeader`, which is where the store
 * that holds them lives and where the ⚠ note explaining why they cannot live in
 * the database already is. This takes the count it computed and calls `onOpen`
 * when the panel opens; opening the feed is what reads it.
 */

const ICON: Record<PortalNotification['kind'], IconName> = {
  adherenceReminder: 'progress',
  appointmentReminder: 'calendar',
  planUpdate: 'myPlan',
  clinicMessage: 'chat',
};

/**
 * One notification, in words.
 *
 * A hook rather than a plain function because every branch reads the catalogue,
 * and two of them format a date in the active locale. Lifted out of the row so
 * the `switch` is exhaustive over `PortalNotification['kind']` on its own — a
 * new kind is then a compile error here rather than a row that renders blank.
 */
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

function PortalNotificationRow({ item }: { item: PortalNotification }) {
  const { title, body } = useNotificationCopy(item);

  return (
    <li>
      {/*
        No `tone`. The shared item's tones are the practitioner's triage —
        attention for a client who needs chasing, incomplete for a record with a
        hole in it — and nothing in this feed is a problem the reader owns.
        Neutral is the honest answer for all four kinds.
      */}
      <NotificationInboxItem icon={ICON[item.kind]} title={title} description={body} />
    </li>
  );
}

export function PortalNotificationsBell({
  items,
  unread,
  onOpen,
  triggerClassName,
}: {
  /** The whole feed, from `loadPortalNotifications` — at most eight rows. */
  items: readonly PortalNotification[];
  /** How many of those this browser has not been shown. See `PortalHeader`. */
  unread: number;
  /** Fired when the panel opens: the rows are on screen, so they are read. */
  onOpen: () => void;
  triggerClassName?: string;
}) {
  const t = useTranslations('portal.notifications');
  const tHeader = useTranslations('portal.header');

  return (
    <NotificationInboxPopover
      title={t('title')}
      /*
        The trigger's accessible name says how many are waiting, exactly as the
        link before it did — a bell that announces itself as "Notifications"
        alone hides the one fact the badge beside it is drawing.
      */
      triggerLabel={
        unread > 0 ? tHeader('notificationsWaiting', { count: unread }) : tHeader('notifications')
      }
      /*
        `count` is what the panel holds and `unread` is what the bell claims.

        They are two different facts here, which is the case the shared
        component's `unread` prop exists for: the feed is derived and does not
        shrink when it is read — an appointment two days out is still two days
        out — so the count beside the title stays lit while the disc on the bell
        goes quiet the moment the panel is opened.
      */
      count={items.length}
      unread={unread}
      /*
        Both lines, as the screen drew them. The heading alone — "no new
        notifications" — states the obvious about an empty panel; the sentence
        under it is the part that says what will eventually appear here, which
        is the only thing worth reading in a box with nothing in it.

        `empty` takes a node, so the shell's own centring and muted tone hold
        and only the emphasis on the first line is added.
      */
      empty={
        <>
          <span className="block font-medium text-foreground">{t('empty.title')}</span>
          <span className="mt-1 block">{t('empty.body')}</span>
        </>
      }
      /*
        `align="start"`: this bell sits at the header's inline-start — the right
        in Arabic, the left in English — so a panel aligned to its inline-end
        would open across the screen and collide with the far edge on a phone.
      */
      align="start"
      onOpenChange={(open) => {
        if (open) onOpen();
      }}
      triggerClassName={triggerClassName}
      /*
        The complete-mark green, and a ring in the header's own colour.

        The default is clay, which is the practitioner app's only alarm. Nothing
        in a client's feed is an alarm — it is the portal's "something for you",
        which is already this green everywhere else it appears. The ring is what
        separates the disc from the glyph under it, and it holds on the home
        tab too: against the green wash a card-coloured ring still reads as a
        gap rather than as part of the badge.
      */
      badgeClassName="bg-status-complete-mark text-white ring-2 ring-card"
    >
      {items.map((item) => (
        <PortalNotificationRow key={item.id} item={item} />
      ))}
    </NotificationInboxPopover>
  );
}
