'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { SidebarProfile } from '@/components/layout/sidebar-profile';
import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { Link, usePathname } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

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

type SidebarProps = {
  items: readonly NavItem[];
  title: string;
  user?: { name: string; email?: string | null; locale: Locale };
  icons?: Partial<Record<NavItem['labelKey'], IconName>>;
  /**
   * Off for the portal, which owns its own mobile header (`PortalHeader` /
   * `PortalScreenHeader`) and a bottom tab bar that already lists every item
   * this bar's drawer would. Left on elsewhere, where this fixed bar is the
   * only mobile navigation there is.
   */
  showMobileBar?: boolean;
};

/**
 * Responsive application navigation.
 *
 * A 256px navigation column is useful beside a desktop workspace and expensive
 * beside a tablet tool. From `md` to `xl` it therefore becomes a 72px icon rail;
 * the full navigation opens over the workspace instead of resizing it. Phones
 * get the same drawer from a compact app bar, so navigation never disappears.
 */
export function Sidebar({ items, title, user, icons, showMobileBar = true }: SidebarProps) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  function isActive(href: NavItem['href']): boolean {
    if (href === '/app' || href === '/portal') return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <>
      {/* Mobile owns a small app bar instead of leaving the signed-in area with
          no navigation at all. The page starts below it in the app layout. */}
      {showMobileBar ? (
        <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-sidebar-border bg-sidebar px-3 text-sidebar-foreground md:hidden">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-expanded={drawerOpen}
            aria-label={t('openNavigation')}
            title={t('openNavigation')}
            onClick={() => setDrawerOpen(true)}
          >
            <Icon name="navigationMenu" className="size-5" />
          </Button>
          <span className="min-w-0 truncate font-heading text-body-md font-semibold text-sidebar-primary-foreground">
            {title}
          </span>
        </div>
      ) : null}

      {/* Tablet tool rail: destinations remain one tap away, while the board
          receives 184px back. The menu button reveals labels and account tools. */}
      <aside className="hidden w-18 shrink-0 border-e border-sidebar-border bg-sidebar text-sidebar-foreground md:block xl:hidden">
        <div className="flex h-full flex-col items-center">
          <div className="grid h-18 w-full shrink-0 place-items-center">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-expanded={drawerOpen}
              aria-label={t('openNavigation')}
              title={t('openNavigation')}
              onClick={() => setDrawerOpen(true)}
            >
              <Icon name="navigationMenu" className="size-5" />
            </Button>
          </div>

          <nav className="flex min-h-0 w-full flex-col items-center gap-1 overflow-y-auto px-2 py-3">
            {items.map((item) => {
              const active = isActive(item.href);
              const icon = icons?.[item.labelKey];

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  aria-label={t(item.labelKey)}
                  title={t(item.labelKey)}
                  className={cn(
                    'grid size-12 shrink-0 place-items-center rounded-md outline-none',
                    'transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(.16,1,.3,1)] active:scale-95',
                    'focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                    active
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-icon hover:bg-sidebar-hover hover:text-sidebar-foreground',
                  )}
                >
                  {icon ? <Icon name={icon} className="size-5" /> : null}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* A wide monitor can afford the full navigation without taking working
          room away from the current task. */}
      <aside className="hidden w-64 shrink-0 border-e border-sidebar-border bg-sidebar text-sidebar-foreground xl:block">
        <SidebarPanel
          items={items}
          title={title}
          user={user}
          icons={icons}
          isActive={isActive}
        />
      </aside>

      <NavigationDrawer
        open={drawerOpen}
        title={title}
        closeLabel={t('closeNavigation')}
        onClose={() => setDrawerOpen(false)}
      >
        <SidebarPanel
          items={items}
          title={title}
          user={user}
          icons={icons}
          isActive={isActive}
          onNavigate={() => setDrawerOpen(false)}
          onClose={() => setDrawerOpen(false)}
          closeLabel={t('closeNavigation')}
        />
      </NavigationDrawer>
    </>
  );
}

function SidebarPanel({
  items,
  title,
  user,
  icons,
  isActive,
  onNavigate,
  onClose,
  closeLabel,
}: SidebarProps & {
  isActive: (href: NavItem['href']) => boolean;
  onNavigate?: () => void;
  onClose?: () => void;
  closeLabel?: string;
}) {
  const t = useTranslations('nav');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-18 shrink-0 items-center gap-2 px-5">
        <span className="min-w-0 flex-1 truncate font-heading text-heading-sm font-semibold text-sidebar-primary-foreground">
          {title}
        </span>
        {onClose ? (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={closeLabel}
            title={closeLabel}
            onClick={onClose}
          >
            <Icon name="close" />
          </Button>
        ) : null}
      </div>

      <nav className="flex min-h-0 flex-col gap-1 overflow-y-auto p-3">
        {items.map((item) => {
          const active = isActive(item.href);
          const icon = icons?.[item.labelKey];

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 rounded-md px-4 py-2.5 text-start text-body-md outline-none',
                'transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(.16,1,.3,1)] active:translate-y-px',
                'focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                active
                  ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground'
                  : 'hover:bg-sidebar-hover',
              )}
            >
              {icon ? (
                <Icon
                  name={icon}
                  className={cn('size-4.5', active ? 'text-current' : 'text-sidebar-icon')}
                />
              ) : null}
              <span className="min-w-0 truncate">{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </nav>

      {user ? (
        <SidebarProfile
          name={user.name}
          email={user.email}
          locale={user.locale}
          onNavigate={onNavigate}
        />
      ) : null}
    </div>
  );
}

function NavigationDrawer({
  open,
  title,
  closeLabel,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open) {
      dialog.removeAttribute('data-closing');
      if (!dialog.open) dialog.showModal();
      return;
    }

    if (!dialog.open) return;
    dialog.dataset.closing = 'true';

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timeout = window.setTimeout(() => {
      if (dialog.open) dialog.close();
      dialog.removeAttribute('data-closing');
    }, reduceMotion ? 0 : 180);

    return () => window.clearTimeout(timeout);
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="app-navigation-drawer p-0 text-start text-sidebar-foreground backdrop:bg-[var(--overlay)] backdrop:[backdrop-filter:blur(3px)]"
    >
      <div className="h-full bg-sidebar shadow-overlay">{children}</div>
      <span className="sr-only">{closeLabel}</span>
    </dialog>
  );
}
