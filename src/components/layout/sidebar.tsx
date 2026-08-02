'use client';

import { useTranslations } from 'next-intl';

import { Icon, type IconName } from '@/components/ui/icon';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export type NavItem = {
  href:
    | '/app'
    | '/app/clients'
    | '/app/calendar'
    | '/app/weekly-plans'
    | '/app/meal-plans'
    | '/app/dishes'
    | '/app/foods'
    | '/app/settings/whatsapp'
    | '/app/settings/security'
    | '/portal'
    | '/portal/appointments'
    | '/portal/meal-plan'
    | '/portal/profile';
  labelKey:
    | 'dashboard'
    | 'clients'
    | 'calendar'
    | 'weeklyPlans'
    | 'mealPlans'
    | 'dishes'
    | 'foods'
    | 'whatsapp'
    | 'security'
    | 'portalHome'
    | 'myAppointments'
    | 'myPlan'
    | 'profile';
};

/**
 * Navigation shell for a signed-in area: a solid dark olive rail.
 *
 * The active item is marked three ways — its own icon fills in, an olive
 * surface grows around it, and a lime leaf node appears on the inline-end
 * edge. More than one mark because colour alone fails for anyone who cannot
 * distinguish olive-700 from olive-900, and because the node is what makes
 * movement legible: it scales and rotates into place in 220ms so the change
 * reads as a single object relocating rather than two states flickering.
 *
 * The node is drawn per item and animated with `transform`, not by moving one
 * shared element — React would remount a shared node on every navigation and
 * the travel would never play.
 *
 * Sign-out lives in the header rather than here, because this rail is hidden
 * below `md` and a sign-out reachable only on desktop is a trap.
 *
 * A client component only because the current page cannot be known on the
 * server — `usePathname` drives the active state. It comes from
 * `@/i18n/navigation`, so the path has the locale prefix already stripped and
 * compares directly against the `href` values above.
 */
export function Sidebar({
  items,
  title,
  icons,
}: {
  items: readonly NavItem[];
  title: string;
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
    <aside className="hidden w-64 shrink-0 p-3 md:block">
      {/*
        The rail is an inset panel rather than a full-bleed column, so it
        carries the Arc like every other surface.
      */}
      <div className="flex h-full flex-col rounded-lg rounded-ee-[28px] bg-sidebar text-sidebar-foreground shadow-elevated">
        <div className="flex h-14 items-center px-5">
          <span className="truncate font-heading text-heading-sm font-semibold text-sidebar-primary-foreground">
            {title}
          </span>
        </div>

        <nav className="flex flex-col gap-1 p-3">
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
                  active
                    ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground'
                    : 'hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground',
                )}
              >
                {icon ? <Icon name={icon} className="size-4.5" /> : null}
                {/* `min-w-0` is what lets a long label actually truncate inside a flex row. */}
                <span className="min-w-0 truncate">{t(item.labelKey)}</span>

                {/*
                  The lime leaf node. Scaled rather than mounted/unmounted, so
                  switching pages animates instead of popping, and rotated a
                  little on the way in so it settles rather than snapping.

                  It sits *inside* the item's inline-end padding rather than
                  outside the rail: a leaf is wider than the 8px dot it
                  replaced, and hanging it past the edge clipped it in Arabic
                  where the rail's own rounding is on that side.
                */}
                <Icon
                  name="navNode"
                  className={cn(
                    'ms-auto size-4 text-sidebar-node',
                    'transition-transform duration-220 ease-[cubic-bezier(.2,.6,.2,1)]',
                    active ? 'scale-100 rotate-0' : 'scale-0 -rotate-45',
                  )}
                />
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
