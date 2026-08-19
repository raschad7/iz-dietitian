import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/layout/sidebar';
import { PORTAL_NAV, PORTAL_NAV_ICONS } from '@/features/portal/nav';
import { HomeGlow } from '@/features/portal/components/home-glow';
import { PortalHeader } from '@/features/portal/components/portal-header';
import { PortalTabBar } from '@/features/portal/components/portal-tab-bar';
import { greetingKey } from '@/features/portal/greeting';
import { loadPortalNotifications } from '@/features/portal/page-data';
import { InstallAppBanner } from '@/features/portal/pwa/install-app-banner';
import { requirePortalClient } from '@/features/portal/session';
import { resolveLocale } from '@/i18n/params';
import { getLocaleDirection } from '@/i18n/routing';
import { formatDate } from '@/lib/format';

type PortalTabsLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

/**
 * The five screens a client moves between while using the app.
 *
 * Mobile first: the destinations are a bottom tab bar under `md`, and the
 * shared sidebar from `md` up. The bar is fixed, so `main` carries bottom
 * padding to keep the last card off it — dropped again at `md`, where the bar
 * is gone.
 *
 * The greeting header belongs to this group and not to the portal as a whole.
 * It says who you are and what day it is, which is the right opening for a
 * screen you arrived at to check something; the account screens in `(screen)`
 * open with their own title and a way back instead, because you got there on
 * purpose and you are going to leave again.
 */
export default async function PortalTabsLayout({ children, params }: PortalTabsLayoutProps) {
  const locale = await resolveLocale(params);

  const context = await requirePortalClient(locale);

  /*
    The bell's badge counts unread notifications, so the shell has to know what
    the feed holds — not merely how much of it is outstanding.

    This replaced a single `countPendingRequests`, and the trade is deliberate.
    That count was one cheap query, but it counted *unanswered requests* while
    the bell it badged opens a screen listing reminders, plan updates and
    answered requests too — so the mark on the bell and the list behind it were
    already two different facts, and the number would have been the wrong one.
    Worse, being a server count of something only the clinic can resolve, it
    could not be cleared by reading it: a client with one pending request saw the
    same red dot for a week.

    `loadPortalNotifications` is four small parallel reads. The heavy part — a
    fully costed plan board, read for one date field — was taken out of it on
    the way; see the note there.

    The rows, not a count, and not the ids either. "Unread" is a set difference
    rather than a subtraction, so a number was never enough — and the feed now
    opens in a popover from the header rather than on a screen of its own
    (`PortalNotificationsBell`), so the rows have to travel with it. That is why
    there is no second loader anywhere: this call is both the badge and the
    panel, and the two cannot disagree.

    `PortalHeader` holds the seen marks in `localStorage` and explains why they
    cannot live in the database.
  */
  const notifications = await loadPortalNotifications(context);

  const t = await getTranslations('portal');

  return (
    <>
      {/*
        The home screen's glow, rendered here rather than by `page.tsx`.

        It has to sit outside `(tabs)/template.tsx` — that wrapper is
        `.q-route-stage`, whose enter animation puts a `transform` on it, and a
        transformed ancestor is the containing block for anything `fixed`
        inside it. From in there the glow could only ever cover `main`'s own
        box. It decides for itself whether this is the home tab; see the note
        in `home-glow.tsx`.
      */}
      {/*
        `showTitle={false}`: the portal's name is not drawn anywhere in the
        client's own app. `PortalHeader` directly above already opens the
        screen with who they are and what day it is, and a second bar naming
        the product told them which app they had just opened. The string is
        still the rail's accessible name — see `AppShell`.

        There is no `showMobileBar` any more: `AppShell` renders the phone app
        bar only where there is a `user`, which is the staff area. This group
        already has two pieces of navigation under `md` — `PortalTabBar` along
        the block-end edge with these same five destinations, and
        `PortalHeader` above with the bell and settings — so the rail's own bar
        would be a third.

        There are no `portal-shell-*` hooks on `main` and its column any more.
        They existed to make the home tab a viewport-height frame with the meal
        list as its one scrolling region; that screen scrolls as an ordinary
        document now, and the classes were left naming a rule that no longer
        exists. What survives of that chain is one rule unpainting `AppShell`'s
        own `<main>` so the glow shows through — in `globals.css`, beside
        `.portal-home-glow`, with the ⚠ note on what was removed. It applies to
        every portal tab rather than only the home route, which is why the page
        no longer marks its own root either.
      */}
      <AppShell items={PORTAL_NAV} title={t('title')} showTitle={false} icons={PORTAL_NAV_ICONS}>
        {/*
          **Inside the shell, not beside it.** This used to be a sibling of
          `AppShell`, which put it in the portal wrapper's own flex column at
          full viewport width — and that is wrong in two ways from `md` up,
          where the rail appears:

          1. The rail is `fixed inset-y-0 start-0 w-(--sidebar-width) z-10`. It
             paints from the very top of the viewport, and an unpositioned
             header cannot win against a positioned `z-10` element — so the
             inline-start 256px of this bar was *underneath* the rail. Between
             768px and ~1180px that is the whole notification bell, and on the
             home tab the greeting, the client's name and the start of the day
             strip with it. A phone never saw it because the rail is a sheet
             below `md`.
          2. `main` sits after the rail's in-flow 256px gap, so its centred
             `max-w-3xl` column and this header's centred `max-w-3xl` column
             were measured against different boxes — 128px apart once both hit
             the cap, and up to 256px apart at tablet widths. The greeting sat
             visibly off from the cards beneath it.

          Rendered here it shares `SidebarInset` with `main`, so both columns
          are centred in the same box and the rail has nothing of ours to cover.
          Below `md` nothing moves: the rail is a sheet, the inset is the full
          width, and this is still the first thing in the column.

          It also settles a stray scrollbar on the four non-home tabs. The
          wrapper carries `min-h-svh`; with the header outside it, the page's
          minimum height was a full viewport *plus* this bar, so every one of
          those tabs scrolled a little however little it held.
        */}
        <PortalHeader
          name={context.profile.fullName}
          greeting={greetingKey(context.now.minute)}
          date={formatDate(locale, context.now.date, {
            dateStyle: undefined,
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
          notifications={notifications}
          locale={locale}
          showNav
        />

        {/*
          The frame's one scrolling region — see `[data-slot='shell-scroll']` in
          `globals.css`. `PortalHeader` above and `PortalTabBar` below are its
          siblings in the shell column, so both stay put while this scrolls.

          **`pb-24` is gone, and its absence is the point.** It existed to keep
          the last card clear of a `fixed` tab bar — a clearance that had to
          equal the bar's own height, was maintained by hand in two files, and
          had already drifted once (it ran to `lg` because the bar does, and a
          tablet's last card had been landing underneath it). The bar is in flow
          now and occupies its own height, so nothing has to be reserved for it.

          `relative` is for `HomeGlow`, which moved in here: the wash belongs to
          the top of the *page*, and with the page scrolling in this box rather
          than in the document, a glow outside it would be welded to the screen
          again — the exact thing it was moved off `position: fixed` to stop.

          The horizontal padding still steps at `md`. It is a measure, not a
          clearance, and it has to keep matching `PortalHeader`'s so the two
          columns line up.
        */}
        <main data-slot="shell-scroll" className="relative min-w-0 px-4 pt-5 pb-8 md:px-6 md:pt-6">
          {/*
            Inside the scroller now, and `absolute` against it. Outside, in the
            shell column, it would be pinned to the screen while the cards slid
            up through it — which is what it read as before it was moved off
            `position: fixed`, and what the note in `home-glow.tsx` exists to
            prevent. It is still above `.q-route-stage` for the reason recorded
            there: that wrapper is transformed during its entrance, and a
            transformed ancestor becomes the containing block for its children.
          */}
          <HomeGlow />

          <div className="mx-auto w-full max-w-3xl">
            {/*
              Inline, not fixed — it scrolls away with the page, so it never
              competes with `PortalTabBar`'s own fixed bottom edge. Mounted
              once here rather than per-tab so switching tabs does not remount
              (and therefore does not re-run) its dismissal logic.
            */}
            <InstallAppBanner dir={getLocaleDirection(locale)} />

            {children}
          </div>
        </main>

        <PortalTabBar />
      </AppShell>
    </>
  );
}
