'use client';

import { useTranslations } from 'next-intl';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Dialog, DialogHeader } from '@/components/ui/dialog';
import { useDialogPresence } from '@/components/ui/dialog-motion';
import { Icon } from '@/components/ui/icon';
import { ScrollWindow } from '@/components/ui/scroll-window';
import { getLocaleDirection, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * The dashboard's way into the whole inbox — a dialog over the dashboard rather
 * than a page away from it.
 *
 * **Why a modal and not the route.** "All requests" is read *while working the
 * queue*: the card beside it shows three of what is waiting, and the reason to
 * open the full list is almost always to see the fourth, or to check what was
 * already answered. Navigating for that costs the dashboard — its agenda, its
 * scroll position, the stat cards — and everything answered in the inbox has to
 * be carried back by memory. Over the page, the queue is the only thing that
 * changes, and closing puts the dietitian back exactly where they were.
 *
 * `/app/requests` is untouched and still the same screen: the notifications
 * feed links to it, it is what a bookmark or a shared link opens, and it is
 * where this dialog's content comes from — one `RequestsInbox`, rendered on the
 * server, passed in as `children`. Nothing about the inbox knows it is in a
 * dialog, which is the point: a second copy of that screen would be a second
 * thing to keep in step.
 *
 * **The inbox arrives with the page, not on open.** It is server-rendered
 * markup handed to this client component, so the queue is in the dialog the
 * moment it opens — no spinner, no round trip on a control whose whole promise
 * is "the rest of the list is right here". The cost is that the dashboard now
 * reads the answered history it was avoiding; see the note on `requests` in
 * `src/features/dashboard/page-data.ts`.
 */
/**
 * How many requests the dialog shows before its list starts scrolling.
 *
 * Five, against the dashboard card's three. The card is one of three panels in
 * a band and its height is spent against the two beside it; this surface has
 * the page behind it and only one job. Five is about as many rows as read as a
 * list you can take in at a glance — past that a queue is something you work
 * through, and the scroll is what says so.
 */
const VISIBLE_REQUESTS = 5;

export function RequestsDialogTrigger({
  locale,
  className,
  children,
  inbox,
  heading,
}: {
  locale: Locale;
  /** The trigger's own styling — it is the card header's quiet link. */
  className?: string;
  /** The trigger's label. */
  children: ReactNode;
  /** The inbox itself, rendered on the server. */
  inbox: ReactNode;
  /**
   * The appointments list's label and count, for the header bar beside the X.
   *
   * Passed in rather than derived here: the counts are the server's to state,
   * and this component holds no request data at all — only the markup it shows.
   */
  heading?: ReactNode;
}) {
  const t = useTranslations('requests');
  const tCommon = useTranslations('common');

  const [open, setOpen] = useState(false);
  const dialogPresent = useDialogPresence(open);

  const trigger = useRef<HTMLButtonElement>(null);
  const hasOpened = useRef(false);

  const close = useCallback(() => setOpen(false), []);

  /*
   * Put the keyboard back on the link that opened this. Escape and a backdrop
   * click go through `<dialog>`'s own `close()`, which restores focus natively;
   * the header's close button unmounts the surface instead, and an unmounted
   * modal leaves focus on `<body>`. Same reasoning as `ClientFormTrigger`.
   */
  useEffect(() => {
    if (open) {
      hasOpened.current = true;
    } else if (hasOpened.current && !dialogPresent) {
      trigger.current?.focus();
    }
  }, [dialogPresent, open]);

  return (
    <>
      <button ref={trigger} type="button" onClick={() => setOpen(true)} className={className}>
        {children}
        <Icon name="chevronEnd" className="size-3.5" />
      </button>

      {dialogPresent
        ? createPortal(
            <Dialog
              open={open}
              onClose={close}
              label={t('title')}
              dir={getLocaleDirection(locale)}
              flat
              size="wide"
              className={cn(
                // Height, flex column and clip all come from the responsive
                // dialog frame in `globals.css` now. Only the widths below are
                // this surface's own.
                // Wider than the app's ordinary dialog and narrower than the
                // page: the inbox's own column is `max-w-3xl`, and a request
                // row is a name, a badge and two buttons — at the dialog's
                // default 28rem the buttons wrap under the message on every
                // row.
                'sm:w-[min(48rem,calc(100vw-2rem))]',
                // The same measure again, for the tablet bottom sheet. The
                // `(pointer: coarse)` block in `globals.css` is unlayered and
                // would otherwise replace the width above with the `size="wide"`
                // default of 64rem — so this dialog was 48rem under a mouse and
                // 64rem under a thumb. See `--q-dialog-sheet-width` there.
                '[--q-dialog-sheet-width:min(48rem,calc(100vw-2rem))]',
              )}
            >
              <DialogHeader
                title={t('title')}
                description={t('subtitle')}
                onClose={close}
                closeLabel={tCommon('close')}
                className="px-4 pt-4 sm:px-5 sm:pt-5"
              >
                {/*
                  The appointments list's own heading, up in the header bar
                  beside the close button, rather than on a line of its own over
                  the first card.

                  `DialogHeader` renders its children immediately before the X,
                  so this lands at the inline end of the row — the side the X is
                  on, which is the left in Arabic. The list keeps the words for
                  a screen reader; see `appointmentsHeading` on `RequestsInbox`.
                */}
                {heading}
              </DialogHeader>

              {/*
                The list scrolls, not the dialog: the header stays put while a
                long queue moves under it, which is what makes the close button
                reachable at the bottom of twenty requests. `overscroll-contain`
                keeps the dashboard behind from scrolling on when this hits its
                end.

                Its height is {@link VISIBLE_REQUESTS} rows — `ScrollWindow`
                measures the fifth and stops there. `max-h-[90dvh]` on the
                surface is still the ceiling above it, for a short viewport and
                five long Arabic messages.
              */}
              {/* `pt-4`, so the first card is not tucked under the header's
                  own baseline — the dialog title and the list's heading share
                  that bar, and a card starting flush against it read as part of
                  the heading rather than as the first of a stack. */}
              <ScrollWindow
                visible={VISIBLE_REQUESTS}
                className="min-h-0 flex-1 px-4 pt-4 pb-4 sm:px-5 sm:pb-5"
              >
                {inbox}
              </ScrollWindow>
            </Dialog>,
            document.body,
          )
        : null}
    </>
  );
}
