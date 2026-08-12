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
  user,
  icons,
  className,
  children,
}: ShellProps) {
  return (
    <SidebarProvider className={className}>
      <AppSidebar items={items} title={title} showTitle={showTitle} user={user} icons={icons} />
      <SidebarInset>
        {/*
          Below `md` the rail is a sheet, and a sheet needs an opener that is
          not inside itself. The trigger in the sidebar's own header is the
          desktop one — once the rail is a drawer, that trigger is behind the
          drawer, so closed there is nothing on screen to open it with and the
          whole of the navigation is unreachable.

          Only when there is a `user`, which is the staff area. The portal has
          its own header and a bottom tab bar under `md`; a second bar above
          them would be the third way to get to the same five screens.
        */}
        {user ? <MobileBar title={title} /> : null}
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}

function MobileBar({ title }: { title: string }) {
  const t = useTranslations('nav');

  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border bg-sidebar px-3 text-sidebar-foreground md:hidden">
      <SidebarTrigger aria-label={t('openNavigation')} title={t('openNavigation')} />
      <span className="min-w-0 truncate font-heading text-body-md font-semibold">{title}</span>
    </div>
  );
}

function AppSidebar({ items, title, showTitle = true, user, icons }: Omit<ShellProps, 'children'>) {
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
            `sr-only` rather than absent when hidden: the string is the rail's
            accessible name, and the mobile drawer needs one whether or not
            anybody is meant to read it on screen. See `showTitle`.
          */}
          <span
            className={cn(
              'truncate font-heading text-heading-sm font-semibold group-data-[collapsible=icon]:hidden',
              !showTitle && 'sr-only',
            )}
          >
            {title}
          </span>
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
