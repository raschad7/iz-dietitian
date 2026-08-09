'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { type StaffAttentionNotification } from '@/features/notifications/types';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * The notifications bell, beside the date on the dashboard.
 *
 * ## Why this is a bell again
 *
 * The feed used to be a page reached from a menu at the foot of the rail —
 * two deliberate acts away from the screen a dietitian actually keeps open, and
 * a notification nobody goes looking for is not a notification. It was then a
 * card on the dashboard, which found the opposite limit: the dashboard is one
 * screen, and a permanent panel listing three names spent a column on something
 * that is read once a morning and then irrelevant until it changes.
 *
 * A bell is the right size for that. It costs one glyph of the page when there
 * is nothing, says how many when there is, and opens the whole list on a click.
 * The page it links to still exists and is still where the full feed lives —
 * this is the way *in*, not a second copy of it.
 *
 * ## What is in it
 *
 * Only the clients-to-check-on half. Requests have their own card on this same
 * screen, with the two buttons that answer them, so listing them here as well
 * would be the same queue twice — the bell says how many are waiting and links
 * to the inbox instead of restating each one.
 */
export function NotificationsBell({
  items,
  total,
  pendingRequestCount,
}: {
  items: StaffAttentionNotification[];
  /** Everything the query found, not just the rows shown — the count must not lie. */
  total: number;
  pendingRequestCount: number;
}) {
  const t = useTranslations('notifications');
  const tRequests = useTranslations('requests');

  const [open, setOpen] = useState(false);

  const badgeCount = total + pendingRequestCount;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/*
        `neutralGhost`, not `ghost`. This sits beside a date in a page header
        with no other chrome in it — an olive glyph there would be the only
        brand-coloured mark above the fold and would read as the page's action,
        which it is not. See the variant's own note.

        `buttonVariants` on the trigger rather than a `Button` inside it, the
        same way the register's filter does it: the trigger is already the
        button, and nesting a real one would put a `<button>` in a `<button>`.
      */}
      <PopoverTrigger
        aria-label={t('title')}
        className={cn(buttonVariants({ variant: 'neutralGhost', size: 'icon-sm' }), 'relative')}
      >
        <Icon name="notifications" className="size-5" />

        {/*
          The count, as a dot with a numeral rather than as a `Badge`: this is
          not a record's state, it is how many things are waiting, and it has to
          survive being drawn at 16px on the corner of a glyph. Capped at 9+ so
          the disc never has to grow and shift the header row under the reader.
        */}
        {badgeCount > 0 ? (
          <span
            aria-hidden
            className={cn(
              'absolute -top-0.5 -end-0.5 flex min-w-4 items-center justify-center rounded-full px-1',
              'bg-primary text-[0.625rem] leading-4 font-semibold text-primary-foreground tabular-nums',
            )}
          >
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        ) : null}
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 gap-3 p-3">
        <PopoverTitle className="text-body-md font-semibold">{t('title')}</PopoverTitle>

        {/*
          Requests are one line, not a list. The card below this header already
          shows every one of them with Accept and Decline on it; repeating them
          here would be the same queue twice on one screen, and the copy without
          the buttons is the useless one.
        */}
        {pendingRequestCount > 0 ? (
          <Link
            href="/app/requests"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md bg-status-attention-bg px-3 py-2 text-body-sm text-status-attention-fg transition-opacity hover:opacity-90"
          >
            <Icon name="chat" className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              {tRequests('dashboard.heading')}
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{pendingRequestCount}</span>
          </Link>
        ) : null}

        <div className="space-y-1">
          <p className="text-caption font-medium text-muted-foreground">{t('groups.attention')}</p>

          {items.length === 0 ? (
            <p className="py-1 text-body-sm text-muted-foreground">{t('groups.attentionEmpty')}</p>
          ) : (
            /*
              `-mx-1.5` lets each row's hover fill reach the popover's own edge,
              so a row reads as a row rather than as a chip floating in padding.
            */
            <ul className="-mx-1.5 max-h-64 overflow-y-auto overscroll-contain">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/app/clients/${item.clientId}`}
                    onClick={() => setOpen(false)}
                    className="flex flex-col gap-0.5 rounded-md px-1.5 py-1.5 text-body-sm transition-colors hover:bg-secondary/60"
                  >
                    <span className="truncate font-medium" dir="auto">
                      {item.clientName}
                    </span>
                    <span className="truncate text-muted-foreground">
                      {t(`attention.${item.reason}`)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* The full feed, including everything this popover capped. */}
        <Link
          href="/app/notifications"
          onClick={() => setOpen(false)}
          className="flex items-center gap-1 self-start text-body-sm font-medium text-secondary-foreground underline-offset-4 hover:underline"
        >
          {t('seeAll')}
          <Icon name="chevronEnd" className="size-4" />
        </Link>
      </PopoverContent>
    </Popover>
  );
}
