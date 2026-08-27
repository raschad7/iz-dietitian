import { getTranslations } from 'next-intl/server';
import type { Metadata, Viewport } from 'next';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { DesktopScrollbars } from '@/components/layout/desktop-scrollbars';
import { AppShell, type NavItem } from '@/components/layout/sidebar';
import { AppShell } from '@/components/layout/sidebar';
import { ZoomLock } from '@/components/layout/zoom-lock';
import { type IconName } from '@/components/ui/icon';
import { APP_THEME_COLOR_DARK, APP_THEME_COLOR_LIGHT } from '@/features/app-pwa/brand';
import { ServiceWorkerRegister } from '@/features/app-pwa/service-worker-register';
import { getClinicBrand, isClinicOnboardingComplete } from '@/features/clinic-profile/queries';
import { GuideLauncher } from '@/features/user-guide/guide-launcher';
import { GuideProvider } from '@/features/user-guide/guide-provider';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

type AppLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

/**
 * The six places a dietitian works.
 *
 * Profile, WhatsApp and security used to sit here too, which made a third of
 * the rail settings. They are behind the profile menu at its foot now — see
 * `SidebarProfile` — so this list is only the screens a working day is spent
 * on, and none of them are duplicated there.
 *
 * **Requests is deliberately not a destination.** The inbox is reached from the
 * dashboard's requests card and from the notifications feed, both of which
 * appear only when something is actually pending. A permanent rail row for it
 * was a row that said "nothing" on most days, in the one list where every item
 * is somewhere a working day is spent; the card that does have something to
 * say is the way in. See `PendingRequestsCard`.
 */
const NAV_ITEMS = [
  { href: '/app', labelKey: 'dashboard' },
  /**
   * The register (`/app/clients`) under the name the clinic uses for the people
   * in it.
   *
   * It was briefly a "Subscriber" group holding Details and Bills. The group
   * bought one word of grouping and charged a click for it: every trip to the
   * register — the screen most of a day is spent on — went through a disclosure
   * first, and on a phone, where the rail is locked to its icon column, through
   * a dropdown. The two screens are flat rows now, siblings in one list, each
   * one click from anywhere.
   *
   * The route did not move. Every link, bookmark and redirect still works; only
   * the word in the rail is different.
   */
  { href: '/app/clients', labelKey: 'subscriber' },
  /* The money half of the same people. A sibling rather than a child, so it is
     reached in one click and reads as its own screen, which it is. */
  { href: '/app/clients/bills', labelKey: 'bills' },
  { href: '/app/calendar?view=week', labelKey: 'calendar' },
  { href: '/app/weekly-plans', labelKey: 'weeklyPlans' },
  { href: '/app/dishes', labelKey: 'dishes' },
] as const satisfies readonly NavItem[];

/**
 * One glyph per destination. Text-only rows are hard to scan at a glance; the
 * icon is what lets someone find "Dishes" without reading the whole rail.
 *
 * `satisfies` ties this to the nav list, so adding a destination without an
 * icon is a compile error rather than a row that quietly sits misaligned.
 */
const NAV_ICONS = {
  dashboard: 'dashboard',
  subscriber: 'clients',
  bills: 'bills',
  calendar: 'calendar',
  weeklyPlans: 'weeklyPlans',
  dishes: 'dishes',
} as const satisfies Record<(typeof NAV_ITEMS)[number]['labelKey'], IconName>;

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
        items={NAV_ITEMS}
        title={t('shortName')}
        brand={brand ?? undefined}
        user={{ name: session.user.name, email: session.user.email, locale }}
        icons={NAV_ICONS}
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
