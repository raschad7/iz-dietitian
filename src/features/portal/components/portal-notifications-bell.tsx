'use client';

import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import {
  NotificationInboxItem,
  notificationInboxItemLinkVariants,
  NotificationInboxPopover,
} from '@/components/ui/notification-inbox-popover';
import { NOTIFICATION_ICON, useNotificationCopy } from '@/features/portal/notification-copy';
import { notificationHref, type PortalNotification } from '@/features/portal/notifications';
import { Link } from '@/i18n/navigation';

/**
 * The client's feed, behind the bell in `PortalHeader`: the latest rows in a
 * popover, "see all" leading to the full list at `/portal/notifications`.
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
 * **The rows are flush and ruled here, where the full screen draws cards.**
 * That is the shared component's shape and it is the right one: a 380px panel
 * is already a surface, and five `Card`s inside it would be five more. The
 * screen behind "see all" keeps the cards — see `NotificationList`.
 *
 * **`PREVIEW_LIMIT` caps the panel; the screen does not.** `buildNotifications`
 * already caps the whole feed at eight, so the two rarely disagree by much —
 * but the panel is a glance from whatever tab the client is on, and five rows
 * is what it can hold without scrolling on a short phone.
 *
 * **The seen marks stay in `PortalHeader`**, which is where the store that
 * holds them lives and where the ⚠ note explaining why they cannot live in the
 * database already is. This takes the count it computed and calls `onOpen`
 * when the panel opens; opening the feed is what reads it.
 */

/**
 * How many rows the popover previews before "see all" takes over.
 *
 * Five, the same number the staff bell settled on (`notifications-bell.tsx`)
 * for the identical reason: a panel that scrolls to be read is no longer a
 * glance.
 */
const PREVIEW_LIMIT = 5;

function PortalNotificationRow({ item }: { item: PortalNotification }) {
  const { title, body } = useNotificationCopy(item);

  return (
    <li>
      {/*
        `notificationHref` — the screen this row is about, the same
        destination a push notification for the same event opens. The shared
        component's own doc comment asks for exactly this: a `<Link>` wrapping
        the presentational item, carrying `notificationInboxItemLinkVariants`.
      */}
      <Link href={notificationHref(item.kind)} className={notificationInboxItemLinkVariants}>
        {/*
          No `tone`. The shared item's tones are the practitioner's triage —
          attention for a client who needs chasing, incomplete for a record with a
          hole in it — and nothing in this feed is a problem the reader owns.
          Neutral is the honest answer for all four kinds.
        */}
        <NotificationInboxItem icon={NOTIFICATION_ICON[item.kind]} title={title} description={body} />
      </Link>
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

  const preview = items.slice(0, PREVIEW_LIMIT);

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
      /*
        A popup anchored to the bell on every device, phone included — not the
        shared component's own default of a bottom sheet on touch. "See all"
        already leads to `/portal/notifications`, a page of its own with a
        back control, so the panel here only ever needs to be a glance rather
        than a surface worth the weight of a sheet.
      */
      sheetOnTouch={false}
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
      /*
        Centred, and the link is its own width rather than the footer's —
        the staff bell's own reasoning (`notifications-bell.tsx`): full width
        it reads as a primary action closing the panel, and this only opens a
        longer list. A real `<Link>`, not a button that opens a dialog over
        the page: the client asked for a page they can back out of, with its
        own back control, not another surface stacked on this one.
      */
      footer={
        <div className="flex justify-center">
          <Link href="/portal/notifications" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            {t('seeAll')}
            <Icon name="chevronEnd" className="size-4" />
          </Link>
        </div>
      }
    >
      {preview.map((item) => (
        <PortalNotificationRow key={item.id} item={item} />
      ))}
    </NotificationInboxPopover>
  );
}
