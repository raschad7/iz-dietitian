import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';

type NavItem = {
  href: '/app' | '/portal';
  labelKey: 'dashboard' | 'portalHome';
};

/**
 * Navigation shell for a signed-in area. Deliberately thin: feature areas are
 * added here as `src/features/<feature>/` folders come online.
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
