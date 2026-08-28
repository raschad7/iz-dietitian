'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useId, useMemo, useState } from 'react';

import { cn } from '@/lib/utils';
import { Icon, type IconName } from '@/components/ui/icon';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Link, usePathname } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';

import { BrandLogo, BrandMark } from './brand-logo';
import { SidebarProfile } from './sidebar-profile';

/**
 * Every address the rail is allowed to point at.
 *
 * A hand-written union rather than a route type, so a destination that does not
 * exist is a compile error at the list that names it. The three `?view=` entries
 * are the calendar's day, week and month: those were three path segments once
 * and are one route with a query now (see `app/calendar/page.tsx`), so the rail
 * has to be able to spell the query.
 *
 * `/app/clients/bills` is a *sibling* screen that happens to live under the
 * register's path. Nothing in the tree may assume the URL shape matches the
 * nesting — see the exclusion in `isItemActive`.
 */
export type NavHref =
  | '/app'
  | '/app/clients'
  | '/app/clients/bills'
  | '/app/calendar'
  | '/app/calendar?view=day'
  | '/app/calendar?view=week'
  | '/app/calendar?view=month'
  | '/app/weekly-plans'
  | '/app/dishes'
  | '/portal'
  | '/portal/appointments'
  | '/portal/meal-plan'
  | '/portal/profile'
  | '/portal/progress';

/** A key in the `nav` message namespace. Rows and categories both take one. */
export type NavLabelKey =
  | 'dashboard'
  | 'management'
  | 'clients'
  | 'subscriber'
  | 'bills'
  | 'appointments'
  | 'calendar'
  | 'day'
  | 'week'
  | 'month'
  | 'plans'
  | 'weeklyPlans'
  | 'dishes'
  | 'portalHome'
  | 'myAppointments'
  | 'myPlan'
  | 'profile'
  | 'progress';

/**
 * A destination: one row, one address.
 *
 * ⚠ **A destination's place in the tree says nothing about its URL, and the
 * reverse.** Bills sits beside the register under إدارة and its address is
 * `/app/clients/bills`, *inside* the register's path; the calendar's three
 * views are one route with a query. Every test in this file works off the list,
 * never off the shape of the path.
 */
export type NavItem = {
  href: NavHref;
  labelKey: NavLabelKey;
};

/**
 * A category: a row that opens a list rather than going anywhere.
 *
 * ⚠ **Rare, and meant to stay rare.** A rail's shape should not change as it is
 * used. The one category left in the staff rail is التقويم, and it earns the
 * disclosure by holding three *views of one screen* rather than three screens —
 * everything that is genuinely a list of destinations is a `NavSection` with a
 * printed heading and nothing to press. Reach for a section first.
 *
 * Categories nest — `children` takes `NavNode`, not just `NavItem` — and there
 * is no depth limit in the type because there is none in the rendering either;
 * the indentation is one compounding step (see `SidebarMenuSub`).
 */
export type NavGroup = {
  /** Stable across renders — it keys the open/closed state and the panel's id. */
  id: string;
  labelKey: NavLabelKey;
  /**
   * The single destination this whole category stands for on the **icon rail**.
   *
   * Folded to 56px there is no room to indent anything, so the rail draws a flat
   * list of destinations instead of the tree (see `flatten` below). A category
   * with this set contributes one row — this address, under this category's own
   * label and glyph — and its children are not walked. A category without it is
   * transparent: its children are flattened in its place.
   *
   * `التقويم` is the one that needs it. Day, week and month are three views of
   * one screen, and three calendar glyphs stacked in a 56px strip would be
   * three marks nobody can tell apart; folded, the section is one row pointing
   * at the week.
   */
  collapsedHref?: NavHref;
  children: readonly NavNode[];
};

export type NavNode = NavItem | NavGroup;

/**
 * A band of the rail, under a printed heading.
 *
 * **A section is not a control.** It has no glyph, no chevron, no open state
 * and nothing to press: the heading names what is under it and what is under it
 * is always on screen. That is the whole difference between this and `NavGroup`,
 * and it is the reason to prefer it — a reader who has learned where الفواتير
 * sits finds it in the same place on every screen, in a column whose shape never
 * moves.
 *
 * `labelKey` is optional, and an omitted one draws no heading at all: the
 * dashboard leads the rail in a section of its own, separated by the space
 * between sections rather than by a word naming a group of one.
 *
 * Sections are the **top level and only the top level**. `NavSection` is not
 * part of `NavNode`, so nesting one is a compile error rather than a heading
 * that appears three levels deep with nothing to align to.
 */
export type NavSection = {
  /** Stable across renders — it keys this band's accordion level and its heading. */
  id: string;
  /** Omitted draws no heading. See above. */
  labelKey?: NavLabelKey;
  children: readonly NavNode[];
};

function isGroup(node: NavNode): node is NavGroup {
  return 'children' in node;
}

/* ────────────────────────────────────────────────────────────────────────── */

const CALENDAR_PATH = '/app/calendar';

/**
 * What `/app/calendar` opens on when the query says nothing. It has to agree
 * with `resolveView` in the calendar's own page — the rail lighting "week" up
 * on a URL that carries no view at all is only correct because that is the view
 * the page actually renders.
 */
const DEFAULT_CALENDAR_VIEW = 'week';

const CLIENTS_PATH = '/app/clients';
const BILLS_PATH = '/app/clients/bills';

/**
 * Where the reader is.
 *
 * **Two paths, deliberately.** `address` is what the rail is *read* against and
 * `pathname` is what is actually in the URL, and they differ on exactly one
 * screen — see `resolveAddress`. Lighting a row up and swallowing a click on
 * the row you are standing on are different questions, and they need different
 * answers there: the rail says "you came from Bills", the link still has to be
 * able to take you to the Bills list.
 */
type Location = {
  /** The address the rail is read against. Never build an href from this. */
  address: string;
  /** The real path in the URL. */
  pathname: string;
  /** The calendar's view, from `?view=`. */
  view: string | null;
};

/**
 * A client's record belongs to whichever list it was opened from.
 *
 * The record lives at `/app/clients/{id}` whether it was reached from the
 * register or from Bills, so the address alone marks المشتركون current — and a
 * dietitian who walked in from Bills is then told by the rail that they are
 * somewhere they did not go. The rail is the answer to "where am I", and on the
 * one screen with two ways in it was answering from the URL's shape rather than
 * from the reader's route through the app.
 *
 * `?from=bills` is the same parameter the record's own breadcrumb reads to
 * decide where "back" goes (see `RecordBackLink`), so the rail and the way out
 * cannot disagree about which list this record belongs to. It arrives with the
 * link and survives a reload, which is what makes it something to render from
 * rather than a guess.
 */
function resolveAddress(pathname: string, from: string | null): string {
  return from === 'bills' && pathname.startsWith(`${CLIENTS_PATH}/`) ? BILLS_PATH : pathname;
}

/**
 * Whether a row points at the screen currently on display.
 *
 * Four cases, and each of them is a case because of a real route:
 *
 * 1. **The two index routes match exactly.** `/app` is a prefix of every other
 *    staff route, so a `startsWith` test would light the dashboard up on every
 *    page in the app. Same for `/portal`.
 * 2. **A calendar row with a `?view=`** is the day, week or month row, and it is
 *    active only while the calendar is showing that view. A missing `view` in
 *    the URL counts as the default, because that is what the page renders.
 * 3. **A calendar row without one** is the whole section — the icon rail's
 *    single folded row — and any of the three views lights it.
 * 4. **المشتركون gives up the addresses الفواتير owns.** Bills lives *inside*
 *    the register's path, so the subtree rule below would light both rows at
 *    once while standing on Bills — and a rail with two current rows is a rail
 *    telling the reader nothing. The two are siblings in the tree; only the URL
 *    nests, and it does not get a say.
 *
 * Everything else owns its subtree: `/app/clients` stays lit on a client's own
 * record at `/app/clients/<id>`.
 */
function isItemActive(href: NavHref, { address, view }: Location): boolean {
  if (href === '/app' || href === '/portal') return address === href;

  const [path, query] = href.split('?');

  if (path === CALENDAR_PATH) {
    const inSection = address === CALENDAR_PATH || address.startsWith(`${CALENDAR_PATH}/`);
    if (!inSection) return false;
    const wanted = query ? new URLSearchParams(query).get('view') : null;
    return wanted === null || wanted === (view ?? DEFAULT_CALENDAR_VIEW);
  }

  if (path === CLIENTS_PATH && address.startsWith(BILLS_PATH)) return false;

  return address === path || address.startsWith(`${path}/`);
}

/**
 * Whether a row points at *precisely* the screen on display — the test for
 * whether pressing it would do anything at all.
 *
 * Not the same question as `isItemActive`, and the difference is not academic:
 * المشتركون is active on a client's record, and a press there has to take the
 * reader back to the register rather than being swallowed. So this one is an
 * exact match, and it reads the real `pathname` rather than the address —
 * pressing الفواتير while standing on a record opened *from* Bills is a real
 * navigation to the Bills list, however the rail is drawing it.
 *
 * The query counts. The calendar's rows carry one, so a pathname-only test
 * never matched them and every press of a view *while on that view* re-ran the
 * route — the one navigation that can change nothing at all. A URL with no
 * `view` at all counts as the default, because that is the view being rendered.
 */
function isItemExact(href: NavHref, { pathname, view }: Location): boolean {
  const [path, query] = href.split('?');
  if (path !== pathname) return false;
  if (!query) return true;
  return new URLSearchParams(query).get('view') === (view ?? DEFAULT_CALENDAR_VIEW);
}

/**
 * Which category is open at each accordion level, for the screen on display —
 * or `null` when nothing in this band is active.
 *
 * A **level** is a list whose members take turns being open, and it is named by
 * whatever holds it: a section's own id for its top row of children, a
 * category's id for the rows inside it. The answer is a map from level to the
 * one open category there, which is what decides the rail's shape on load: you
 * should never arrive somewhere and have to find your own position in a
 * collapsed category.
 *
 * A map rather than the outermost-first *array* this used to return. The array
 * was read by position — `trail[depth]` was the open category at depth `depth` —
 * which held only while every level was one step deeper than the last. Sections
 * broke that: a section contributes a level without contributing any depth, so
 * the index and the nesting drift apart by one and التقويم would read its
 * section's id as its own open child. Naming levels instead of counting them
 * has no such failure mode.
 */
function activeLevels(
  nodes: readonly NavNode[],
  levelKey: string,
  at: Location,
  above: Readonly<Record<string, string>> = {},
): Record<string, string> | null {
  for (const node of nodes) {
    if (isGroup(node)) {
      const found = activeLevels(node.children, node.id, at, { ...above, [levelKey]: node.id });
      if (found) return found;
    } else if (isItemActive(node.href, at)) {
      return { ...above };
    }
  }

  return null;
}

/**
 * The same question asked of the whole rail: every section walked, the answers
 * merged.
 *
 * At most one of them can answer — one screen is on display — so the merge is
 * never a conflict, and an empty object is the honest answer for a screen the
 * rail does not point at.
 */
function activeLevelsOf(sections: readonly NavSection[], at: Location): Record<string, string> {
  for (const section of sections) {
    const found = activeLevels(section.children, section.id, at);
    if (found) return found;
  }

  return {};
}

/** A row of the folded icon rail. See `NavGroup.collapsedHref`. */
type FlatItem = NavItem & { id: string };

/**
 * The destinations a branch of the rail stands for once it is folded.
 *
 * A category contributes one row if it names a `collapsedHref` and is otherwise
 * transparent — its children take its place. That is what makes the folded
 * staff rail exactly the six glyphs it has always had: dashboard, clients,
 * bills, calendar, weekly plans, dishes.
 *
 * ⚠ This is not a nicety. On a phone the staff rail is **locked** to its icon
 * column: no drawer, no way to expand it (see `railOnly` on `AppShell`). A
 * category that folded to nothing would put every screen it holds out of reach
 * on a phone entirely.
 */
function flattenNodes(nodes: readonly NavNode[]): FlatItem[] {
  return nodes.flatMap((node) => {
    if (!isGroup(node)) return [{ ...node, id: node.href }];
    if (node.collapsedHref) {
      return [{ id: node.id, href: node.collapsedHref, labelKey: node.labelKey }];
    }
    return flattenNodes(node.children);
  });
}

/**
 * The whole rail as a flat list of addresses.
 *
 * One caller: finding the section's own index for the logo's link. It walks
 * everything so that the answer does not depend on the dashboard happening to
 * be a top-level row in a section that happens to come first.
 */
function flatten(sections: readonly NavSection[]): FlatItem[] {
  return sections.flatMap((section) => flattenNodes(section.children));
}

/* ────────────────────────────────────────────────────────────────────────── */

type ShellProps = {
  items: readonly NavSection[];
  title: string;
  /**
   * Whether the title is *drawn*. It stays the rail's accessible name either
   * way — hidden, it is rendered `sr-only` rather than dropped, because a
   * drawer a screen reader announces as nothing is worse than a redundant one.
   *
   * The portal turns it off. Its own `PortalHeader` already opens every tab
   * screen with the client's name and the day, and each `(screen)` page names
   * itself; "بوابة المشتركين" sitting above that told a client, on their own
   * phone, which app they had just opened. The staff shell has no such header,
   * so it keeps the title.
   */
  showTitle?: boolean;
  /**
   * The clinic's own mark, drawn beside the title at the head of the rail.
   *
   * **This is the clinic, not the signed-in person.** The account avatar at the
   * foot of the rail is a different thing and stays a different thing: one
   * identifies whose session this is, the other whose practice it is. A clinic
   * that has uploaded no logo gets the app's own glyph, so the row never
   * collapses to a bare word.
   *
   * A `data:` URI, per `clinics.logoUrl`.
   *
   * ⚠ `logoUrl` is currently drawn nowhere: the rail head leads with the product
   * logo. It stays on the type because the value is real and the settings screen
   * still captures it — see the note above `AppSidebar`.
   */
  brand?: { logoUrl: string | null; name: string };
  user?: { name: string; email?: string | null; locale: Locale };
  icons?: Partial<Record<NavLabelKey, IconName>>;
  /**
   * The one action the rail carries, drawn directly under the logo and above
   * the destinations.
   *
   * A slot rather than a component, for the same reason `secondary` is one: the
   * staff shell puts "New client" there — the clients feature's own trigger,
   * wearing rail dimensions — and this component has no business knowing what a
   * client is. The portal passes nothing.
   *
   * Whatever is passed has to survive the rail folding to 56px. The wrapper
   * below gives it an 8px gutter and nothing else; hiding its own label at that
   * width is the slotted control's job.
   */
  primary?: React.ReactNode;
  /**
   * Classes for the shell's outer box — in practice, whether it is a fixed
   * frame or a growing page.
   *
   * The registry ships `min-h-svh`, which means the window scrolls and the
   * shell is however tall its content turned out to be. The staff app wants the
   * opposite (`h-svh overflow-hidden`): a frame the size of the viewport, with
   * the page scrolling inside `main`. That is not decoration — a screen that
   * claims `h-full` and hands its own overflow to an inner panel needs a
   * definite height to divide up, and `min-h-svh` never gives it one.
   *
   * The portal keeps the default. Its tab screens have no inner scroller to
   * hand the overflow to, so a fixed frame would clip them.
   */
  className?: string;
  /**
   * An extra block at the foot of the rail's content, below the destinations
   * and above the account row.
   *
   * A slot rather than a flag, because what goes there is not this component's
   * business: the staff layout puts `GuideLauncher` in it, and the shell has no
   * reason to know what a guided tour is — the portal renders the same rail and
   * passes nothing.
   *
   * Whatever is passed is responsible for its own spacing. `SidebarContent` is
   * a flex column, so a block that wants to sit against the footer says
   * `mt-auto` itself.
   */
  secondary?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * The application shell: the registry sidebar, and the page beside it.
 *
 * ## What this replaced
 *
 * Three hundred lines that rebuilt, by hand, what the registry component
 * already does — a 72px icon rail, a 256px expanded column, a `<dialog>` drawer
 * for phones, and a media query deciding between them. Each of those was
 * correct in isolation and none of them shared state, so the rail's width and
 * the drawer's open-ness were tracked in two places that could disagree.
 *
 * `SidebarProvider` owns that state now, persists the collapsed choice to a
 * cookie so it survives a reload, and gives the whole app `useSidebar` instead
 * of a prop drilled down from here. `collapsible="icon"` is the behaviour the
 * old rail approximated: labels drop away, icons stay, and each button grows a
 * tooltip only while collapsed.
 *
 * ## What it kept
 *
 * The props. Three layouts render this — the staff app and the portal's two —
 * and each passes its own items, title and icons, so the same shell serves a
 * dietitian and a client without either knowing about the other.
 *
 * `SidebarInset` is the page. It is a sibling of the sidebar rather than a
 * wrapper around it, which is what lets the rail stay put while only the page
 * scrolls — the property the old shell spent a fixed-height flex row on.
 */
export function AppShell({
  items,
  title,
  showTitle = true,
  brand,
  user,
  icons,
  primary,
  className,
  secondary,
  children,
}: ShellProps) {
  return (
    /*
      `railOnly` on the staff shell, and only there.

      On a **phone** the rail is locked to its 56px icon column: always on
      screen, never expandable, no drawer. It replaces a `<dialog>` drawer that
      had to be opened before any destination could be reached and covered the
      page while it was open — two taps and an occlusion to change screen, on
      the device where changing screen is most of what you do.

      From `md` up — the tablet included — the rail is the ordinary collapsible
      one, with `SidebarTrigger` in its head and the stored preference deciding
      whether it opens as icons or as the 16rem column. The lock was briefly
      `width < 64rem`, which took the tablet with it and left an iPad no way to
      read the destination labels at all.

      The portal passes nothing and keeps the drawer, because it is a phone-first
      app with a bottom tab bar carrying the same five destinations; a permanent
      rail there would be a second navigation for one set of screens.
    */
    /*
      `q-app-shell` carries the safe-area padding — see the rule in
      `globals.css`. It belongs on the outermost box of the shell rather than on
      the rail or on `main`, because the two of them sit side by side and each
      would otherwise have to know about the insets separately; padding here
      inset the pair as one, and the shell's own background still reaches every
      edge of the screen.

      Prepended to `className` rather than appended, so a caller's own class
      still wins where the two overlap — the staff layout passes `h-svh
      overflow-hidden` through here.
    */
    <SidebarProvider className={cn('q-app-shell', className)} railOnly={Boolean(user)}>
      <AppSidebar
        items={items}
        title={title}
        showTitle={showTitle}
        brand={brand}
        user={user}
        icons={icons}
        primary={primary}
        secondary={secondary}
      />
      <SidebarInset>
        {/*
          The trigger stands on the page, not in the rail.

          Folded, the rail is 56px wide and has room for exactly one thing at
          its head. It used to be the trigger, so the logo was hidden the moment
          the rail closed — the app lost its mark at the one width where a
          reader has the least else to orient by. Out here, the mark keeps the
          head in both states and the control keeps working in both, because
          nothing has to share the strip.

          It is also where the control belongs: it acts on the boundary between
          the rail and the page, and standing on the page it does not travel
          16rem sideways every time it is pressed.

          **Staff only**, the same test the phone app bar carried before it:
          the portal draws its own header at the top of every screen, and a
          second strip above that would push each one down by 44px to hold a
          control the portal's own drawer already has. It keeps the trigger in
          the rail head — see `AppSidebar`.
        */}
        {user ? <ShellTrigger /> : null}
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}


/*
 * `BrandMark` — the clinic's own uploaded logo, drawn as a 28px rounded square
 * at the head of the rail — used to live here. The head now leads with the
 * product logo instead (see `BrandLogo` in the header below), so the component
 * had no caller and is gone rather than left to rot.
 *
 * `brand.logoUrl` still travels down from the staff layout and the settings
 * screen that captures it still works; nothing in the rail reads it any more.
 * Restoring a clinic mark means deciding where it goes now that the head is
 * taken — the account row at the foot is the obvious candidate.
 */

function AppSidebar({
  items,
  title,
  showTitle = true,
  brand,
  user,
  icons,
  primary,
  secondary,
}: Omit<ShellProps, 'children'>) {
  const t = useTranslations('nav');


  /*
   * Where the logo at the head of the rail goes: the section's own index — the
   * dashboard for staff, the portal home for a client. Derived from the items
   * rather than written as `/app`, because this shell is the portal's too and a
   * hard-coded staff route in shared chrome is a bug waiting for the day the
   * portal grows a mark of its own.
   *
   * Read off the *flattened* tree so it still finds `/app` now that the staff
   * list is a hierarchy — the dashboard happens to be a top-level row, but
   * nothing about this should depend on that staying true.
   */
  const homeHref = flatten(items).find((item) => item.href === '/app' || item.href === '/portal')?.href;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-0 pb-1">
        <div className="flex h-12 items-center gap-2 px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          {/*
            The mark stays at every width, and that is the change.

            The whole identity used to hide when the rail folded, because the
            trigger needed the row and a 56px strip fits one control. The
            trigger stands on the page now (see `ShellTrigger`), so the head is
            the mark's alone: the full lockup while there is a column to print a
            wordmark in, the leaf alone at 56px, in the same place both times.
            An app that drops its own mark the moment its navigation narrows is
            an app the reader has to re-identify every time they reclaim some
            width.
          */}
          {brand ? (
            homeHref ? (
              /*
                The mark is the way back to the dashboard — the one thing a
                logo in the corner of an app is universally expected to do, and
                the rail's own dashboard row is the only thing that did it
                before.

                `aria-label` rather than the name beside it: both marks are
                `aria-hidden` and the `sr-only` span stays *outside* the link,
                because that span is the rail's accessible name and must not
                become a link's label. Left unnamed, this would announce as a
                bare link.

                **No hover state.** The logo is the one mark on screen that has
                to look the same wherever it appears, and dimming it under the
                pointer made the brand flicker on the way past the head of the
                rail. It would not be much of an affordance either: a touch
                screen has no hover to give, so a fill only a mouse can see
                teaches nothing to half the people using this.

                `focus-visible` stays, and is a different thing — keyboard
                reachability, not decoration. Without the ring the mark is a tab
                stop that never says it has focus.

                `-m-1`/`p-1` widen the target past the mark's own bounds without
                growing the row.
              */
              <Link
                href={homeHref}
                aria-label={t('dashboard')}
                className="-m-1 rounded-md p-1 ring-sidebar-ring outline-hidden focus-visible:ring-2"
              >
                <RailMark />
              </Link>
            ) : (
              <RailMark />
            )
          ) : null}
          {/*
            `sr-only` rather than absent when hidden: the string is the rail's
            accessible name, and the mobile drawer needs one whether or not
            anybody is meant to read it on screen. See `showTitle`.

            Always `sr-only` once the logo is drawn — the logo carries the
            wordmark, so a heading beside it would be the name twice, once as a
            picture and once as text.
          */}
          <span
            className={cn(
              'truncate font-heading text-heading-sm font-semibold group-data-[collapsible=icon]:hidden',
              (!showTitle || brand) && 'sr-only',
            )}
          >
            {brand?.name ?? title}
          </span>
          {/*
            The portal keeps its trigger here. It renders no `user`, so
            `AppShell` draws no `ShellTrigger` on the page for it, and the rail
            would otherwise have nothing to close it with on a desktop. The
            staff shell passes the labels through to `ShellTrigger` instead and
            this renders nothing.

            The two labels the trigger names itself with, one per state, travel
            from here for the same reason the destination rows' tooltips do:
            `ui/sidebar.tsx` is registry code with no locale of its own, and
            this component already holds the `nav` namespace.
          */}
          {user ? null : (
            <SidebarTrigger
              className="ms-auto shrink-0"
              expandLabel={t('expandSidebar')}
              collapseLabel={t('collapseSidebar')}
            />
          )}
        </div>

        {/*
          The rail's one action, between the logo and the destinations — see
          `primary` on `ShellProps`.

          It sits in the header rather than at the top of the menu on purpose.
          Everything below is somewhere you *go*; this is something you *do*, and
          putting it in the same column as the destinations made it read as a
          sixth place to visit.

          No horizontal padding of its own. `SidebarHeader` is `p-2` and
          `SidebarGroup` — which holds the destinations — is `p-2` as well, so
          the button already stands in the same 8px gutter as every row below
          it, and its own `px-3` puts its glyph in the same column as theirs.
          Adding `px-2` here indented it by 8px against the whole rail.
        */}
        {primary ? <div className="pt-1">{primary}</div> : null}
      </SidebarHeader>

      <SidebarContent>
        {/*
          The guided tour's first anchor: the navigation as a whole, not a row
          of it — its opening step is about the rail as a thing, see
          `features/user-guide/steps.ts`.

          It has to be this wrapper rather than a menu inside, because `NavTree`
          renders *two* lists and hides one of them: on a phone, where the rail
          is locked to icons, the sections are `display: none` and an anchor on
          them would measure to nothing. This div is the one box that is on
          screen in both shapes.

          A plain div rather than the `SidebarGroup` this used to be. The groups
          moved inside `NavTree`, which now draws one per section, and a group
          around them would have added a second 8px gutter to every row.
        */}
        <div data-guide="nav">
          {/*
            `useSearchParams` — which `NavTree` needs to tell day from week from
            month — suspends during a static prerender, so it gets a boundary of
            its own rather than making the whole document wait on it. The
            fallback is the same rail with no view resolved: every row in place,
            nothing under التقويم marked current.

            In practice the fallback is never seen. Every screen behind this
            rail reads the session, so it renders dynamically and the search
            params are known at render time; this is the build-time valve, not a
            loading state.

            It is also what makes `useSearchParams` usable here at all. This
            shell renders for every screen in both apps, so reading the query
            *unboundaried* would put a `Suspense` requirement on all of them;
            the boundary is local, and the two things the rail reads from the
            query — the calendar's view and a record's `?from` — cost nothing
            outside it.
          */}
          <Suspense fallback={<NavTree items={items} icons={icons} view={null} from={null} />}>
            <RoutedNavTree items={items} icons={icons} />
          </Suspense>
        </div>

        {/* See `secondary` on `ShellProps`. The staff shell puts the user
            guide here; the portal passes nothing and this renders nothing. */}
        {secondary ? (
          /*
            A real wrapper is intentional here. A Fragment is flattened into
            `SidebarContent`'s child list, which leaves a slotted element owned
            by the calling layout in that list and makes React ask that caller
            for a key. `display: contents` keeps the launcher's `mt-auto`
            behaviour while giving the named slot a stable local child.
          */
          <div data-slot="sidebar-secondary" className="contents">
            {secondary}
          </div>
        ) : null}
      </SidebarContent>

      {/*
        The portal renders this shell without a session user — its identity
        lives in `PortalHeader` — so the footer is omitted rather than rendered
        empty, which would leave a border with nothing above it.
      */}
      {user ? (
        <SidebarFooter className="border-t border-sidebar-border">
          <SidebarProfile name={user.name} email={user.email} locale={user.locale} />
        </SidebarFooter>
      ) : null}
    </Sidebar>
  );
}

/**
 * The rail's mark, in whichever of its two shapes fits the current width.
 *
 * Both are rendered and CSS picks, for the same reason `NavTree` renders both
 * of its lists: the rail's width animates over 200ms, and swapping one SVG for
 * another on `useSidebar().state` would remount the mark in the middle of that
 * movement — a blink at exactly the moment the eye is following it.
 *
 * The full lockup is the leaf plus the wordmark at 2.6:1, which needs about
 * 90px to be legible and has 40px in the folded strip. So the folded rail draws
 * `BrandMark` — the leaf alone, square — rather than a squeezed lockup or, as
 * before, nothing at all.
 */
function RailMark() {
  return (
    <>
      <BrandLogo className="h-9 shrink-0 group-data-[collapsible=icon]:hidden" />
      <BrandMark className="hidden size-7 shrink-0 group-data-[collapsible=icon]:block" />
    </>
  );
}

/**
 * The rail's toggle, standing on the page rather than in the rail.
 *
 * A component of its own because the decision it needs — is there anything to
 * toggle at this width — is `useSidebar()`, and `AppShell` is the thing that
 * *creates* that context and so cannot read it.
 *
 * ## It costs no row
 *
 * It had one for a release — a 44px strip above the page — and 44px of every
 * screen in the app spent on a single 32px control is not a trade worth making
 * twice. It is out of the flow now, in the page's top inline-start corner, and
 * the page's own first row is inset far enough to sit beside it rather than
 * under it. That inset is one rule in `globals.css` keyed on
 * `[data-slot='shell-scroll']`, so it reaches every staff screen — including
 * the several that draw their own first line instead of `PageHeader` — without
 * any of them knowing this control exists.
 *
 * The trigger is a sibling of `main` rather than a child, so it does not
 * scroll: the way to reach the navigation stays on screen wherever the reader
 * has got to on a long page. It carries the page's own background for the same
 * reason, because content does travel underneath it.
 *
 * It renders nothing on a phone. `SidebarTrigger` takes itself out of the page
 * when the rail is locked — a control that cannot do anything is worse than no
 * control — and the inset above is withheld in the same breath, keyed on the
 * `data-locked` the provider puts on the shell.
 */
function ShellTrigger() {
  const t = useTranslations('nav');
  const { locked } = useSidebar();

  if (locked) return null;

  return (
    <div className="absolute top-3 z-20 flex bg-background start-3 md:top-5 md:start-5">
      <SidebarTrigger
        standing
        expandLabel={t('expandSidebar')}
        collapseLabel={t('collapseSidebar')}
      />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

type TreeProps = {
  items: readonly NavSection[];
  icons: Partial<Record<NavLabelKey, IconName>> | undefined;
};

/**
 * `NavTree` with the two things it needs from the query string.
 *
 * `view` tells day from week from month; `from` is how a client's record says
 * which list it was opened from (see `resolveAddress`). Both are read in one
 * place, inside the `Suspense` above, so the rest of the tree stays a function
 * of its props.
 */
function RoutedNavTree(props: TreeProps) {
  const search = useSearchParams();
  return <NavTree {...props} view={search.get('view')} from={search.get('from')} />;
}

/**
 * The rail's navigation — **one list, in both shapes of the rail.**
 *
 * ## Why one
 *
 * This used to render the whole tree twice and let CSS pick: the sections for
 * the 16rem column, a flattened copy for the 56px strip. Two lists cannot
 * *animate* into each other. `display` does not interpolate, and the swap fires
 * on `data-collapsible` the instant the state flips — so for the whole 200ms
 * the rail spent narrowing, the glyphs had already teleported to the positions
 * they would hold at the end. Every row that sat at a different height in the
 * two lists — which, once sections added headings, was every row below the
 * first — jumped. The width slid and the contents did not follow it.
 *
 * One list has nothing to swap, so every part of the fold is a transition on a
 * property that interpolates, and they all run on the same 200ms:
 *
 * - the **rail's width**, from `Sidebar`;
 * - each **row's width and padding**, from `sidebarMenuButtonVariants` — the
 *   button is `overflow-hidden`, so its label is clipped away rather than
 *   removed, and the glyph stays put in the gutter it already occupied;
 * - each **section heading**, from `SidebarGroupLabel` — `-mt-8` and `opacity-0`
 *   on the same duration, so the heading fades as it slides up and the rows
 *   under it glide into the space it vacates instead of snapping up into it.
 *
 * ## The one thing that still has two forms
 *
 * A category. It is a disclosure at 16rem and there is nothing to disclose into
 * at 56px, so its row is a *destination* while folded — see `collapsedHref`.
 * Both forms are rendered and CSS picks, which is the trick this file used to
 * apply to the entire tree and now applies to a single row: the two draw the
 * same glyph in the same place, so nothing about the swap is visible, and it
 * costs one hidden `<li>` rather than a hidden copy of the rail.
 *
 * The mobile *drawer* — which the portal keeps and the staff app does not —
 * renders inside a `Sheet` that has no `group` ancestor, so the folded variants
 * never match there and the rail draws its full 18rem self with labels.
 */
function NavTree({
  items,
  icons,
  view,
  from,
}: TreeProps & { view: string | null; from: string | null }) {
  const pathname = usePathname();
  const at = useMemo<Location>(
    () => ({ address: resolveAddress(pathname, from), pathname, view }),
    [pathname, from, view],
  );

  /*
   * The categories the current screen sits inside, one per accordion level.
   * Recomputed on every navigation, and serialised so the reset below can
   * compare the *value* rather than a fresh object identity each render.
   */
  const trail = useMemo(() => activeLevelsOf(items, at), [items, at]);
  const trailKey = useMemo(
    () =>
      Object.entries(trail)
        .map(([level, id]) => `${level}:${id}`)
        .join('/'),
    [trail],
  );

  /**
   * **The accordion, and the whole of it: at most one category open per level.**
   *
   * One entry per *level*, not per category — the key is the id of whatever
   * holds the level (a section's id at the top of a band, a category's id
   * inside one), and the value is the id of the one child of that holder which
   * is open, or `null` for "the reader shut this level". A level with no entry
   * at all has not been touched, and falls back to `trail`.
   *
   * Keying by level rather than by category is what makes the accordion a
   * property of the *shape of the state* instead of a rule enforced on the way
   * in. There is no "close the others" step to forget: opening a category
   * writes it as the value at its level, and a sibling is shut for the same
   * reason it was shut before — it is not the value there. A
   * `Record<id, boolean>` would have needed a sweep on every press and would
   * have had a representable illegal state (two `true`s) for a bug to live in.
   *
   * Levels are independent, so a category accordions among its own siblings
   * without knowing anything about the band above it.
   *
   * ⚠ Only التقويم uses any of this today — sections are headings and do not
   * open. It is kept because the machinery is what makes a *second* category
   * safe to add, not because one category needs it.
   */
  const [openAt, setOpenAt] = useState<Record<string, string | null>>({});
  const [seenTrail, setSeenTrail] = useState(trailKey);

  /*
   * Navigating *into* a category re-opens it, even if it was closed by hand.
   *
   * Without this, closing التقويم and then reaching the month view from
   * somewhere else leaves the rail claiming you are nowhere: the row that would
   * say where you are is inside a category that is shut. Only the *levels the
   * new position runs through* are dropped — each of them falls back to the
   * trail, which both opens the branch and, being one id per level, closes
   * whatever else was open on the way. A level the reader touched off the trail
   * keeps its entry, because they did not ask for it back.
   *
   * Adjusted **during render** rather than in an effect. This is state derived
   * from where the reader is, not a system outside React to synchronise with:
   * done in an effect it would paint the rail once with the stale branch shut
   * and again with it open, which is a flash of "you are nowhere" on every
   * navigation. React re-runs this component immediately on the set below,
   * before anything reaches the screen. See
   * https://react.dev/learn/you-might-not-need-an-effect.
   */
  if (seenTrail !== trailKey) {
    setSeenTrail(trailKey);

    const levels = Object.keys(trail);
    if (levels.some((key) => key in openAt)) {
      const next = { ...openAt };
      for (const key of levels) delete next[key];
      setOpenAt(next);
    }
  }

  /**
   * Which category is open at one level: the reader's own answer if they have
   * given one, otherwise the trail's.
   */
  const openIdAt = useCallback(
    (levelKey: string) =>
      levelKey in openAt ? (openAt[levelKey] ?? null) : (trail[levelKey] ?? null),
    [openAt, trail],
  );

  /*
   * A press sets its level to this category, or to `null` if it was already the
   * open one. Nothing else is touched, and nothing else has to be: the sibling
   * that was open stops being the value at this level in the same set, so it
   * closes on the same render the new one opens on.
   *
   * That is what keeps the two animations synchronised. Both panels are
   * `.q-nav-collapse` tracks on the same duration and the same curve, and they
   * start in the same frame, so the outgoing category collapses at exactly the
   * rate the incoming one grows. A close-then-open sequenced in JavaScript
   * would have made the rail jump twice.
   */
  const toggle = useCallback(
    (levelKey: string, id: string) => {
      setOpenAt((current) => {
        const open = levelKey in current ? (current[levelKey] ?? null) : (trail[levelKey] ?? null);
        return { ...current, [levelKey]: open === id ? null : id };
      });
    },
    [trail],
  );

  return (
    <>
      {/*
        Each band is its own `SidebarGroup`, which is what puts space between
        one heading's territory and the next — and keeps putting it once the
        headings have folded away, so the icon strip is grouped too rather than
        being one undifferentiated column of six.

        The first band carries no heading, so its group is pulled flush with the
        header above it: otherwise the dashboard sits a line lower than the logo
        leads you to expect, and the gap reads as a missing row rather than as
        the top of the column.
      */}
      {items.map((section, index) => (
        <SidebarGroup key={section.id} className={cn('py-1', index === 0 && 'pt-0')}>
          {section.labelKey ? <NavSectionLabel labelKey={section.labelKey} /> : null}
          <SidebarGroupContent>
            <SidebarMenu>
              {section.children.map((node) => (
                <NavRow
                  key={isGroup(node) ? node.id : node.href}
                  node={node}
                  depth={0}
                  levelKey={section.id}
                  icons={icons}
                  at={at}
                  openIdAt={openIdAt}
                  onToggle={toggle}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}

/**
 * A section's printed heading.
 *
 * Its own component only because it needs `useTranslations`, which `NavTree`
 * would otherwise be holding for the one string it does not render itself.
 *
 * **Not `uppercase`, and not `tracking-wider`** — the two things every
 * sidebar-design guide reaches for on a category heading. Arabic has no
 * uppercase, so the first is a rule that silently applies to half the product;
 * the second is worse than inert there, because letter-spacing breaks the
 * cursive joins that make an Arabic word legible at all. The heading is set
 * apart by size, weight and `--sidebar-label` instead, which work identically
 * in both scripts.
 */
function NavSectionLabel({ labelKey }: { labelKey: NavLabelKey }) {
  const t = useTranslations('nav');
  return <SidebarGroupLabel>{t(labelKey)}</SidebarGroupLabel>;
}

type RowProps = {
  node: NavNode;
  /** 0 is a top-level row; anything deeper is drawn as a submenu row. */
  depth: number;
  /**
   * The accordion level this row is a sibling within — its section's id at the
   * top of a band, the holding category's id anywhere below. Rows at one level
   * take turns being open; see `openAt` in `NavTree`.
   */
  levelKey: string;
  icons: Partial<Record<NavLabelKey, IconName>> | undefined;
  at: Location;
  openIdAt: (levelKey: string) => string | null;
  onToggle: (levelKey: string, id: string) => void;
};

/** One row of the tree — a destination or a category — and whatever hangs off it. */
function NavRow({ node, depth, levelKey, icons, at, openIdAt, onToggle }: RowProps) {
  const t = useTranslations('nav');
  const panelId = useId();

  const icon = icons?.[node.labelKey];
  const label = t(node.labelKey);
  const top = depth === 0;

  if (!isGroup(node)) {
    return top ? (
      <NavLeafRow item={{ ...node, id: node.href }} icons={icons} at={at} />
    ) : (
      <SidebarMenuSubItem>
        <SidebarMenuSubButton
          isActive={isItemActive(node.href, at)}
          render={<NavLink href={node.href} at={at} />}
        >
          {icon ? <Icon name={icon} className="size-4" /> : null}
          <span>{label}</span>
        </SidebarMenuSubButton>
      </SidebarMenuSubItem>
    );
  }

  /*
    Open if this category is the one its level is currently showing. That test
    *is* the accordion: a sibling opening makes this expression false here on
    the very same render, with no message passed between the two rows.
  */
  const open = openIdAt(levelKey) === node.id;
  const holdsActive = activeLevels(node.children, node.id, at) !== null;

  /*
    The disclosure itself. `data-open` is the whole switch — `.q-nav-collapse`
    in globals.css owns the animation, and this component owns nothing about
    time. See that rule for why it is a grid track and not a height.

    `inert` on the panel while it is shut is what keeps three collapsed
    categories' worth of links out of the tab order. `overflow: hidden` alone
    hides them from the eye and from nothing else: tabbing into a zero-height
    row scrolls the clip and strands the focus ring somewhere invisible.
  */
  const panel = (
    <div className="q-nav-collapse" data-open={open ? '' : undefined}>
      <div>
        <SidebarMenuSub id={panelId} inert={!open}>
          {/* This category *is* the level its children accordion within, so it
              hands them its own id as their `levelKey`. */}
          {node.children.map((child) => (
            <NavRow
              key={isGroup(child) ? child.id : child.href}
              node={child}
              depth={depth + 1}
              levelKey={node.id}
              icons={icons}
              at={at}
              openIdAt={openIdAt}
              onToggle={onToggle}
            />
          ))}
        </SidebarMenuSub>
      </div>
    </div>
  );

  /*
    A category that is *shut* while the current screen is inside it takes the
    current row's ink and weight, and no fill. Open, the lit row below already
    says where you are and a second mark above it would be saying it twice;
    shut, this is the only trace of your position left on the rail.

    Ink and weight but no fill, which is what keeps the two distinguishable: the
    row you are *on* is filled, the category that *holds* it is only coloured.
  */
  const trace = holdsActive && !open ? 'font-medium text-sidebar-accent-foreground' : undefined;

  const chevron = (
    <Icon
      name="chevronDown"
      /*
        One glyph, rotated, rather than a pair swapped on state — a swap has
        nothing to animate between, and this is the movement the whole
        disclosure is timed against.

        Shut, it points along the reading direction: `-rotate-90` turns the "v"
        into a ">" for English, and the `rtl:` variant turns it into a "<" for
        Arabic. Open, it is upright in both. The rotation shares
        `--duration-arc` with the panel below it, so the arrow and the reveal
        are the same gesture rather than two that happen to overlap.
      */
      className={cn(
        'ms-auto size-4 transition-transform duration-(--duration-arc) ease-(--ease-sweep)',
        open ? 'rotate-0' : '-rotate-90 rtl:rotate-90',
      )}
    />
  );

  const trigger = {
    'aria-expanded': open,
    'aria-controls': panelId,
    onClick: () => onToggle(levelKey, node.id),
  } as const;

  return top ? (
    <>
      <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
        <SidebarMenuButton {...trigger} className={trace}>
          {icon ? <Icon name={icon} className="size-5" /> : null}
          {/* The button’s own [&>span:last-child]:truncate does not reach this one:
              the chevron is the last child on a category row, not the label. */}
          <span className="truncate">{label}</span>
          {chevron}
        </SidebarMenuButton>
        {panel}
      </SidebarMenuItem>
      {/*
        The same row, folded: a destination rather than a disclosure.

        At 56px there is nothing to open into, so the category stands for one
        address — its `collapsedHref`, or, for a category that names none, its
        children flattened in its place. See `flattenNodes`.

        Rendered alongside rather than swapped in on `useSidebar().state`: both
        forms draw the same glyph at the same x, so CSS picking between them is
        invisible, while a JavaScript swap would remount the row in the middle
        of the fold — the one moment the eye is following it.
      */}
      {flattenNodes([node]).map((item) => (
        <NavLeafRow
          key={item.id}
          item={item}
          icons={icons}
          at={at}
          className="hidden group-data-[collapsible=icon]:block"
        />
      ))}
    </>
  ) : (
    <SidebarMenuSubItem>
      {/* `render` overrides the sub-button's default `<a>`: this one opens a
          list rather than going anywhere, and an anchor with no href is not a
          control. */}
      <SidebarMenuSubButton {...trigger} className={trace} render={<button type="button" />}>
        {icon ? <Icon name={icon} className="size-4" /> : null}
        <span className="truncate">{label}</span>
        {chevron}
      </SidebarMenuSubButton>
      {panel}
    </SidebarMenuSubItem>
  );
}

/**
 * A top-level destination row, in either shape of the rail.
 *
 * Shared by the tree and the flat list so that a destination looks and behaves
 * identically whichever of the two is on screen — including the tooltip, which
 * the registry only shows while the rail is folded.
 */
function NavLeafRow({
  item,
  icons,
  at,
  className,
}: {
  item: FlatItem;
  icons: Partial<Record<NavLabelKey, IconName>> | undefined;
  at: Location;
  /** For the two forms of a category row — see `NavRow`. Destinations pass none. */
  className?: string;
}) {
  const t = useTranslations('nav');
  const icon = icons?.[item.labelKey];
  const label = t(item.labelKey);

  return (
    <SidebarMenuItem className={className}>
      {/*
        `tooltip` only shows while the sidebar is collapsed — the registry hides
        it otherwise — so the label is never announced twice to a pointer that
        can already read it.
      */}
      <SidebarMenuButton
        tooltip={label}
        isActive={isItemActive(item.href, at)}
        render={<NavLink href={item.href} at={at} />}
      >
        {/*
          20px, explicitly. `Icon` ships `size-4` in its own class list, so the
          button's `[&_svg:not([class*='size-'])]` default never reaches it —
          the glyph has to ask. This is the rail's one job at 56px wide, and
          16px of it was too little to aim at or to tell apart at a glance.

          The glyph does not change while the row is loading. It was swapped for
          a spinner via `useLinkStatus` for one release: the rail is a handful of
          fixed marks a reader navigates by shape, and replacing one of them
          mid-navigation took away the landmark at the moment it was being used.
          The progress bar reports the wait instead — see
          `navigation-progress.tsx`.
        */}
        {icon ? <Icon name={icon} className="size-5" /> : null}
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * The anchor every destination in the rail is rendered through.
 *
 * One component rather than the same four props written at three call sites —
 * the prefetch policy and the "already here" guard are decisions about the rail
 * as a whole, and they were drifting apart the moment there was more than one
 * kind of row.
 */
function NavLink({ href, at, ...props }: { href: NavHref; at: Location } & React.ComponentProps<'a'>) {
  return (
    <Link
      href={href}
      /*
        The row's state, said in a way that is not a colour.

        `isItemActive`, so it marks the same row the fill marks — including a
        client's record, where المشتركون stays current. That is the honest
        answer to "where am I": `page` is the standard's own word for the
        current *location*, and a record reached from the register is a place
        inside it.

        Without this the selected row was a fill and a font weight and nothing
        else, which is exactly the state a screen reader cannot see. The comment
        on `sidebarMenuButtonVariants` has claimed this attribute was here since
        the rail was rewritten; it was not.
      */
      aria-current={isItemActive(href, at) ? 'page' : undefined}
      /*
        Prefetch the shell on sight, the whole page on hover.

        Every screen behind this rail is dynamic — they all read the session —
        and Next will only fetch a dynamic route ahead as far as its
        `loading.tsx`. So the default gets the skeleton ready and leaves the data
        to the click, which is most of what is left of the wait now that the
        navigation itself is instant. This asks for the rest the moment the
        pointer lands on the row, which on a desktop is a beat or two before the
        click: the page is usually already in the router cache by the time it
        happens, and the skeleton never appears at all.

        **Scoped to this list on purpose.** Hovering renders a whole route on
        the server, so this belongs on a fixed set of deliberate destinations and
        nowhere near a table of a hundred client rows. It costs nothing on a
        phone, where there is no hover.
      */
      unstable_dynamicOnHover
      /*
        Clicking the row you are already standing on used to push the same URL
        again, which re-runs the page for no change on screen. The click is
        swallowed instead.

        `isItemExact`, **not** `isItemActive`. A row is active over its whole
        subtree — المشتركون stays lit on a client's record — and swallowing the
        press there would strand the reader on the record with the one control
        that goes back to the register doing nothing. Only an exact match is a
        press that would change nothing. See `isItemExact` for the query.
      */
      onClick={(event) => {
        if (isItemExact(href, at)) event.preventDefault();
      }}
      {...props}
    />
  );
}
