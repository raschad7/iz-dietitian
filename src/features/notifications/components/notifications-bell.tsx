'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { buttonVariants } from '@/components/ui/button';
import { Dialog, DialogHeader } from '@/components/ui/dialog';
import { useDialogPresence } from '@/components/ui/dialog-motion';
import { Icon } from '@/components/ui/icon';
import { NotificationInboxPopover } from '@/components/ui/notification-inbox-popover';
import { ScrollWindow } from '@/components/ui/scroll-window';
import { EMPTY_NOTIFICATION_STATE, notificationView } from '@/features/notifications/browser-state';
import { type StaffAttentionNotification } from '@/features/notifications/types';
import { useBrowserNotificationState } from '@/features/notifications/use-browser-notification-state';
import { getLocaleDirection, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import { NotificationRow } from './notification-row';
import { NotificationsList } from './notifications-list';

/**
 * How many rows the bell's popover previews.
 *
 * Five, matching the dialog behind "See all notifications" — the preview and
 * the full feed showing a different number of the same rows made the popover
 * look like a different list rather than the top of that one.
 */
const PREVIEW_LIMIT = 5;

/**
 * How many rows the "all notifications" dialog shows before it scrolls.
 *
 * Five, matching the requests dialog a dietitian opens from the same screen:
 * two surfaces reached from the same corner of the app should not disagree
 * about how much of a list is a glance.
 */
const VISIBLE_NOTIFICATIONS = 5;

/** Client-attention notifications behind the dashboard bell. */
export function NotificationsBell({ attention }: { attention: StaffAttentionNotification[] }) {
  const t = useTranslations('notifications');
  const tCommon = useTranslations('common');
  // The bell is mounted with nothing but its rows, so the dialog's direction
  // comes from the active locale rather than being threaded down to it.
  const locale = useLocale() as Locale;

  const [open, setOpen] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const allDialogPresent = useDialogPresence(allOpen);

  const { state, markRead, markAllRead, dismiss } = useBrowserNotificationState();

  const closeAll = useCallback(() => setAllOpen(false), []);

  /*
   * Send the keyboard back to the bell when the dialog closes.
   *
   * What opened the dialog was a button inside the popover, and the popover is
   * gone by then — so focus goes to the bell itself, which is the control still
   * on the page. Escape and a backdrop click restore focus natively through
   * `<dialog>`; the header's close button unmounts the surface instead, and an
   * unmounted modal leaves focus on `<body>`. Same as `ClientFormTrigger`.
   */
  const bell = useRef<HTMLDivElement>(null);
  const hasOpened = useRef(false);

  useEffect(() => {
    if (allOpen) {
      hasOpened.current = true;
    } else if (hasOpened.current && !allDialogPresent) {
      bell.current?.querySelector('button')?.focus();
    }
  }, [allDialogPresent, allOpen]);

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
    // A wrapper only, so the dialog can find the bell again to hand focus back.
    <div ref={bell}>
      <NotificationInboxPopover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);

          /*
           * Opening the bell reads what it shows.
           *
           * The {@link PREVIEW_LIMIT} rows in the popover are on screen the
           * moment it opens, so counting them as unread afterwards leaves the
           * badge claiming work the dietitian has just been shown — and the
           * only way to clear it was to click into each client's record in
           * turn. The rows below the preview are untouched: they were not
           * shown, so they are still unread, and the badge drops by exactly
           * what was on screen. "See all notifications" reads the rest.
           */
          if (next) markAllRead(preview.map((item) => item.id));
        }}
        title={t('title')}
        /*
          The panel comes up from the bottom edge instead of hanging off the
          bell on every touch surface — the same shape the "see all" dialog
          behind it already takes there. The bell is in the inline-end corner of
          the page header, which on a hand-held device is the corner furthest
          from the hand holding it; the same rows arrive under the thumb
          instead, with the page dimmed behind them.

          No prop needed: `sheetOnTouch` defaults to `true`. It used to be
          spelled `mobileSheet` and opted in here alone, which left the portal's
          bell believing it was a popover while `globals.css` drew it as a
          sheet — see the prop's own note.
        */
        count={count}
        unread={unread}
        empty={empty}
        footer={
          /*
            Centred, and the button is its own width rather than the footer's.

            Full width, it was a bar across the foot of the popover — the shape
            of a primary action closing a decision, on a control that only opens
            a longer list. At its own width in the middle of the row it reads as
            what it is: the way on from a preview.
          */
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setAllOpen(true);
                // Opening the whole feed reads it. Every visible row is about
                // to be on screen, so leaving them unread would keep a badge on
                // the bell for work the dietitian has just been shown.
                markAllRead(visible.map((item) => item.id));
              }}
              className={buttonVariants({ variant: 'ghost', size: 'sm' })}
            >
              {t('seeAll')}
              <Icon name="chevronEnd" className="size-4" />
            </button>
          </div>
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

      {/*
        The whole feed, over the page rather than a page away from it.

        The popover shows {@link PREVIEW_LIMIT} rows, and "See all notifications"
        under them used to be a link to `/app/notifications`. Reading the rest is
        not a change of task — it is the same list, further down — and navigating
        for it cost whatever screen the reader was on, for a page that is this
        list and nothing else. `/app/notifications` stays: the profile menu's own
        way in still goes there, and it is what a bookmark opens.

        No read of its own, either. The bell already holds every attention row —
        it has to, or its count would be a lie — so the dialog is the same array
        rendered at full length.
      */}
      {allDialogPresent
        ? createPortal(
            <Dialog
              open={allOpen}
              onClose={closeAll}
              label={t('title')}
              dir={getLocaleDirection(locale)}
              flat
              size="wide"
              className={cn(
                // Height, flex column and clip all come from the responsive
                // dialog frame in `globals.css` now. Only the widths below are
                // this surface's own.
                // Narrower than the requests dialog: a notification is one line
                // about one client, not a request carrying two buttons.
                'sm:w-[min(40rem,calc(100vw-2rem))]',
                // And the same measure for the tablet bottom sheet, which the
                // unlayered `(pointer: coarse)` rule in `globals.css` would
                // otherwise widen to the `size="wide"` default of 64rem. This is
                // the surface in the tablet screenshots; see
                // `--q-dialog-sheet-width`.
                '[--q-dialog-sheet-width:min(40rem,calc(100vw-2rem))]',
              )}
            >
              <DialogHeader
                title={t('title')}
                description={t('subtitle')}
                onClose={closeAll}
                closeLabel={tCommon('close')}
                className="px-4 pt-4 sm:px-5 sm:pt-5"
              >
                {/*
                  How many, beside the X — `DialogHeader` renders its children
                  immediately before the close button, so it lands at the inline
                  end of the bar, which is the left in Arabic.

                  It counts what the dialog actually shows: `visible`, after the
                  rows this browser has dismissed are taken out, so the number
                  and the list under it can never disagree. Muted and at the
                  title's own size, matching the requests dialog beside it.
                */}
                {count > 0 ? (
                  <span className="self-center text-heading-sm font-semibold tabular-nums text-muted-foreground">
                    {count}
                  </span>
                ) : null}
              </DialogHeader>

              {/* Five rows, then it scrolls — `ScrollWindow` measures the fifth
                  and stops on its edge. The header stays put above it, so the
                  way out is reachable from the bottom of a long feed.

                  `pt-4` so the first row clears the header rather than starting
                  flush under its baseline. */}
              <ScrollWindow
                visible={VISIBLE_NOTIFICATIONS}
                className="min-h-0 flex-1 px-4 pt-4 pb-4 sm:px-5 sm:pb-5"
              >
                <NotificationsList data={{ attention }} />
              </ScrollWindow>
            </Dialog>,
            document.body,
          )
        : null}
    </div>
  );
}
