import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';

export type NavItem = {
  href: '/app' | '/app/clients' | '/app/calendar' | '/app/meal-plans' | '/portal';
  labelKey: 'dashboard' | 'clients' | 'calendar' | 'mealPlans' | 'portalHome';
};

/**
 * Navigation shell for a signed-in area. Deliberately thin: feature areas are
 * added to the caller's `items` array as `src/features/<feature>/` folders come
 * online.
 *
 * Sign-out lives in the header rather than here, because this sidebar is hidden
 * below `md` and a sign-out button reachable only on desktop is a trap.
 */
export function Sidebar({ items, title }: { items: readonly NavItem[]; title: string }) {
  const t = useTranslations('nav');

  return (
    <aside className="hidden w-60 shrink-0 border-e border-border bg-sidebar md:block">
      <div className="flex h-14 items-center border-b border-border px-4">
        <span className="truncate text-sm font-semibold">{title}</span>
      </div>

      <nav className="flex flex-col gap-1 p-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-md px-3 py-2 text-start text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            {t(item.labelKey)}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
