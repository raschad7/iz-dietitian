import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/layout/sidebar';
import { type IconName } from '@/components/ui/icon';
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
 * The five places a dietitian works.
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
  { href: '/app/clients', labelKey: 'clients' },
  { href: '/app/calendar', labelKey: 'calendar' },
  { href: '/app/weekly-plans', labelKey: 'weeklyPlans' },
  { href: '/app/dishes', labelKey: 'dishes' },
] as const;

/**
 * One glyph per destination. Text-only rows are hard to scan at a glance; the
 * icon is what lets someone find "Dishes" without reading the whole rail.
 *
 * `satisfies` ties this to the nav list, so adding a destination without an
 * icon is a compile error rather than a row that quietly sits misaligned.
 */
const NAV_ICONS = {
  dashboard: 'dashboard',
  clients: 'clients',
  calendar: 'calendar',
  weeklyPlans: 'weeklyPlans',
  dishes: 'dishes',
} as const satisfies Record<(typeof NAV_ITEMS)[number]['labelKey'], IconName>;

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

      **`h-svh overflow-hidden` is what makes that true, and it was missing.**
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
      <AppShell
        items={NAV_ITEMS}
        title={t('shortName')}
        brand={brand ?? undefined}
        user={{ name: session.user.name, email: session.user.email, locale }}
        icons={NAV_ICONS}
        secondary={<GuideLauncher />}
        className="h-svh overflow-hidden"
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
        that still overflows. It also matters that nothing appears: the route
        entrance in `.q-route-stage` animates from an 8px translate, and with a
        clip that was invisible while with a *bar* it would flash a scrollbar on
        every navigation. There are no bars.

        This is a safety net, not a licence. Every real overflow is fixed at its
        source with the Rearrange → Stack → Internal-scroll ladder — `TableRoot`,
        `Tabs`, `PanelTabsList` and `.planner-week-scroll` are the precedents —
        and `overflow-x-hidden` must not come back here or go anywhere else.
      */}
        <main className="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto p-3 md:p-5">
          {children}
        </main>
      </AppShell>
    </GuideProvider>
  );
}
