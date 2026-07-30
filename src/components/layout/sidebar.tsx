'use client';

import { useTranslations } from 'next-intl';

import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export type NavItem = {
  href:
    | '/app'
    | '/app/clients'
    | '/app/calendar'
    | '/app/meal-plans'
    | '/app/foods'
    | '/app/settings/security'
    | '/portal'
    | '/portal/appointments'
    | '/portal/meal-plan'
    | '/portal/profile';
  labelKey:
    | 'dashboard'
    | 'clients'
    | 'calendar'
    | 'mealPlans'
    | 'foods'
    | 'security'
    | 'portalHome'
    | 'myAppointments'
    | 'myPlan'
    | 'profile';
};

/**
 * Navigation shell for a signed-in area. Deliberately thin: feature areas are
 * added to the caller's `items` array as `src/features/<feature>/` folders come
 * online.
 *
 * Sign-out lives in the header rather than here, because this sidebar is hidden
 * below `md` and a sign-out button reachable only on desktop is a trap.
 *
 * A client component only because the current page cannot be known on the
 * server — `usePathname` is what drives the active state. It comes from
 * `@/i18n/navigation`, so the path it returns has the locale prefix already
 * stripped and compares directly against the `href` values above.
 */
export function Sidebar({ items, title }: { items: readonly NavItem[]; title: string }) {
  const t = useTranslations('nav');
  const pathname = usePathname();

  /**
   * `/app` is a prefix of every other route, so it matches only exactly.
   * Everything else matches its own subtree, which keeps "Calendar" highlighted
   * on `/app/calendar/week` and "Clients" on a client's detail page.
   */
  function isActive(href: NavItem['href']): boolean {
    if (href === '/app' || href === '/portal') return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <aside className="hidden w-60 shrink-0 border-e border-border bg-sidebar md:block">
      <div className="flex h-14 items-center border-b border-border px-4">
        <span className="truncate text-sm font-semibold">{title}</span>
      </div>

      <nav className="flex flex-col gap-1 p-2">
        {items.map((item) => {
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              // Announces the current page to a screen reader, which colour alone
              // does not.
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-2 text-start text-sm transition-colors',
                active
                  ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
              )}
            >
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
