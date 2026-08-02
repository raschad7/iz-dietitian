'use client';

import { Popover } from '@base-ui/react/popover';
import type { ReactNode } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

type NotificationsMenuProps = {
  /** Pending requests only — the badge counts what someone is actually waiting on. */
  count: number;
  /** The trigger's accessible name; translated on the server so this stays a shell. */
  label: string;
  title: string;
  /** The feed itself, rendered on the server and passed through untouched. */
  children: ReactNode;
};

/**
 * The app bar's notification bell.
 *
 * A client component **only** because a popover needs click-outside, Escape and
 * focus management — the feed inside it is a server-rendered subtree handed in
 * as `children`, so no formatting, no translation and no client row of the
 * database crosses into the bundle.
 *
 * The badge counts pending *requests*, not every row in the feed: a request has
 * a person waiting for an answer, while "no meal plan yet" is a nudge. A number
 * on a bell promises the first kind.
 */
export function NotificationsMenu({ count, label, title, children }: NotificationsMenuProps) {
  return (
    <Popover.Root>
      {/* The shared icon-button skin, not a local copy of it. `icon-sm` because
          the app bar is a toolbar — the same compact size sign-out uses. */}
      <Popover.Trigger aria-label={label} className={cn(buttonVariants({ size: 'icon-sm' }), 'relative')}>
        <Icon name="notifications" className="size-4" />

        {count > 0 ? (
          /*
            The count sits on the block-start/inline-end corner — the one the
            Arc does not sweep, so the badge never collides with the tail.
            `aria-hidden` because the trigger's own label already says it.
          */
          <span
            aria-hidden
            className="absolute -top-1 -inset-e-1 flex min-w-4 items-center justify-center rounded-full bg-status-attention-fg px-1 font-mono text-label leading-4 text-background"
          >
            {count}
          </span>
        ) : null}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
          <Popover.Popup className="w-[min(22rem,calc(100vw-1.5rem))] origin-(--transform-origin) overflow-hidden rounded-lg rounded-ee-4xl bg-popover text-popover-foreground shadow-overlay ring-1 ring-foreground/10 transition-[transform,opacity] duration-200 ease-[cubic-bezier(.2,.6,.2,1)] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <Popover.Title className="border-b border-border px-4 py-3 font-heading text-heading-sm font-semibold">
              {title}
            </Popover.Title>
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
