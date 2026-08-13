'use client';

import { useTranslations } from 'next-intl';

import { Icon } from '@/components/ui/icon';
import { PORTAL_NAV, PORTAL_NAV_ICONS } from '@/features/portal/nav';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * The portal's navigation on a phone: a bottom bar anchored to the screen
 * edge, which is where a thumb is.
 *
 * It is edge-to-edge — flush left, right and bottom, with the top two corners
 * rounded and the bottom two left square so they meet the screen corners. The
 * only inset it keeps is `env(safe-area-inset-bottom)`, carried *inside* the
 * bar so the fill still reaches the bottom of the display on a notched phone
 * while the labels stay clear of the home indicator.
 *
 * Four equal columns, one style throughout — no tab is raised above the
 * others. Icons come from `PORTAL_NAV_ICONS`, the same map the desktop
 * sidebar reads, so a client learns one glyph per destination rather than a
 * phone-only set.
 *
 * Read straight off `PORTAL_NAV`, in that list's own order — the same
 * destinations appear in the sidebar above `lg`, so the routes and labels
 * cannot drift. This bar is hidden from `lg` up, and the page reserves room
 * for it with `pb-*` so the last card is never trapped underneath.
 *
 * **`lg`, not `md`, and it is the same line the rail is held back to.** A
 * 768px iPad portrait hits `md` exactly, so the rail used to take 256px of it
 * for the four destinations already sitting in this bar. Between `md` and
 * `lg` the portal is a phone layout on a bigger screen: this bar, the home
 * glow, and the full-width column. See the `.portal-shell [data-slot=sidebar]`
 * rule in `globals.css` — the two must name the same breakpoint or a client
 * gets both at once, or neither.
 *
 * A client component because the active item is decided by the current path,
 * and `usePathname` from `@/i18n/navigation` returns it with the locale
 * prefix already stripped.
 */

export function PortalTabBar() {
  const t = useTranslations('portal.tabs');
  const pathname = usePathname();

  return (
    /*
      `portal-tab-bar` styles nothing here. It is a marker: the toast viewport
      hangs off <body>, outside this tree, and has to lift its block-end offset
      clear of this bar — so globals.css asks `body:has(.portal-tab-bar)`
      whether this bar is on the screen at all. The `(screen)` group renders no
      tab bar, and a toast there should sit at the app's ordinary offset.
    */
    <nav className="portal-tab-bar fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card lg:hidden">
      {/*
        `env(safe-area-inset-bottom)` keeps the labels clear of the home
        indicator on a notched phone, where the viewport bottom is not the
        bottom of the usable screen. It is padding, not a margin, so the fill
        behind it still runs to the very edge.
      */}
      <ul className="grid grid-cols-4 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {PORTAL_NAV.map((item) => {
          // `/portal` is a prefix of the others, so it matches only exactly.
          const active = item.href === '/portal' ? pathname === item.href : pathname.startsWith(item.href);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className="group flex flex-col items-center gap-1 pt-2.5 pb-1.5 text-label transition-colors duration-(--duration-label)"
              >
                <Icon
                  name={PORTAL_NAV_ICONS[item.labelKey]}
                  className={cn(
                    'size-6 transition-[color,transform,filter] duration-(--duration-label) ease-(--ease-sweep)',
                    active
                      ? '-translate-y-0.5 scale-105 text-primary saturate-150'
                      : 'text-muted-foreground group-active:scale-95',
                  )}
                />
                <span
                  className={cn(
                    'truncate',
                    active ? 'font-semibold text-primary saturate-150' : 'text-muted-foreground',
                  )}
                >
                  {t(item.labelKey)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
