'use client';

import { Bell, ChevronRight, Settings, Sun, User, X } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { MenuIcon } from '@/components/icons';
import { PortalSignOut } from '@/features/portal/components/portal-sign-out';
import { type GreetingKey } from '@/features/portal/greeting';
import { Link, usePathname } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * The portal's own header: who you are and what day it is, rather than the
 * app's name.
 *
 * The date itself is not here. The month used to sit at the end of the name
 * row, where it read as a stray label pinned to the header's bottom edge; it
 * now belongs to the week strip on the home screen, on the same line as that
 * section's own heading, which is the only place on the app where a month is
 * actually answering a question the reader has.
 *
 * It replaces the generic `Header` for this area. That bar carried the title,
 * the locale switcher and sign-out; all three still exist, moved behind the
 * menu button — which is what makes the menu a real control rather than
 * decoration. Sign-out reachable only on desktop was already called out as a
 * trap in `sidebar.tsx`, and this keeps it reachable on a phone.
 *
 * **The menu is a drawer, not a dropdown.** It used to expand a panel inline
 * underneath the header, which pushed the whole page down and gave the account
 * settings the same weight as a filter. It now slides in from the inline-start
 * edge — the right in Arabic — over a scrim, which is where a phone's account
 * menu lives and what lets it hold more than four links without burying the
 * page.
 *
 * **The bell means something.** Its dot is on when the dietitian has not yet
 * answered a request, and it opens the standalone notifications screen — its
 * own pushed screen, not a tab, so it can be read and backed out of without
 * losing the tab the client was on. A notification bell that notifies nothing
 * would be worse than no bell.
 *
 * A client component for the drawer's open state, which closes itself on
 * navigation — the layout stays mounted across route changes, so nothing else
 * would close it.
 */

/**
 * A header control that is a link only when there is somewhere to go.
 *
 * Before the password change every portal route bounces back to
 * `set-password`, so the bell and the avatar would both be links to the page
 * you are already on. They stay visible — the header should not rearrange
 * itself — but they stop being interactive.
 */
function Destination({
  href,
  enabled,
  className,
  label,
  children,
}: {
  href: '/portal/appointments' | '/portal/notifications' | '/portal/profile' | '/portal/settings';
  enabled: boolean;
  className: string;
  label?: string;
  children: React.ReactNode;
}) {
  if (!enabled) {
    return <span className={className}>{children}</span>;
  }

  return (
    <Link href={href} aria-label={label} className={className}>
      {children}
    </Link>
  );
}

/** One navigating row in the drawer. */
function MenuRow({
  href,
  icon: Icon,
  label,
  value,
  count,
  onNavigate,
}: {
  href: '/portal/appointments' | '/portal/notifications' | '/portal/profile' | '/portal/settings';
  icon: typeof User;
  label: string;
  /** The row's current setting, shown inline — the language, for instance. */
  value?: string;
  /** A pending count, shown as a chip instead of a chevron. */
  count?: number;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-md px-2 py-2.5 text-sm transition-colors hover:bg-muted"
    >
      <Icon className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.7} aria-hidden="true" />

      <span className="min-w-0 flex-1 truncate">{label}</span>

      {value ? <span className="shrink-0 text-xs text-muted-foreground">{value}</span> : null}

      {count !== undefined && count > 0 ? (
        <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-status-on-track-bg px-1.5 text-xs font-semibold text-status-on-track-fg tabular-nums">
          {count}
        </span>
      ) : (
        // Directional: it points the way the reader travels, so it mirrors.
        <ChevronRight className="size-4 shrink-0 text-border rtl:-scale-x-100" aria-hidden="true" />
      )}
    </Link>
  );
}

export function PortalHeader({
  name,
  initials,
  photoUrl,
  greeting,
  pendingCount,
  locale,
  showNav,
}: {
  name: string;
  initials: string;
  /**
   * The client's photo, or null — which is the normal case, and why the
   * initials behind it are the real avatar rather than a placeholder.
   */
  photoUrl: string | null;
  greeting: GreetingKey;
  pendingCount: number;
  locale: Locale;
  /**
   * False while the client still owes us a password change. `(secured)/layout`
   * explains the rule: every portal page redirects back to `set-password` until
   * then, so offering the destinations would be a shell with no floor.
   * Sign-out stays, because the only other way out is closing the tab.
   */
  showNav: boolean;
}) {
  const t = useTranslations('portal.header');
  const tMenu = useTranslations('portal.menu');
  const pathname = usePathname();

  /**
   * The path the drawer was opened on, rather than a boolean.
   *
   * The layout stays mounted across route changes, so a plain `open` flag would
   * survive a tap on one of the drawer's links and leave the panel hanging over
   * the new page. Storing the path makes "still on the page I opened this from"
   * the condition, so navigating closes it with no effect to run — which is
   * also why there is no `useEffect` here resetting state on `pathname`.
   */
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;
  const close = () => setOpenedAt(null);

  /**
   * The record tab draws its own heading, so the header steps back to two
   * controls.
   *
   * Every other tab opens on content with no title of its own — the week strip,
   * the appointment list — and the greeting is what tells you whose portal this
   * is. `/portal/profile` is the one screen that names itself, and stacking a
   * 56px avatar and a 20px name above a page whose first line is already
   * "my health record" said the same thing twice, in the larger type, before the
   * thing it was introducing.
   *
   * **The menu button goes with it, and the gear replaces it.** The drawer's
   * three rows are the profile (you are on it), notifications (the bell beside
   * it) and settings — so on this one screen the drawer was a hamburger hiding a
   * single destination. The gear goes straight there, and the settings screen
   * carries sign-out and the language switcher, which is what the drawer was
   * really for.
   */
  const bare = pathname === '/portal/profile';

  // Escape closes it, which is the one keyboard affordance a scrim implies and
  // does not provide on its own.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <header className={cn('border-b border-border bg-card px-4 pt-3', bare ? 'pb-3' : 'pb-4')}>
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-center justify-between">
          {bare ? (
            /*
              Same slot the menu button held, so the control the thumb reaches
              for does not move between tabs — only what it does changes. In
              Arabic that is the inline-start edge, which is the right.
            */
            <Destination
              href="/portal/settings"
              enabled={showNav}
              label={tMenu('settings')}
              className="flex size-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
            >
              <Settings className="size-5.5" strokeWidth={1.9} aria-hidden="true" />
            </Destination>
          ) : (
            <button
              type="button"
              onClick={() => setOpenedAt(pathname)}
              aria-expanded={open}
              aria-controls="portal-menu"
              aria-label={t('menu')}
              className="flex size-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
            >
              <MenuIcon className="h-3.5 w-5" />
            </button>
          )}

          <Destination
            href="/portal/notifications"
            enabled={showNav}
            label={pendingCount > 0 ? t('notificationsWaiting', { count: pendingCount }) : t('notifications')}
            className="relative flex size-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
          >
            <Bell className="size-5.5" strokeWidth={1.9} aria-hidden="true" />

            {pendingCount > 0 ? (
              // Ring in the surface colour, so the dot reads as a separate
              // object rather than a smudge on the bell.
              <span className="absolute top-2 end-2.5 size-2.5 rounded-full bg-status-complete-mark ring-2 ring-card" />
            ) : null}
          </Destination>
        </div>

        {bare ? null : (
          <div className="mt-2 flex items-center gap-3">
            <Destination
              href="/portal/profile"
              enabled={showNav}
              label={t('profile')}
              className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary font-heading text-base font-medium text-primary-foreground shadow-card"
            >
              {photoUrl ? (
                // `fill` + `object-cover`: a portrait and a square both have to
                // land as a circle without the caller knowing the ratio. The
                // initials stay underneath, so a photo that 404s degrades to
                // them rather than to a hole.
                <Image src={photoUrl} alt="" fill sizes="56px" className="object-cover" />
              ) : null}
              <span className={photoUrl ? 'sr-only' : undefined}>{initials}</span>
            </Destination>

            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {t(`greeting.${greeting}`)}
                <Sun className="size-4 text-status-complete-mark-soft" strokeWidth={2} aria-hidden="true" />
              </p>
              <p className="truncate font-heading text-xl font-semibold text-secondary-foreground">{name}</p>
            </div>
          </div>
        )}
      </div>

      {/*
        The scrim. A button rather than a div so it is reachable and dismissible
        without a pointer; `inert`-like behaviour comes from it being removed
        from the tree entirely when closed.

        Both it and the drawer are dropped entirely on the bare header — with no
        button to open it, a panel that can never be reached is markup with no
        behaviour, and a scrim fixed over the viewport is not the thing to leave
        lying around on a guess.
      */}
      {bare ? null : (
        <button
          type="button"
          onClick={close}
          aria-label={t('closeMenu')}
          className={cn(
            'fixed inset-0 z-40 bg-scrim transition-opacity duration-200',
            open ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          tabIndex={open ? 0 : -1}
        />
      )}

      {bare ? null : (
      <div
        id="portal-menu"
        // `start-0` is the right edge in Arabic and the left in English, so the
        // drawer always enters from the side the menu button sits on. The
        // transform has no logical form, which is what the dir variants are for.
        className={cn(
          'fixed inset-y-0 start-0 z-50 flex w-[min(21rem,85%)] flex-col overflow-y-auto',
          'bg-card shadow-overlay transition-transform duration-300 ease-[cubic-bezier(.2,.6,.2,1)]',
          // §9.4's Arc: one swept corner, on the block-end/inline-end corner.
          'rounded-ee-4xl',
          open ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full',
        )}
        // A closed drawer keeps its DOM (so the slide-out animates) but must
        // not be reachable by keyboard or screen reader while off-screen.
        // React 19 takes `inert` as a real boolean, and it already implies
        // aria-hidden, so pairing the two would be redundant.
        inert={!open}
      >
        <div className="flex justify-end p-3 pb-0">
          <button
            type="button"
            onClick={close}
            aria-label={t('closeMenu')}
            className="flex size-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
          >
            <X className="size-5" strokeWidth={1.9} aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col items-start gap-2 px-5 pt-1 pb-4">
          <span className="relative flex size-14 items-center justify-center overflow-hidden rounded-full bg-primary font-heading text-base font-medium text-primary-foreground">
            {photoUrl ? <Image src={photoUrl} alt="" fill sizes="56px" className="object-cover" /> : null}
            <span className={photoUrl ? 'sr-only' : undefined}>{initials}</span>
          </span>

          <span className="font-heading text-lg font-semibold text-secondary-foreground">{name}</span>
        </div>

        <nav className="flex flex-col px-3 pb-6">
          {showNav ? (
            <div className="flex flex-col border-t border-border py-1.5">
              <MenuRow href="/portal/profile" icon={User} label={tMenu('personalInfo')} onNavigate={close} />
              <MenuRow
                href="/portal/notifications"
                icon={Bell}
                label={tMenu('notifications')}
                count={pendingCount}
                onNavigate={close}
              />
              <MenuRow
                href="/portal/settings"
                icon={Settings}
                label={tMenu('settings')}
                onNavigate={close}
              />
            </div>
          ) : null}

          <div className={cn('flex flex-col py-1.5', showNav && 'border-t border-border')}>
            <PortalSignOut locale={locale} />
          </div>
        </nav>
      </div>
      )}
    </header>
  );
}
