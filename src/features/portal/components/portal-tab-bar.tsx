'use client';

import { useTranslations } from 'next-intl';

import { Icon } from '@/components/ui/icon';
import { PORTAL_NAV, PORTAL_NAV_ICONS } from '@/features/portal/nav';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * The portal's navigation on a phone: a floating bottom bar, which is where a
 * thumb is.
 *
 * Same two marks as the sidebar rail — an olive surface that grows around the
 * active icon, and a lime node. Here the node sits above the icon rather than
 * beside it, because the bar is horizontal and a node on the inline-end edge
 * would read as belonging to the next item along. Labels stay visible on every
 * item; an icon-only bar makes people guess.
 *
 * The same four destinations appear in the sidebar above `md` — both read
 * `PORTAL_NAV`, so they cannot drift. This one is hidden from `md` up, and the
 * page reserves room for it with `pb-*` so the last card is never trapped
 * underneath.
 *
 * A client component for the same reason the sidebar is: the active item is
 * decided by the current path, and `usePathname` from `@/i18n/navigation`
 * returns it with the locale prefix already stripped.
 */

export function PortalTabBar() {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <nav
      // `env(safe-area-inset-bottom)` keeps the labels clear of the home
      // indicator on a notched phone, where the viewport bottom is not the
      // bottom of the usable screen.
      className="fixed inset-x-0 bottom-0 z-40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4 rounded-lg rounded-ee-[28px] bg-card p-1.5 shadow-elevated ring-1 ring-foreground/10">
        {PORTAL_NAV.map((item) => {
          // `/portal` is a prefix of the other three, so it matches only exactly.
          const active =
            item.href === '/portal' ? pathname === item.href : pathname.startsWith(item.href);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-md px-1 pt-3 pb-1.5 text-label transition-colors',
                  active ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )}
              >
                <span className="relative flex flex-col items-center">
                  {/*
                    The lime node, above the active icon. Scaled rather than
                    mounted, so moving between tabs animates instead of popping.
                  */}
                  <span
                    aria-hidden
                    className={cn(
                      'absolute -top-2 h-1 w-5 rounded-full bg-accent-lime',
                      'transition-transform duration-220 ease-[cubic-bezier(.2,.6,.2,1)]',
                      active ? 'scale-x-100' : 'scale-x-0',
                    )}
                  />
                  <span
                    className={cn(
                      'flex size-9 items-center justify-center rounded-full transition-colors duration-200',
                      active ? 'bg-primary text-primary-foreground' : 'bg-muted',
                    )}
                  >
                    <Icon name={PORTAL_NAV_ICONS[item.labelKey]} className="size-5" />
                  </span>
                </span>
                <span className="truncate">{t(item.labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
