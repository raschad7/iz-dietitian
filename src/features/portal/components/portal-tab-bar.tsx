'use client';

import { useTranslations } from 'next-intl';

import { Icon } from '@/components/ui/icon';
import { PORTAL_NAV, type PortalLabelKey } from '@/features/portal/nav';
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
 * `myPlan` is the featured centre tab — a raised olive disc, always elevated,
 * never just another item in the row. The disc sits in a notch cut clean out
 * of the bar rather than on top of it: the plate behind the row is masked by a
 * circle concentric with the disc and 6px larger in radius, so the empty ring
 * around the disc is an even 6px the whole way round and the page shows
 * through it. A masked plate rather than a mask on the row itself, because a
 * mask applies to descendants too and would erase the disc along with the
 * background it is meant to be sitting in.
 *
 * The geometry only stays symmetric because the bar's top padding lives on the
 * four ordinary tab links instead of on the `ul`: that puts the top of the
 * centre `li` on the top edge of the plate, so `-top-8` against a `size-16`
 * disc centres it exactly on that edge and the notch can be centred there too.
 *
 * The other four tabs sit in this bar's own outline icon set (`*Outline` in
 * the icon registry) rather than the app's usual Solar Bold: a bold outer row
 * would visually compete with the disc instead of framing it. This is the one
 * place that trade is worth making — see the note in
 * `scripts/generate-icons.ts`.
 *
 * Display order is fixed here rather than read straight off `PORTAL_NAV`
 * (home, appointments, plan, progress, profile) so the featured tab lands in
 * the middle regardless of `PORTAL_NAV`'s own order, which also drives the
 * desktop sidebar and is left alone.
 *
 * The same destinations appear in the sidebar above `md` — both read
 * `PORTAL_NAV`, so the routes and labels cannot drift. This bar is hidden
 * from `md` up, and the page reserves room for it with `pb-*` so the last
 * card is never trapped underneath.
 *
 * A client component for the same reason the sidebar is: the active item is
 * decided by the current path, and `usePathname` from `@/i18n/navigation`
 * returns it with the locale prefix already stripped.
 */

const TAB_ORDER: readonly PortalLabelKey[] = ['portalHome', 'myAppointments', 'myPlan', 'progress', 'profile'];

const OUTLINE_ICON = {
  portalHome: 'portalHomeOutline',
  myAppointments: 'myAppointmentsOutline',
  progress: 'progressOutline',
  profile: 'profileOutline',
} as const;

export function PortalTabBar() {
  const t = useTranslations('portal.tabs');
  const pathname = usePathname();

  const items = TAB_ORDER.map((labelKey) => PORTAL_NAV.find((item) => item.labelKey === labelKey)!);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 md:hidden">
      {/*
        The bar's own surface, and the only thing the notch is cut out of. A
        masked box cannot paint a box-shadow, so the separation from the
        content scrolling under it is carried by `border-t` — which the mask
        cuts along with the fill, so the notch keeps its outline.

        The stops are 1px apart rather than hard so the arc antialiases.
      */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-t-xl border-t border-border bg-muted [mask-image:radial-gradient(38px_38px_at_50%_0,transparent_37px,#000_38px)]"
      />

      {/*
        `env(safe-area-inset-bottom)` keeps the labels clear of the home
        indicator on a notched phone, where the viewport bottom is not the
        bottom of the usable screen. It is padding, not a margin, so the fill
        behind it still runs to the very edge.
      */}
      <ul className="relative grid grid-cols-5 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {items.map((item) => {
          // `/portal` is a prefix of the others, so it matches only exactly.
          const active = item.href === '/portal' ? pathname === item.href : pathname.startsWith(item.href);

          if (item.labelKey === 'myPlan') {
            return (
              <li key={item.href} className="relative flex flex-col items-center">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  // `-top-8` is half of `size-16`: it puts the disc's centre on
                  // the plate's top edge, which is where the notch is centred.
                  // Change one and the ring stops being even.
                  className="absolute inset-x-0 -top-8 flex flex-col items-center gap-1.5"
                >
                  <span
                    className={cn(
                      'flex size-16 items-center justify-center rounded-full text-primary-foreground shadow-elevated',
                      'transition-[background-color,transform,box-shadow] duration-(--duration-label) ease-(--ease-sweep)',
                      active
                        ? '-translate-y-0.5 scale-[1.03] bg-primary-hover shadow-overlay'
                        : 'bg-primary active:scale-95',
                    )}
                  >
                    <span className="relative">
                      <Icon name="myPlanFeatured" className="size-7" />
                      <Icon name="navNode" className="absolute -end-1.5 -bottom-1 size-3.5" />
                    </span>
                  </span>
                  <span
                    className={cn(
                      'truncate text-label',
                      active ? 'font-semibold text-primary' : 'text-muted-foreground',
                    )}
                  >
                    {t(item.labelKey)}
                  </span>
                </Link>
              </li>
            );
          }

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                // `pt-2.5` is the bar's top padding, carried here rather than
                // on the `ul` so the centre column starts at the plate's top
                // edge. See the note above.
                className="group flex flex-col items-center gap-1 pt-2.5 pb-1.5 text-label transition-colors duration-(--duration-label)"
              >
                <Icon
                  name={OUTLINE_ICON[item.labelKey]}
                  className={cn(
                    'size-6 transition-[color,transform] duration-(--duration-label) ease-(--ease-sweep)',
                    active
                      ? '-translate-y-0.5 scale-105 text-primary'
                      : 'text-muted-foreground group-active:scale-95',
                  )}
                />
                <span className={cn('truncate', active ? 'font-semibold text-primary' : 'text-muted-foreground')}>
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
