'use client';

import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { Segmented } from '@/components/ui/segmented';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useIsPhone } from '@/hooks/use-mobile';
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
  mobileSheet = false,
  className,
  triggerClassName,
  badgeClassName,
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
  /**
   * On a phone, open the same panel as a sheet off the bottom edge instead of a
   * popover hanging from the bell.
   *
   * Opt-in rather than the default, because the two callers are not standing in
   * the same place. The practitioner bell sits in the inline-end corner of a
   * page header: on a phone the panel it drops is a 90vw box pinned to the top
   * corner of the screen, as far from the thumb as the layout allows, and it
   * opens with nothing dimmed behind it. Off the bottom edge it arrives where
   * the hand already is, takes the screen's whole width, and brings a scrim
   * that says the list is the only thing to read. The portal's bell is on a
   * screen that is a phone at every width and keeps the popover it was drawn
   * with.
   */
  mobileSheet?: boolean;
  className?: string;
  /**
   * Appended to the trigger's own classes, for a caller whose bell already has
   * a place in a header of its own.
   *
   * The default is a `neutral` icon button, which is right for a bar with no
   * other chrome around it. The client portal's header is the case it is wrong
   * for: its bell is a bare 44px disc that turns white over the home screen's
   * green wash, and a bordered box there would be the only outlined control on
   * the screen. Merged last, so a call site can replace the size, the radius,
   * the border and the tone without any of it being restated here.
   */
  triggerClassName?: string;
  /**
   * Appended to the count disc on the trigger, same bargain as
   * {@link triggerClassName}.
   *
   * The default is clay, because in the practitioner app olive is furniture and
   * clay is the only alarm in the scale. A caller drawing this over its own
   * coloured surface may need a different fill and a ring to separate the disc
   * from the glyph beneath it — the portal does both.
   */
  badgeClassName?: string;
  /** The rows — `<li>` elements. */
  children?: React.ReactNode;
}) {
  const triggerCount = unread ?? count;
  const hasTabs = tabs !== undefined && tabs.length > 0;
  const isEmpty = empty !== undefined && React.Children.count(children) === 0;

  /*
    Which of the two surfaces this is, decided at the same 40rem line the app's
    dialogs already turn into bottom sheets at — so the bell and the "see all"
    dialog it leads to are never one a sheet and the other a centred card.

    `useIsPhone` answers `false` on the server and on the hydrating render, so
    the markup that ships is always the popover's and the swap happens on the
    first client pass — with the panel closed either way, so nothing the reader
    is looking at moves. It is read unconditionally, before `mobileSheet` is
    consulted, because a hook behind a `&&` is a hook that stops being called.
  */
  const isPhone = useIsPhone();
  const asSheet = mobileSheet && isPhone;

  /*
    The trigger's glyph and its count, drawn once and handed to whichever
    primitive is opening the panel — Base UI's popover trigger below, its dialog
    trigger in the sheet. Both render a `<button>` carrying exactly these
    classes, so the bell itself is the same control on both sides of the
    breakpoint and the swap is invisible in the header bar.

    `neutral`, not the reference's `outline`. Both draw a bordered box;
    `outline` draws its glyph in olive, and a trigger sitting in a page header
    with no other chrome around it would then be the only brand-coloured mark
    above the fold and would read as the page's action. `neutral` is the design
    system's answer to exactly that — a box that reads as pressable without
    spending the brand colour.

    `buttonVariants` on the trigger rather than a `Button` inside it: this
    repo's Popover is Base UI, which has no `asChild`, and nesting a real Button
    would put a `<button>` inside a `<button>`.
  */
  const triggerClasses = cn(
    buttonVariants({ variant: 'neutral', size: 'icon-sm' }),
    'relative',
    triggerClassName,
  );

  const triggerContent = (
    <>
      <Icon name={triggerIcon} className="size-5" />

      {/*
        The count, as a dot with a numeral rather than a full `Badge`: this is
        not a record's state, it is how many things are waiting, and it has to
        survive being drawn at 16px on the corner of a glyph. Capped at 9+ so
        the disc never grows and shifts the header row under the reader.

        `destructive`, not `primary`. Olive is the app's own colour, so an olive
        disc is another piece of furniture; clay is the only alarm in the scale
        and appears nowhere else above the fold.
      */}
      {triggerCount > 0 ? (
        <span
          aria-hidden
          className={cn(
            'absolute -top-0.5 -end-0.5 flex min-w-4 items-center justify-center rounded-full px-1',
            'bg-destructive text-[0.625rem] leading-4 font-semibold text-destructive-foreground tabular-nums',
            badgeClassName,
          )}
        >
          {triggerCount > 9 ? '9+' : triggerCount}
        </span>
      ) : null}
    </>
  );

  /*
    Header. The reference pairs the filter strip with a "mark all as read"; with
    nothing to mark, that slot goes to the count instead — the fact the button
    was standing next to anyway.

    `Title` is a slot rather than a fixed `PopoverTitle`, because the two
    surfaces name themselves differently: a Base UI popup takes its accessible
    name from `Popover.Title` and a sheet from `Dialog.Title`, and a sheet
    labelled by the wrong one is an unnamed dialog. The heading is the same line
    either way, so only the element changes.

    `titleRowClassName` is the room the sheet's own close button needs. That
    button is painted at the popup's top inline-end corner, which is exactly
    where the count sits — so in that surface the row ends short of it and the
    badge lands beside the X rather than underneath it. 3rem, because the button
    is a 40px hit area inset 12px from the panel's edge and the header's own
    padding is already inside that — anything narrower and the two overlap.
  */
  const header = (Title: React.ElementType, titleRowClassName?: string) => (
    <div className="flex shrink-0 flex-col gap-(--notif-gap) border-b border-border p-(--notif-pad)">
      <div className={cn('flex items-center justify-between gap-2', titleRowClassName)}>
        <Title className="text-body-md font-semibold">{title}</Title>
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
  );

  const list = isEmpty ? (
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
  );

  /*
    The footer — and on the sheet, the panel's last line before the edge of the
    phone. `env(safe-area-inset-bottom)` keeps the link clear of the home
    indicator, the same guard `PortalTabBar` carries, and it is a `max()` rather
    than an addition so the padding does not double on a device with no inset to
    clear.
  */
  const footerRow = footer ? (
    <div
      className={cn(
        'shrink-0 border-t border-border p-(--notif-pad)',
        asSheet && 'pb-[max(var(--notif-pad),env(safe-area-inset-bottom))]',
      )}
    >
      {footer}
    </div>
  ) : null;

  /*
    Up from the bottom edge on a phone, rather than down from the bell.

    On a phone this panel was a 90vw box hanging off a trigger in the top
    inline-end corner — the furthest point on the screen from the thumb holding
    the device — and it opened over a page that stayed fully lit behind it. As a
    sheet it is the width of the screen, it arrives at the edge the hand is
    already near, and `Sheet`'s own backdrop dims and blurs the page so the list
    is unmistakably the thing being read. The header, the rows, the counts and
    the footer are the same nodes as the popover's; only the surface carrying
    them changes.

    The scroll moves inside with it. The popover clamps itself to
    `--available-height` and scrolls as one box, but a sheet capped at 85dvh
    with a header above the list and a footer under it has to hold both of those
    still and give the middle the overflow — otherwise "See all notifications"
    slides off the foot of a surface whose whole point is being within reach.
  */
  if (asSheet) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger aria-label={triggerLabel ?? title} className={triggerClasses}>
          {triggerContent}
        </SheetTrigger>

        {/*
          Only the two exposed corners are rounded, which is what
          docs/design-system.md asks of a surface attached to a viewport edge: a
          radius on the other two would round corners nobody can see, against a
          gap the backdrop would show through.
        */}
        <SheetContent
          side="bottom"
          className={cn(MEASURES, 'max-h-[85dvh] gap-0 overflow-hidden rounded-t-lg p-0', className)}
        >
          {header(SheetTitle, 'pe-12')}

          <div
            className={cn(
              'min-h-0 flex-1 overflow-y-auto overscroll-contain',
              !footer && 'pb-[env(safe-area-inset-bottom)]',
            )}
          >
            {list}
          </div>

          {footerRow}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger aria-label={triggerLabel ?? title} className={triggerClasses}>
        {triggerContent}
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
          footer. Spelling both axes keeps the cap and the scroll together.

          The "bounded five-row preview" this panel is built around is untouched:
          it only exceeds `--available-height` on a screen too short to hold five
          rows, which is the case that needs the scroll.
        */
        className={cn(MEASURES, 'w-(--notif-width) gap-0 overflow-x-hidden overflow-y-auto p-0', className)}
      >
        {header(PopoverTitle)}
        {list}
        {footerRow}
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
