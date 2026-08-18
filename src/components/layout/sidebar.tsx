'use client';

import { useTranslations } from 'next-intl';

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
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Link, usePathname } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';

import { BrandLogo } from './brand-logo';
import { SidebarProfile } from './sidebar-profile';

export type NavItem = {
  href:
    | '/app'
    | '/app/clients'
    | '/app/calendar'
    | '/app/weekly-plans'
    | '/app/dishes'
    | '/portal'
    | '/portal/appointments'
    | '/portal/meal-plan'
    | '/portal/profile'
    | '/portal/progress';
  labelKey:
    | 'dashboard'
    | 'clients'
    | 'calendar'
    | 'weeklyPlans'
    | 'dishes'
    | 'portalHome'
    | 'myAppointments'
    | 'myPlan'
    | 'profile'
    | 'progress';
};

type ShellProps = {
  items: readonly NavItem[];
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
  icons?: Partial<Record<NavItem['labelKey'], IconName>>;
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
  className,
  children,
}: ShellProps) {
  return (
    /*
      `railOnly` on the staff shell, and only there.

      Below `lg` the rail is locked to its 56px icon column: always on screen,
      never expandable, no drawer. It replaces a `<dialog>` drawer that had to be
      opened before any destination could be reached and covered the page while
      it was open — two taps and an occlusion to change screen, on the devices
      where changing screen is most of what you do.

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
      <AppSidebar items={items} title={title} showTitle={showTitle} brand={brand} user={user} icons={icons} />
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

function AppSidebar({ items, title, showTitle = true, brand, user, icons }: Omit<ShellProps, 'children'>) {
  const t = useTranslations('nav');
  const pathname = usePathname();

  /*
   * The two index routes have to match exactly. `/app` is a prefix of every
   * other staff route, so a `startsWith` test would light the dashboard up on
   * every page in the app.
   */
  function isActive(href: NavItem['href']): boolean {
    if (href === '/app' || href === '/portal') return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

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
            {brand ? <BrandLogo className="h-9 shrink-0" /> : null}
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
          <SidebarTrigger className="shrink-0" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const icon = icons?.[item.labelKey];
                const label = t(item.labelKey);

                return (
                  <SidebarMenuItem key={item.href}>
                    {/*
                      `tooltip` only shows while the sidebar is collapsed — the
                      registry hides it otherwise — so the label is never
                      announced twice to a pointer that can already read it.
                    */}
                    <SidebarMenuButton
                      tooltip={label}
                      isActive={isActive(item.href)}
                      render={<Link href={item.href} />}
                    >
                      {/*
                        20px, explicitly. `Icon` ships `size-4` in its own class
                        list, so the button's `[&_svg:not([class*='size-'])]`
                        default never reaches it — the glyph has to ask. This is
                        the rail's one job at 56px wide, and 16px of it was too
                        little to aim at or to tell apart at a glance.
                      */}
                      {icon ? <Icon name={icon} className="size-5" /> : null}
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
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
