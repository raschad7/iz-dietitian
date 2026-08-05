'use client';

import { useTranslations } from 'next-intl';

import { SidebarProfile } from '@/components/layout/sidebar-profile';
import { Icon, type IconName } from '@/components/ui/icon';
import { Link, usePathname } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * A destination in a rail.
 *
 * Profile, WhatsApp and security are deliberately absent: they are account
 * settings, not places you work, and they live in the profile menu at the foot
 * of the rail (`SidebarProfile`). Anything reachable from both lists would be
 * two answers to "where does this live".
 *
 * `/app/requests` is absent for a different reason — it is a screen you work
 * in, but only when a client is waiting, so it is reached from the dashboard
 * card and the notifications feed that know whether one is. See the nav list in
 * `src/app/[locale]/app/layout.tsx`.
 */
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

/**
 * Navigation shell for a signed-in area: a near-white rail.
 *
 * **Full-bleed, and separated from the page by a hairline rather than by a
 * shape.** It is not a card: no radius, no elevation. A rounded box is what
 * this system gives a surface sitting *on* the page, and the rail is not one —
 * it is the wall the app hangs on. The rail and the page are both near enough
 * to white that the 1px `border-e` is not reinforcing the separation, it *is*
 * the separation.
 *
 * **The active item is the only olive thing on the rail** — an olive-50 surface
 * with an olive-500 label and glyph, where every other row is a neutral glyph
 * beside an olive-800 label on no surface at all. The lime leaf that used to
 * ride the inline-end edge is gone: the tint is the mark now, and the leaf was
 * a second, louder one competing with it.
 *
 * Colour is not the only cue, because it cannot be — the active row also
 * carries `font-semibold` and `aria-current="page"`, which is what a screen
 * reader announces and what survives for anyone the olive fails. That matters
 * more than usual here: olive-500 on olive-50 is 2.95:1, under the contrast
 * floor. See the `--sidebar-*` note in globals.css.
 *
 * **The rail can end in an account control.** The dietitian area has no app bar
 * any more, so it passes `user` and `SidebarProfile` takes the block-end: the
 * signed-in name, and behind it everything that is about the account rather
 * than about a client. It is fenced off with a hairline and pushed down with
 * `mt-auto`, far from the navigation, in the corner an account control is
 * looked for.
 *
 * The portal omits `user` and gets no footer, because it still has a header
 * carrying sign-out and the language switcher — and below `md`, where this rail
 * is hidden entirely, that header is the only place a client can reach either.
 *
 * A client component only because the current page cannot be known on the
 * server — `usePathname` drives the active state. It comes from
 * `@/i18n/navigation`, so the path has the locale prefix already stripped and
 * compares directly against the `href` values above.
 */
export function Sidebar({
  items,
  title,
  user,
  icons,
}: {
  items: readonly NavItem[];
  title: string;
  /**
   * Set to give the rail its profile menu. `locale` rides along because
   * sign-out posts it back to the server action. Omit in a shell that already
   * has a header carrying those controls.
   */
  user?: { name: string; email?: string | null; locale: Locale };
  /** Optional per-item glyph. The staff rail is text-only by design. */
  icons?: Partial<Record<NavItem['labelKey'], IconName>>;
}) {
  const t = useTranslations('nav');
  const pathname = usePathname();

  /**
   * `/app` is a prefix of every other route, so it matches only exactly.
   * Everything else matches its own subtree, which keeps "Calendar"
   * highlighted on `/app/calendar/week` and "Clients" on a client's detail
   * page.
   */
  function isActive(href: NavItem['href']): boolean {
    if (href === '/app' || href === '/portal') return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <aside className="hidden w-64 shrink-0 border-e border-sidebar-border bg-sidebar text-sidebar-foreground md:block">
      <div className="flex h-full flex-col">
        {/*
          `h-18` puts the wordmark's centre 36px down, which is where the
          dashboard's greeting sits: `main`'s 20px of padding plus half of a
          24px heading's line box. The rail and the page then start on the same
          line, which is the whole reason for the height — it was `h-14`, sized
          to an app bar that no longer exists in this area.
        */}
        <div className="flex h-18 items-center px-5">
          <span className="truncate font-heading text-heading-sm font-semibold text-sidebar-primary-foreground">
            {title}
          </span>
        </div>

        <nav className="flex min-h-0 flex-col gap-1 overflow-y-auto p-3">
          {items.map((item) => {
            const active = isActive(item.href);
            const icon = icons?.[item.labelKey];

            return (
              <Link
                key={item.href}
                href={item.href}
                // Announces the current page to a screen reader, which colour
                // alone does not.
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-md px-4 py-2.5 text-start text-body-md',
                  'transition-[background-color,color] duration-200 ease-[cubic-bezier(.2,.6,.2,1)]',
                  'focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none',
                  /*
                    Hover is a neutral one step down from the rail, never a
                    tint: the active surface is olive-50, and an olive hover
                    under it would either outrank the state or be taken for it.
                  */
                  active
                    ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground'
                    : 'hover:bg-sidebar-hover',
                )}
              >
                {/*
                  The glyph is a neutral n-700 at rest and takes the row's olive
                  when the row is active — `text-current` rather than a second
                  active colour, so the two can never drift apart.
                */}
                {icon ? (
                  <Icon
                    name={icon}
                    className={cn('size-4.5', active ? 'text-current' : 'text-sidebar-icon')}
                  />
                ) : null}
                {/* `min-w-0` is what lets a long label actually truncate inside a flex row. */}
                <span className="min-w-0 truncate">{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </nav>

        {/*
          `mt-auto` lives on the profile control itself, so it pins to the
          block-end however short the nav is; the hairline above it is the same
          device the rail uses against the page — a change of region, not a card.
        */}
        {user ? (
          <SidebarProfile name={user.name} email={user.email} locale={user.locale} />
        ) : null}
      </div>
    </aside>
  );
}
