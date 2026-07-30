'use client';

import { CalendarDays, House, Salad, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';

import { PORTAL_NAV } from '@/features/portal/nav';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * The portal's navigation on a phone: a fixed bottom bar, which is where a
 * thumb is.
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

type IconKey = (typeof PORTAL_NAV)[number]['labelKey'];

const ICONS = {
  portalHome: House,
  myAppointments: CalendarDays,
  myPlan: Salad,
  profile: User,
} as const satisfies Record<IconKey, ComponentType<{ className?: string }>>;

export function PortalTabBar() {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <nav
      // `pb-[env(safe-area-inset-bottom)]` keeps the labels clear of the home
      // indicator on a notched phone, where the viewport bottom is not the
      // bottom of the usable screen.
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {PORTAL_NAV.map((item) => {
          // `/portal` is a prefix of the other three, so it matches only exactly.
          const active = item.href === '/portal' ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = ICONS[item.labelKey];

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-1 px-1 py-2 text-[0.7rem] transition-colors',
                  active ? 'font-medium text-primary' : 'text-muted-foreground',
                )}
              >
                <Icon className="size-5" />
                <span className="truncate">{t(item.labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
