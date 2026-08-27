import { getTranslations } from 'next-intl/server';
import type { Metadata, Viewport } from 'next';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { DesktopScrollbars } from '@/components/layout/desktop-scrollbars';
import { AppShell } from '@/components/layout/sidebar';
import { STAFF_NAV, STAFF_NAV_ICONS } from '@/components/layout/staff-nav';
import { ZoomLock } from '@/components/layout/zoom-lock';
import { APP_THEME_COLOR_DARK, APP_THEME_COLOR_LIGHT } from '@/features/app-pwa/brand';
import { ServiceWorkerRegister } from '@/features/app-pwa/service-worker-register';
import { getClinicBrand, isClinicOnboardingComplete } from '@/features/clinic-profile/queries';
import { NewClientRailButton } from '@/features/clients/components/new-client-rail-button';
import { GuideLauncher } from '@/features/user-guide/guide-launcher';
import { GuideProvider } from '@/features/user-guide/guide-provider';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

type AppLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

/*
 * The rail's destinations and their glyphs live in
 * `components/layout/staff-nav.ts` — they are a tree now rather than a flat
 * list, and `/dev/shell` renders the same two constants so the harness cannot
 * drift from the real thing.
 *
 * Everything the flat list here used to say is said there, billing included:
 * الفواتير is a child of إدارة beside the register, and the note on `STAFF_NAV`
 * covers why that does not cost a phone the extra tap the flat list was
 * protecting.
 */

/**
 * PWA metadata for the staff app only — never the client portal, which has its
 * own set in `portal/layout.tsx`. Scoped here so `<link rel="manifest">`, the
 * apple-web-app tags and the icons appear on `/app/*` pages and nowhere else.
 *
 * `manifest` points at the per-locale Route Handler in
 * `app/manifest.webmanifest/route.ts` rather than a static file, because
 * `scope`/`start_url` have to carry the locale prefix every URL in this app
 * already has (`routing.localePrefix: 'always'`).
 *
 * **`icons` carries the home-screen icon only — deliberately no favicon.** The
 * `apple` entry is the tile iOS draws when the app is added to the home screen,
 * which the install is not really an install without; it is the `staff-`
 * variant of the generated artwork, an olive clipboard on white and the inverse
 * of the portal's white salad on olive, so a device carrying both can tell the
 * two tiles apart.
 *
 * There is no `icon` entry, and no `src/app/favicon.ico`, `icon.tsx` or
 * `apple-icon.*` anywhere in the tree either — so the browser tab keeps the
 * default placeholder. That is a decision, not an oversight: leave it out
 * rather than reinstating it here.
 */
export async function generateMetadata({ params }: Omit<AppLayoutProps, 'children'>): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'app' });

  return {
    manifest: `/${locale}/app/manifest.webmanifest`,
    icons: {
      apple: '/api/pwa-icons/staff-apple-180',
    },
    appleWebApp: {
      capable: true,
      /*
        `title` is what iOS writes under the home-screen icon. Without it Safari
        falls back to the page `<title>`, which here is a per-screen string
        ending in the app name — "Clients · Dietitian Clinic" as an icon label.
        Naming it explicitly pins it to the app, not to whichever page happened
        to be open when the client tapped "Add to Home Screen".
      */
      title: t('shortName'),
      statusBarStyle: 'default',
    },
  };
}

/**
 * The browser chrome's colour, as a light/dark pair.
 *
 * Unlike the portal — which is pinned to light appearance and therefore has one
 * theme colour — the staff app follows the system, so its status bar has to as
 * well. Next emits one `<meta name="theme-color">` per entry with the `media`
 * attribute attached, which is the only way to express "follow the device" in a
 * tag that is read before any stylesheet loads.
 *
 * Next merges a nested viewport export over its parent field by field, so the
 * app-wide fields from `[locale]/layout.tsx` — `viewportFit: 'cover'` and
 * `interactiveWidget` in particular — survive as long as nothing here restates
 * them, and nothing here may restate them.
 *
 * The three scale fields are the meta-tag half of the zoom lock, and hold the
 * dashboard at scale 1 on every mobile browser that honours them. Safari is the
 * one that does not, so `ZoomLock` below is the other half; it carries the
 * reasoning for the pair. Desktop browsers ignore the viewport meta tag
 * outright, so nothing in this export reaches one.
 */
export function generateViewport(): Viewport {
  return {
    minimumScale: 1,
    maximumScale: 1,
    userScalable: false,
    themeColor: [
      { media: '(prefers-color-scheme: light)', color: APP_THEME_COLOR_LIGHT },
      { media: '(prefers-color-scheme: dark)', color: APP_THEME_COLOR_DARK },
    ],
  };
}

export default async function AppLayout({ children, params }: AppLayoutProps) {
  const locale = await resolveLocale(params);

  // Authoritative guard for the whole dietitian area.
  const { clinicId, session } = await requireStaffClinic(locale);
  if (!(await isClinicOnboardingComplete(clinicId))) redirect(`/${locale}/onboarding`);

  // The rail draws the clinic's own mark and name rather than the product's, so
  // a dietitian sees whose practice they are working in. `updateClinicFieldAction`
  // revalidates this layout for exactly that reason.
  const [brand, t] = await Promise.all([getClinicBrand(clinicId), getTranslations('app')]);

  return (
    /*
      A fixed-height shell rather than a growing one. The window itself never
      scrolls, so the rail stays put; each page scrolls inside `main`, and a
      page that manages its own scrolling — the calendar — can claim the full
      height with `h-full` and keep its toolbar fixed.

      **The frame is `.q-app-shell` in `globals.css` now**, not an `h-svh
      overflow-hidden` this layout passed down — the portal needed the same
      thing and was building it a second way, so it is stated once for every
      shell in the product and no layout opts in. `data-slot="shell-scroll"`
      below is how `main` claims the scrolling region.

      The registry's shell is `min-h-svh`, so the box grew to whatever its
      content came to and `main`'s `overflow-y-auto` had nothing to clip — the
      *document* scrolled instead, and `main` sat there as a scroll container
      that could never scroll. Every screen that hands its overflow to an inner
      panel broke on that: a `1fr` row with no definite height to divide, an
      `overscroll-contain` list that could not scroll and, because containment
      also stops the wheel reaching anything behind it, would not let the page
      scroll either. The board and the dashboard cards were dead to the wheel;
      the rail, a scroller of its own, was the only place it worked.

      `svh` rather than `dvh`: the shell never scrolls, so a phone's address bar
      never retracts, and `dvh` would only add a resize the layout cannot use.

      The rail is a full-bleed column separated by a hairline, not an inset
      card — it is the wall the app hangs on, not a surface you act on.

      **There is no app bar.** The bar carried a title the rail already said, a
      name, and a notification bell; the rail's profile menu now carries the
      name and everything that used to hang off it, and the row the bar occupied
      goes back to the page. Each page owns its own heading, which is where the
      `h1` lives.
    */
    /*
      The guided tour wraps the shell rather than sitting inside it, and it has
      to: the tour crosses five routes, so its state cannot live in any of them,
      and the control that starts it is in the rail while the overlay it opens
      covers the page. This layout is the only component that is above both and
      stays mounted while the reader moves between sections.

      Staff only. The portal renders the same `AppShell` and is not wrapped.
    */
    <GuideProvider>
      {/*
        Renders nothing, so it carries no layout weight inside the shell. The
        `beforeinstallprompt` capture that used to sit beside it is mounted from
        the root locale layout now, and is no longer a script tag at all — see
        `InstallPromptCapture`.
      */}
      <ServiceWorkerRegister locale={locale} />

      {/*
        No `SplashScreen` here. It is mounted once from `[locale]/layout.tsx`
        now, for the whole product — a shell is entered by a client-side
        navigation as often as by a document load, so mounting the tile here
        tied it to signing in rather than to the app starting, and left a
        reloaded nested route with no tile at all. Do not add it back.
      */}
      {/*
        The staff app's opt-in to the one visible scrollbar in the product — see
        "The desktop scrollbar" in globals.css. It marks `<html>` rather than
        the shell because dialogs, sheets and popups are portalled to `<body>`,
        and the two longest scrolling surfaces in the app sit inside portalled
        ones.

        Mounted here and nowhere else: the portal renders the same `AppShell`,
        and a bar tuned to this app's cool grey furniture would be the wrong
        colour on the portal's palette. The rules themselves are gated on
        `pointer: fine` and `lg`, so this attaches the intent and the media
        query decides whether it applies.
      */}
      <DesktopScrollbars />

      {/*
        Pins the scale on phones and tablets: no pinch and no double-tap zoom
        on any page of the dashboard. Mounted here for the whole staff app; the
        portal mounts its own from `portal/layout.tsx`, and
        the routes outside both — the marketing page, sign-in, onboarding — keep
        ordinary browser zoom.

        Like `DesktopScrollbars` it marks `<html>` from an effect and releases it
        on unmount, which is what keeps the lock from following a staff user out
        of the app. The component explains why a viewport meta tag alone does not
        do this on iOS, and why nothing here reaches a desktop browser.
      */}
      <ZoomLock />

      <AppShell
        items={STAFF_NAV}
        title={t('shortName')}
        brand={brand ?? undefined}
        user={{ name: session.user.name, email: session.user.email, locale }}
        icons={STAFF_NAV_ICONS}
        /*
          The rail's one action, under the logo. It is the register's own "New
          client" trigger — the same component, the same card — so a dietitian
          can start a record from any screen in the app instead of navigating to
          the register first. See `NewClientRailButton` for what changes about
          it and what does not.
        */
        primary={<NewClientRailButton locale={locale} />}
        secondary={<GuideLauncher key="guide-launcher" />}
      >
      {/*
        `overflow-x-auto`, not the `overflow-x-hidden` this carried.

        The clip was undocumented and it was the app's last line of defence
        against a wide surface — but a clip plus `* { scrollbar-width: none }`
        (globals.css) is content with neither a bar nor a gesture to reach it.
        Anything that overflowed at a phone width was simply gone: the register
        toolbar's "New client" was clipped exactly this way.

        `auto` keeps the containment — the shell still refuses to be widened by a
        child, which is what stops *page-level* horizontal scrolling — while
        leaving wheel, trackpad, touch drag and keyboard able to reach anything
        that still overflows. It also matters that nothing appears, and nothing does:
        the global `* { scrollbar-width: none }` in globals.css takes the bars
        off every scroller in the app, this one included.

        This is a safety net, not a licence. Every real overflow is fixed at its
        source with the Rearrange → Stack → Internal-scroll ladder — `TableRoot`,
        `Tabs`, `PanelTabsList` and `.planner-week-scroll` are the precedents —
        and `overflow-x-hidden` must not come back here or go anywhere else.
      */}
        <main data-slot="shell-scroll" className="min-w-0 p-3 md:p-5">
          {children}
        </main>
      </AppShell>
    </GuideProvider>
  );
}
