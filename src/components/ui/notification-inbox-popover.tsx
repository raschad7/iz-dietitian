'use client';

import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { Segmented } from '@/components/ui/segmented';
import { cn } from '@/lib/utils';

/**
 * A notifications inbox behind a bell: a count on the trigger, a filter strip,
 * a scrolling list of items and a footer that leads to the full feed.
 *
 * ## What lives here and what does not
 *
 * This file is the *shell*. It knows about shape, spacing and states; it knows
 * nothing about requests, clients or routes. Feature code supplies the rows and
 * wraps each one in its own `<Link>` — the same division `Tabs` already draws by
 * exporting `tabLinkVariants` instead of a `TabLink`, and for the same reason:
 * `components/ui` is the shared layer and must not depend on routing.
 *
 * ```tsx
 * <NotificationInboxPopover
 *   title={t('title')} count={5}
 *   tabs={[{ value: 'all', label: 'All', count: 5 }]}
 *   activeTab={tab} onTabChange={setTab} tabsLabel={t('tabs.label')}
 *   footer={<Link href="/app/notifications" className={...}>…</Link>}
 * >
 *   {rows.map((row) => (
 *     <li key={row.id}>
 *       <Link href={row.href}><NotificationInboxItem {...row} /></Link>
 *     </li>
 *   ))}
 * </NotificationInboxPopover>
 * ```
 *
 * ## Deliberately not here
 *
 * **Read/unread, and "mark all as read".** The reference inbox this is modelled
 * on keeps both, and they are the right controls when a notification is a stored
 * row someone dismisses. Where a feed is *derived* — a row exists because a
 * request is unanswered and vanishes when it is answered — a read flag hides a
 * fact that is still true, which is the one thing an inbox must not do. A caller
 * that does have stored notifications can express "unread" as one of its `tabs`
 * and a `tone` on the item; nothing here stands in the way.
 */

/**
 * The panel's measurements, declared once and inherited by everything inside.
 *
 * They are `clamp()`s rather than breakpoint variants because this panel hangs
 * off a trigger in a page header and has no layout of its own to switch at — it
 * shrinks continuously on a narrow phone and settles at a comfortable reading
 * width on a desktop, which is one expression per value instead of three
 * utilities. The width tops out at 23.75rem, the 380px the reference uses.
 *
 * There is no radius here any more. The rows used to be 8px cards and are now
 * flush, ruled entries that run the full width of the panel — a full-bleed row
 * has no free corner for a radius to round, and the only rounded surface left
 * is the panel itself, which takes the card radius from `PopoverContent`.
 *
 * ⚠ `--notif-text` starts at 12px — `text-caption`, the step
 * `docs/design-system.md` reserves for helper text and explicitly not for
 * anything essential. It is also the one value here the design system would
 * rather see snapped to whole pixels (see "Keeping small text crisp"); a clamp
 * is fractional through the middle of its range by definition. Pin the floor
 * and the ceiling to the same `0.75rem` if it ever reads soft.
 */
const MEASURES = [
  '[--notif-width:clamp(17.5rem,90vw,23.75rem)]',
  '[--notif-gap:clamp(0.5rem,0.4rem_+_0.4vw,0.75rem)]',
  '[--notif-pad:clamp(0.625rem,0.5rem_+_0.5vw,0.875rem)]',
  '[--notif-text:clamp(0.75rem,0.72rem_+_0.16vw,0.8125rem)]',
].join(' ');

/** The tone of an item's icon disc. Neutral is the default and says nothing. */
type InboxTone = 'attention' | 'incomplete' | 'neutral';

type InboxTab<T extends string> = {
  value: T;
  label: string;
  /** Rendered beside the label; omit or pass 0 to show nothing. */
  count?: number;
};

function NotificationInboxPopover<T extends string>({
  title,
  triggerLabel,
  triggerIcon = 'notifications',
  count = 0,
  unread,
  tabs,
  activeTab,
  onTabChange,
  tabsLabel,
  empty,
  footer,
  open,
  onOpenChange,
  align = 'end',
  className,
  children,
}: {
  title: string;
  /** The trigger's accessible name. Falls back to `title`. */
  triggerLabel?: string;
  triggerIcon?: IconName;
  /** How many things are waiting. Drawn beside the title, and on the trigger. */
  count?: number;
  /**
   * How many of those the reader has not looked at — the disc on the trigger,
   * when the two differ.
   *
   * They differ for a caller that treats opening the panel as reading it: the
   * count beside the title is about the *clinic* and stays lit while anything is
   * outstanding, and the disc on the bell is about the *reader* and goes quiet
   * once they have seen the list. Omit it and one number does both, which is
   * right for an inbox with no read state at all.
   */
  unread?: number;
  /** Omit for a single-list inbox — the filter strip disappears with it. */
  tabs?: readonly InboxTab<T>[];
  activeTab?: T;
  onTabChange?: (value: T) => void;
  /** Names the filter strip for a screen reader. Required when `tabs` is given. */
  tabsLabel?: string;
  /** Rendered instead of `children` when there is nothing to list. */
  empty?: React.ReactNode;
  footer?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: 'start' | 'center' | 'end';
  className?: string;
  /** The rows — `<li>` elements. */
  children?: React.ReactNode;
}) {
  const triggerCount = unread ?? count;
  const hasTabs = tabs !== undefined && tabs.length > 0;
  const isEmpty = empty !== undefined && React.Children.count(children) === 0;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {/*
        `neutral`, not the reference's `outline`. Both draw a bordered box;
        `outline` draws its glyph in olive, and a trigger sitting in a page
        header with no other chrome around it would then be the only
        brand-coloured mark above the fold and would read as the page's action.
        `neutral` is the design system's answer to exactly that — a box that
        reads as pressable without spending the brand colour.

        `buttonVariants` on the trigger rather than a `Button` inside it: this
        repo's Popover is Base UI, which has no `asChild`, and nesting a real
        Button would put a `<button>` inside a `<button>`.
      */}
      <PopoverTrigger
        aria-label={triggerLabel ?? title}
        className={cn(buttonVariants({ variant: 'neutral', size: 'icon-sm' }), 'relative')}
      >
        <Icon name={triggerIcon} className="size-5" />

        {/*
          The count, as a dot with a numeral rather than a full `Badge`: this is
          not a record's state, it is how many things are waiting, and it has to
          survive being drawn at 16px on the corner of a glyph. Capped at 9+ so
          the disc never grows and shifts the header row under the reader.

          `destructive`, not `primary`. Olive is the app's own colour, so an
          olive disc is another piece of furniture; clay is the only alarm in the
          scale and appears nowhere else above the fold.
        */}
        {triggerCount > 0 ? (
          <span
            aria-hidden
            className={cn(
              'absolute -top-0.5 -end-0.5 flex min-w-4 items-center justify-center rounded-full px-1',
              'bg-destructive text-[0.625rem] leading-4 font-semibold text-destructive-foreground tabular-nums',
            )}
          >
            {triggerCount > 9 ? '9+' : triggerCount}
          </span>
        ) : null}
      </PopoverTrigger>

      <PopoverContent
        align={align}
        /*
          `overflow-x-hidden overflow-y-auto`, not `overflow-hidden`, and the
          difference is load-bearing.

          Both axes still clip in the sense that matters here — the full-bleed
          rows keep the panel's rounded corners — but the block axis can now
          scroll. `PopoverContent` clamps every popup to `--available-height`,
          and tailwind-merge treats `overflow` as one group with `overflow-x` and
          `overflow-y`: a bare `overflow-hidden` here would replace the base's
          scrolling while leaving the height cap in place, which is a panel
          capped to the viewport with no way to reach its last rows or the
          footer link. Spelling both axes keeps the cap and the scroll together.

          The "bounded five-row preview" this panel is built around is untouched:
          it only exceeds `--available-height` on a screen too short to hold five
          rows, which is the case that needs the scroll.
        */
        className={cn(MEASURES, 'w-(--notif-width) gap-0 overflow-x-hidden overflow-y-auto p-0', className)}
      >
        {/*
          Header. The reference pairs the filter strip with a "mark all as read";
          with nothing to mark, that slot goes to the count instead — the fact
          the button was standing next to anyway.
        */}
        <div className="flex flex-col gap-(--notif-gap) border-b border-border p-(--notif-pad)">
          <div className="flex items-center justify-between gap-2">
            <PopoverTitle className="text-body-md font-semibold">{title}</PopoverTitle>
            {count > 0 ? <Badge variant="muted">{count}</Badge> : null}
          </div>

          {hasTabs && activeTab !== undefined && onTabChange ? (
            /*
              The strip scrolls rather than overflowing. `Segmented`'s track is
              `inline-flex` with no wrap, and at this panel's narrow end —
              17.5rem on a small phone — three labels carrying counts can outrun
              it. A popover that scrolls sideways is the one thing the layout
              rules say never to ship, so the overflow is contained here, the way
              `Tabs` already handles its own five-tab strip.
            */
            <div className="-m-0.5 flex overflow-x-auto p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Segmented
                role="tablist"
                size="sm"
                label={tabsLabel ?? title}
                value={activeTab}
                onChange={onTabChange}
                /*
                  Light grey, not the segmented control's default olive.

                  Everywhere else that control picks between *views of a page*
                  and the olive half is the one thing the screen is doing. This
                  strip sits inside a popover whose whole job is a list of
                  things to act on, and a filled brand-coloured chip at the top
                  of it outranked every row underneath — the loudest mark in the
                  panel was the filter, not the news. Grey still says which of
                  the three is on (it is the only filled one, and it holds
                  `shadow-card`), and leaves the colour to the rows.
                */
                activeClassName="bg-muted text-foreground"
                /*
                  No hover fill on the other two.

                  A hover tint is how a control says "this is pressable", and it
                  earns that where the segments are the screen's own switch. In
                  here it was a third grey rectangle appearing under the pointer
                  in a strip whose *selected* segment is now also grey — two marks
                  in the same colour, one meaning "you are here" and one meaning
                  "you are over this", a few pixels apart. The label coming up to
                  full strength says the same thing without another block of
                  colour. Focus is untouched: the ring is in the base classes.
                */
                inactiveClassName="text-muted-foreground hover:text-foreground"
                /*
                  And the strip takes the panel's whole width, three equal
                  thirds. It used to hug its labels, which left a ragged gap at
                  the inline-end of a 380px header — and, worse, moved the tabs
                  sideways as the counts beside them changed. Filling the row
                  pins each one where it was last seen.
                */
                className="w-full [&>button]:flex-1"
                options={tabs.map((tab) => ({
                  value: tab.value,
                  label: <TabLabel label={tab.label} count={tab.count ?? 0} />,
                }))}
              />
            </div>
          ) : null}
        </div>

        {isEmpty ? (
          <div className="p-(--notif-pad) py-6 text-center text-body-sm text-muted-foreground">
            {empty}
          </div>
        ) : (
          /*
            The rows run edge to edge, so the list carries no padding of its own
            — each row does, which is what lets a hover fill reach the panel's
            sides rather than floating in a gutter.

            `divide-y` rather than a `border-b` on every row: the rule lands once
            between each pair and never doubles up, so the last row cannot draw a
            line directly on top of the footer's own `border-t`.

            No scroll and no height cap: the caller passes a bounded preview —
            five rows, in the one place this is used — and the way to the rest
            is the footer's own link. It carried `max-h-80 overflow-y-auto`,
            which turned that preview into a short scrolling strip: a reader had
            to wheel through five rows to learn there was a sixth, and the link
            that actually opens the rest sat below the fold of a 20rem box.

            ⚠ A caller that passes an unbounded list will grow this panel to the
            length of it. Slice before you pass.
          */
          <ul className="flex flex-col divide-y divide-border">{children}</ul>
        )}

        {footer ? <div className="border-t border-border p-(--notif-pad)">{footer}</div> : null}
      </PopoverContent>
    </Popover>
  );
}

/**
 * One row: a glyph, a title, the sentence under it, and an optional time.
 *
 * Presentational on purpose — it draws no link and knows no route. Wrap it in
 * whatever navigates:
 *
 * ```tsx
 * <li><Link href={href}><NotificationInboxItem … /></Link></li>
 * ```
 *
 * `notificationInboxItemLinkVariants` is the class that link should carry — it
 * owns the focus treatment and the hover group the row reads from.
 */
function NotificationInboxItem({
  icon,
  tone = 'neutral',
  title,
  description,
  timestamp,
  className,
}: {
  icon: IconName;
  tone?: InboxTone;
  title: string;
  description: string;
  timestamp?: string | null;
  className?: string;
}) {
  return (
    /*
      A flush, ruled row rather than a card. A card inside the panel was a second
      surface stacked on the one already holding it, and eight of them turned a
      list you read top to bottom into eight boxes to look at one at a time. The
      rule between rows and the hover fill do the whole job, which is also what
      the reference inbox this is modelled on does.

      Hover is `bg-accent`, the ambient hover tint — not a brand tint, because a
      row here is a destination rather than an action.
    */
    <div
      className={cn(
        'flex w-full items-start gap-3 p-(--notif-pad) text-start',
        'transition-colors group-hover/inbox-item:bg-accent',
        className,
      )}
    >
      {/*
        A plain glyph, not a filled disc. With the card gone the disc would be
        the only contained shape left in the panel, and docs/design-system.md is
        explicit that a second contained shape inside a surface reads as another
        surface again. Tone survives as the glyph's own colour.
      */}
      <span
        className={cn(
          'mt-0.5 shrink-0',
          tone === 'attention' && 'text-status-attention-fg',
          tone === 'incomplete' && 'text-status-incomplete-fg',
          tone === 'neutral' && 'text-muted-foreground',
        )}
      >
        <Icon name={icon} className="size-4.5" />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-body-sm font-medium" dir="auto">
          {title}
        </span>

        {/*
          `font-size` and `line-height` as arbitrary properties rather than a
          `text-*` utility: the value is a `clamp()` on a custom property, and
          writing it this way keeps tailwind-merge from reading it as a colour
          beside `text-muted-foreground`. The leading is the scale's own
          Arabic-aware caption value, so the line breathes in both builds.
        */}
        <span
          className={cn(
            '[font-size:var(--notif-text)] [line-height:var(--lh-caption)]',
            'text-muted-foreground',
          )}
          dir="auto"
        >
          {description}
        </span>

        {timestamp ? (
          <span
            className={cn(
              '[font-size:var(--notif-text)] [line-height:var(--lh-caption)]',
              'text-muted-foreground/80',
            )}
          >
            {timestamp}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/**
 * The class the `<Link>` around a {@link NotificationInboxItem} carries.
 *
 * `group/inbox-item` is what lets the row answer a pointer that is really over
 * the link, and the focus treatment is here rather than on the row because the
 * link is what actually takes focus.
 *
 * **An inset outline, not a ring.** Now that the rows run edge to edge inside a
 * scroll container, anything painted *outside* the border box is clipped — a
 * `ring-2 ring-offset-2` would be sliced off on all four sides. An outline at a
 * negative offset paints inside the row and sits outside layout, so nothing
 * moves when it appears.
 *
 * `sidebar-ring` rather than the global lime `--ring`: this is a solo ring with
 * no olive-950 halo behind it, and lime-400 is 1.37:1 on a light surface, so the
 * line has to carry the contrast by itself — the same reasoning that put
 * olive-950 on the rail. The token already flips for dark mode.
 */
const notificationInboxItemLinkVariants = cn(
  'group/inbox-item block',
  /*
   * ⚠ No `outline-none` on the base. In Tailwind v4 that utility sets
   * `--tw-outline-style: none`, and `outline-2` only sets the outline's *width*
   * — it reads the style from that same variable. The two together produce a
   * 2px outline in the right colour at the right offset with
   * `outline-style: none`, which paints nothing at all. `outline-solid` states
   * the style outright so the pair cannot drift again.
   */
  'focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-sidebar-ring',
);

/**
 * A tab's name and how many are behind it.
 *
 * A bare numeral, not a pill — see "A badge is a state" in
 * docs/design-system.md. A count is a quantity, and three filled chips inside a
 * 40px control would be the loudest thing in the panel.
 */
function TabLabel({ label, count }: { label: string; count: number }) {
  return (
    <span className="flex items-center gap-1.5">
      {label}
      {count > 0 ? <span className="tabular-nums opacity-70">{count}</span> : null}
    </span>
  );
}

export {
  NotificationInboxPopover,
  NotificationInboxItem,
  notificationInboxItemLinkVariants,
  type InboxTab,
  type InboxTone,
};
