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
} from '@/components/ui/sidebar';
import { Link, usePathname } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';

import { BrandLogo } from './brand-logo';
import { SidebarProfile } from './sidebar-profile';

/**
 * Every address the rail is allowed to point at.
 *
 * A hand-written union rather than a route type, so a destination that does not
 * exist is a compile error at the list that names it. The three `?view=` entries
 * are the calendar's day, week and month: those were three path segments once
 * and are one route with a query now (see `app/calendar/page.tsx`), so the rail
 * has to be able to spell the query.
 */
export type NavHref =
  | '/app'
  | '/app/clients'
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

/** A destination: one row, one address. */
export type NavItem = {
  href: NavHref;
  labelKey: NavLabelKey;
};

/**
 * A category: a row that opens a list rather than going anywhere.
 *
 * Categories nest — `المواعيد` holds `التقويم`, which holds day, week and month
 * — so `children` takes `NavNode` and not just `NavItem`. There is no depth
 * limit in the type because there is none in the rendering either; the
 * indentation is one compounding step (see `SidebarMenuSub`).
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

/** Where the reader is: the path, plus the calendar's view when there is one. */
type Location = { pathname: string; view: string | null };

/**
 * Whether a row points at the screen currently on display.
 *
 * Three cases, and each of them is a case because of a real route:
 *
 * 1. **The two index routes match exactly.** `/app` is a prefix of every other
 *    staff route, so a `startsWith` test would light the dashboard up on every
 *    page in the app. Same for `/portal`.
 * 2. **A calendar row with a `?view=`** is the day, week or month row, and it is
 *    active only while the calendar is showing that view. A missing `view` in
 *    the URL counts as the default, because that is what the page renders.
 * 3. **A calendar row without one** is the whole section — the icon rail's
 *    single folded row — and any of the three views lights it.
 *
 * Everything else owns its subtree: `/app/clients` stays lit on a client's own
 * record at `/app/clients/<id>`.
 */
function isItemActive(href: NavHref, { pathname, view }: Location): boolean {
  if (href === '/app' || href === '/portal') return pathname === href;

  const [path, query] = href.split('?');

  if (path === CALENDAR_PATH) {
    const inSection = pathname === CALENDAR_PATH || pathname.startsWith(`${CALENDAR_PATH}/`);
    if (!inSection) return false;
    const wanted = query ? new URLSearchParams(query).get('view') : null;
    return wanted === null || wanted === (view ?? DEFAULT_CALENDAR_VIEW);
  }

  return pathname === path || pathname.startsWith(`${path}/`);
}

/**
 * The ids of the categories the active row sits inside, outermost first — or
 * `null` when nothing in the tree is active.
 *
 * This is what decides which categories are open when a screen loads: you
 * should never arrive somewhere and have to find your own position in a
 * collapsed rail.
 */
function activeTrail(nodes: readonly NavNode[], at: Location, above: string[] = []): string[] | null {
  for (const node of nodes) {
    if (isGroup(node)) {
      const found = activeTrail(node.children, at, [...above, node.id]);
      if (found) return found;
    } else if (isItemActive(node.href, at)) {
      return above;
    }
  }

  return null;
}

/**
 * The key for the top of the rail in the accordion's state.
 *
 * Every other level is keyed by the id of the category that holds it. The root
 * has no such category, and the empty string is the one key no `NavGroup.id`
 * can collide with.
 */
const ROOT_LEVEL = '';

/**
 * The levels a trail passes through, as accordion keys — outermost first.
 *
 * A trail of `['appointments', 'calendar']` runs through two levels: the root,
 * where `appointments` is the open category, and `appointments`, where
 * `calendar` is. So the keys are the root plus every id but the last: the last
 * id names a category that is *open*, not a level that has anything open
 * inside it.
 *
 * An empty trail yields no levels at all, which is what keeps navigating to a
 * top-level destination — the dashboard — from slamming every category shut.
 */
function levelsAlong(trailKey: string): string[] {
  if (!trailKey) return [];
  const ids = trailKey.split('/');
  return [ROOT_LEVEL, ...ids.slice(0, -1)];
}

/** A row of the folded icon rail. See `NavGroup.collapsedHref`. */
type FlatItem = NavItem & { id: string };

/**
 * The tree, flattened to the destinations the 56px rail draws.
 *
 * The staff rail folds to exactly the five glyphs it had before this file grew
 * a hierarchy — dashboard, clients, calendar, weekly plans, dishes — because a
 * category is a thing you *open*, and at 56px there is nothing to open into.
 * The portal passes a flat list already and comes through here unchanged.
 *
 * ⚠ This is not a nicety. On a phone the staff rail is **locked** to its icon
 * column: no drawer, no way to expand it (see `railOnly` on `AppShell`). If the
 * folded rail drew categories, every screen but the dashboard would be
 * unreachable on a phone.
 */
function flatten(nodes: readonly NavNode[]): FlatItem[] {
  return nodes.flatMap((node) => {
    if (!isGroup(node)) return [{ ...node, id: node.href }];
    if (node.collapsedHref) {
      return [{ id: node.id, href: node.collapsedHref, labelKey: node.labelKey }];
    }
    return flatten(node.children);
  });
}

/* ────────────────────────────────────────────────────────────────────────── */

type ShellProps = {
  items: readonly NavNode[];
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
          The phone app bar is gone with the drawer it existed to open.

          It carried a hamburger and the clinic's name, and the hamburger was the
          only thing on screen that could reach navigation once the rail became a
          sheet. With the rail permanently visible there is nothing left for the
          trigger to do, and the bar would be 56px of height spent on a title
          that `PageHeader` already prints on the page below it.

          The portal never rendered it — it draws its own header and tab bar —
          which is why this had a `user` test rather than a breakpoint.
        */}
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
        <div className="flex h-12 items-center justify-between gap-2 px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          {/*
            The whole identity hides when the rail collapses, mark included.
            At 56px the head has room for exactly one control, and that has to
            be the trigger — it is the only way back out of the collapsed
            state, so nothing may compete with it for the row.
          */}
          <div className="flex min-w-0 items-center gap-2 group-data-[collapsible=icon]:hidden">
            {/*
              The staff rail leads with the product logo — the leaf and the
              wordmark as one mark — where it used to draw the clinic's own
              square mark beside the clinic's name in text.

              ⚠ **The clinic's name is no longer visible here.** It is still the
              rail's accessible name (the `sr-only` span below), and the account
              row at the foot still says whose session this is, but the head now
              identifies the *product* rather than the practice. That is the
              trade: one logo reads as a brand where a lettered square plus a
              name read as a row of two things. `brand.logoUrl` — a clinic's own
              uploaded mark — is consequently unused by this rail; the settings
              screen that captures it still works, it simply has nowhere here to
              appear.
            */}
            {brand ? (
              homeHref ? (
                /*
                  The mark is the way back to the dashboard — the one thing a
                  logo in the corner of an app is universally expected to do,
                  and the rail's own dashboard row is the only thing that did it
                  before.

                  `aria-label` rather than the name beside it: `BrandLogo` is
                  `aria-hidden` and the `sr-only` span stays *outside* the link,
                  because that span is the rail's accessible name and must not
                  become a link's label. Left unnamed, this would announce as a
                  bare link.

                  **No hover state.** The logo is the one mark on screen that
                  has to look the same wherever it appears, and dimming it under
                  the pointer made the brand flicker on the way past the head of
                  the rail. It would not be much of an affordance either: a
                  touch screen has no hover to give, so a fill only a mouse can
                  see teaches nothing to half the people using this.

                  `focus-visible` stays, and is a different thing — keyboard
                  reachability, not decoration. Without the ring the mark is a
                  tab stop that never says it has focus.

                  `-m-1`/`p-1` widen the target past the mark's own bounds
                  without growing the row.
                */
                <Link
                  href={homeHref}
                  aria-label={t('dashboard')}
                  className="-m-1 rounded-md p-1 ring-sidebar-ring outline-hidden focus-visible:ring-2"
                >
                  <BrandLogo className="h-9 shrink-0" />
                </Link>
              ) : (
                <BrandLogo className="h-9 shrink-0" />
              )
            ) : null}
            {/*
              `sr-only` rather than absent when hidden: the string is the rail's
              accessible name, and the mobile drawer needs one whether or not
              anybody is meant to read it on screen. See `showTitle`.

              Always `sr-only` once the logo is drawn — the logo carries the
              wordmark, so a heading beside it would be the name twice, once as
              a picture and once as text.
            */}
            <span
              className={cn(
                'truncate font-heading text-heading-sm font-semibold group-data-[collapsible=icon]:hidden',
                (!showTitle || brand) && 'sr-only',
              )}
            >
              {brand?.name ?? title}
            </span>
          </div>
          {/*
            The two labels the trigger names itself with, one per state. They
            travel from here for the same reason the destination rows' tooltips
            do: `ui/sidebar.tsx` is registry code with no locale of its own, and
            this component already holds the `nav` namespace.
          */}
          <SidebarTrigger
            className="shrink-0"
            expandLabel={t('expandSidebar')}
            collapseLabel={t('collapseSidebar')}
          />
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
        <SidebarGroup>
          {/*
            The guided tour's first anchor: the navigation as a whole, not a row
            of it — its opening step is about the rail as a thing, see
            `features/user-guide/steps.ts`.

            It has to be this wrapper rather than the menu inside, because
            `NavTree` renders *two* menus and hides one of them: on a phone,
            where the rail is locked to icons, the expanded tree is
            `display: none` and an anchor on it would measure to nothing. This
            div is the one box that is on screen in both shapes.
          */}
          <SidebarGroupContent data-guide="nav">
            {/*
              `useSearchParams` — which `NavTree` needs to tell day from week
              from month — suspends during a static prerender, so it gets a
              boundary of its own rather than making the whole document wait on
              it. The fallback is the same tree with no view resolved: every row
              in place, nothing under التقويم marked current.

              In practice the fallback is never seen. Every screen behind this
              rail reads the session, so it renders dynamically and the search
              params are known at render time; this is the build-time valve, not
              a loading state.
            */}
            <Suspense fallback={<NavTree items={items} icons={icons} view={null} />}>
              <RoutedNavTree items={items} icons={icons} />
            </Suspense>
          </SidebarGroupContent>
        </SidebarGroup>

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

/* ────────────────────────────────────────────────────────────────────────── */

type TreeProps = {
  items: readonly NavNode[];
  icons: Partial<Record<NavLabelKey, IconName>> | undefined;
};

/** `NavTree` with the calendar's view read off the URL. See the `Suspense` above. */
function RoutedNavTree(props: TreeProps) {
  const view = useSearchParams().get('view');
  return <NavTree {...props} view={view} />;
}

/**
 * The rail's navigation, in both of its shapes.
 *
 * **Two lists are rendered, and CSS picks between them.** The tree is what the
 * 16rem column shows; the flat list is what the 56px strip shows (and why it
 * has to exist at all is on `flatten`). Swapping them in JavaScript on
 * `useSidebar().state` would remount one list into the other in the middle of
 * the rail's own 200ms width transition, which reads as a flicker at exactly
 * the moment the eye is following the movement. Two lists and a
 * `group-data-[collapsible=icon]` toggle cost a few dozen hidden nodes and
 * nothing else.
 *
 * The mobile *drawer* — which the portal keeps and the staff app does not —
 * renders inside a `Sheet` that has no `group` ancestor, so neither variant
 * matches there and the tree is what shows. That is right: the drawer is
 * 18rem wide with labels.
 */
function NavTree({ items, icons, view }: TreeProps & { view: string | null }) {
  const pathname = usePathname();
  const at = useMemo<Location>(() => ({ pathname, view }), [pathname, view]);

  /*
   * The categories the current screen sits inside. Recomputed on every
   * navigation, and joined into a string so the reset below can compare the
   * *value* rather than a fresh array identity each render.
   */
  const trail = useMemo(() => activeTrail(items, at) ?? [], [items, at]);
  const trailKey = trail.join('/');

  /**
   * **The accordion, and the whole of it: at most one category open per level.**
   *
   * One entry per *level*, not per category — the key is the id of the parent
   * category (`ROOT_LEVEL` for the top of the rail), and the value is the id of
   * the one child of that parent that is open, or `null` for "the reader shut
   * this level". A level with no entry at all has not been touched, and falls
   * back to `trail`.
   *
   * Keying by level rather than by category is what makes the accordion a
   * property of the *shape of the state* instead of a rule enforced on the way
   * in. There is no "close the others" step to forget: opening المواعيد writes
   * `{'': 'appointments'}`, and إدارة is shut for the same reason it was shut
   * before — it is not the value at its level. A `Record<id, boolean>` would
   * have needed a sweep on every press and would have had a representable
   * illegal state (two `true`s) for a bug to live in.
   *
   * Levels are independent, so التقويم inside المواعيد accordions among its own
   * siblings — it happens to be an only child today — without knowing anything
   * about the level above it. Its entry also survives its parent closing and
   * reopening, which is deliberate: reopening المواعيد puts the reader back
   * where they left it rather than making them find their place again.
   */
  const [openAt, setOpenAt] = useState<Record<string, string | null>>({});
  const [seenTrail, setSeenTrail] = useState(trailKey);

  /*
   * Navigating *into* a category re-opens it, even if it was closed by hand.
   *
   * Without this, closing إدارة and then reaching a client record from the
   * dashboard leaves the rail claiming you are nowhere: the row that would say
   * where you are is inside a category that is shut. Only the *levels along the
   * new trail* are dropped — every one of them falls back to the trail, which
   * both opens the branch and, being one id per level, closes whatever else was
   * open on the way. A level the reader touched somewhere off the trail keeps
   * its entry, because they did not ask for it back.
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

    const levels = levelsAlong(trailKey);
    if (levels.some((key) => key in openAt)) {
      const next = { ...openAt };
      for (const key of levels) delete next[key];
      setOpenAt(next);
    }
  }

  /**
   * Which category is open at one level: the reader's own answer if they have
   * given one, otherwise the trail's.
   *
   * `depth` is the level's own depth, which is also its index in the trail —
   * `trail[0]` is the open top-level category, `trail[1]` the open one inside
   * it. A group row is always at the same depth as the level it belongs to, so
   * the two indices cannot drift.
   */
  const openIdAt = useCallback(
    (levelKey: string, depth: number) =>
      levelKey in openAt ? (openAt[levelKey] ?? null) : (trail[depth] ?? null),
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
    (levelKey: string, depth: number, id: string) => {
      setOpenAt((current) => {
        const open = levelKey in current ? (current[levelKey] ?? null) : (trail[depth] ?? null);
        return { ...current, [levelKey]: open === id ? null : id };
      });
    },
    [trail],
  );

  const flat = useMemo(() => flatten(items), [items]);

  return (
    <>
      {/* The tree. Hidden at 56px, where the flat list below stands in for it —
          see `flatten`. */}
      <SidebarMenu className="group-data-[collapsible=icon]:hidden">
        {items.map((node) => (
          <NavRow
            key={isGroup(node) ? node.id : node.href}
            node={node}
            depth={0}
            levelKey={ROOT_LEVEL}
            icons={icons}
            at={at}
            openIdAt={openIdAt}
            onToggle={toggle}
          />
        ))}
      </SidebarMenu>

      {/* The folded rail. Hidden at every width but 56px — see `flatten`. */}
      <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
        {flat.map((item) => (
          <NavLeafRow key={item.id} item={item} icons={icons} at={at} />
        ))}
      </SidebarMenu>
    </>
  );
}

type RowProps = {
  node: NavNode;
  /** 0 is a top-level row; anything deeper is drawn as a submenu row. */
  depth: number;
  /**
   * The accordion level this row is a sibling within — `ROOT_LEVEL` at the top
   * of the rail, the holding category's id anywhere below. Rows at one level
   * take turns being open; see `openAt` in `NavTree`.
   */
  levelKey: string;
  icons: Partial<Record<NavLabelKey, IconName>> | undefined;
  at: Location;
  openIdAt: (levelKey: string, depth: number) => string | null;
  onToggle: (levelKey: string, depth: number, id: string) => void;
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
  const open = openIdAt(levelKey, depth) === node.id;
  const holdsActive = activeTrail(node.children, at) !== null;

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
    brand ink and no fill. Open, the lit row below already says where you are
    and a second green thing above it would be saying it twice; shut, this is
    the only trace of your position left on the rail.
  */
  const trace = holdsActive && !open ? 'text-sidebar-accent-foreground' : undefined;

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
    onClick: () => onToggle(levelKey, depth, node.id),
  } as const;

  return top ? (
    <SidebarMenuItem>
      <SidebarMenuButton {...trigger} className={trace}>
        {icon ? <Icon name={icon} className="size-5" /> : null}
        {/* The button’s own [&>span:last-child]:truncate does not reach this one:
            the chevron is the last child on a category row, not the label. */}
        <span className="truncate">{label}</span>
        {chevron}
      </SidebarMenuButton>
      {panel}
    </SidebarMenuItem>
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
}: {
  item: FlatItem;
  icons: Partial<Record<NavLabelKey, IconName>> | undefined;
  at: Location;
}) {
  const t = useTranslations('nav');
  const icon = icons?.[item.labelKey];
  const label = t(item.labelKey);

  return (
    <SidebarMenuItem>
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

        The test is `isItemActive` rather than a string comparison because half
        these addresses carry a query: `/app/calendar?view=day` is never equal to
        the pathname, and a plain `===` quietly stopped swallowing anything the
        moment the calendar's views moved into the query string.
      */
      onClick={(event) => {
        if (isItemActive(href, at)) event.preventDefault();
      }}
      {...props}
    />
  );
}
