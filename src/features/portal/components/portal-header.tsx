'use client';

import { Bell, LogOut, Settings, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useFormStatus } from 'react-dom';

import { CalendarGlyphIcon } from '@/components/icons';
import { signOutAction } from '@/features/auth/actions';
import { type GreetingKey } from '@/features/portal/greeting';
import { Link, usePathname } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';

/**
 * The portal's own header: who you are and what day it is, rather than the
 * app's name.
 *
 * The month sits beside the greeting line, but only when `usePathname` says
 * this render is the home tab — see `month` below. It used to live on the
 * week strip's own heading row instead, one section down; it moved back up
 * here so it reads on the same line as the name, matching the current design.
 *
 * **The bell means something.** Its dot is on when the dietitian has not yet
 * answered a request, and it opens the standalone notifications screen — its
 * own pushed screen, not a tab, so it can be read and backed out of without
 * losing the tab the client was on. A notification bell that notifies nothing
 * would be worse than no bell.
 *
 * **The trailing control is settings, not a menu.** There is no drawer:
 * profile is already a tab, and settings is one tap away instead of two.
 * Before the password change (`showNav` false) settings would only bounce
 * back to `set-password`, so this slot signs the client out directly instead
 * — the one thing they still need a way to do from a screen they cannot
 * leave any other way.
 */
function Destination({
  href,
  enabled,
  className,
  label,
  children,
}: {
  href: '/portal/notifications' | '/portal/settings';
  enabled: boolean;
  className: string;
  label: string;
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

/** Sign-out as the header's trailing icon, for the one screen with no settings to send it to. */
function HeaderSignOut({ locale }: { locale: Locale }) {
  const t = useTranslations('common');

  return (
    <form action={signOutAction}>
      <input type="hidden" name="locale" value={locale} />
      <HeaderSignOutSubmit label={t('signOut')} />
    </form>
  );
}

function HeaderSignOutSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={label}
      className="flex size-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted disabled:opacity-50"
    >
      <LogOut className="size-5.5 rtl:-scale-x-100" strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}

export function PortalHeader({
  name,
  greeting,
  month,
  pendingCount,
  locale,
  showNav,
}: {
  name: string;
  greeting: GreetingKey;
  /**
   * The current month, already formatted in the active locale — "أغسطس",
   * "Aug". Shown beside the greeting line, but only on the home tab: this
   * header is shared chrome across all five portal screens, and the other
   * four are each already dated by their own content (the progress tab's
   * trend cards, the meal-plan's own day picker) — so `usePathname` below is
   * what keeps it from also showing there. Optional because `set-password`,
   * the one caller outside the tab group, is never the home route and so
   * never needs to compute it.
   */
  month?: string;
  pendingCount: number;
  locale: Locale;
  /**
   * False while the client still owes us a password change. `(secured)/layout`
   * explains the rule: every portal route redirects back to `set-password`
   * until then, so the bell and settings link stay off and sign-out takes
   * their slot instead.
   */
  showNav: boolean;
}) {
  const t = useTranslations('portal.header');
  const tMenu = useTranslations('portal.menu');
  const pathname = usePathname();
  const isHome = pathname === '/portal';

  return (
    <header className="border-b border-border bg-card px-4 pt-3 pb-4">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-center justify-between">
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

          {showNav ? (
            <Destination
              href="/portal/settings"
              enabled
              label={tMenu('settings')}
              className="flex size-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
            >
              <Settings className="size-5.5" strokeWidth={1.8} aria-hidden="true" />
            </Destination>
          ) : (
            <HeaderSignOut locale={locale} />
          )}
        </div>

        <div className="mt-2">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {t(`greeting.${greeting}`)}
            <Sun className="size-4 text-status-complete-mark-soft" strokeWidth={2} aria-hidden="true" />
          </p>

          {/*
            `items-baseline`, not `items-center`: the month chip is much
            smaller than the name, and centring the two vertically would sit
            the chip noticeably above the name's own baseline instead of
            resting on the same line as its text.
          */}
          <p className="flex items-baseline justify-between gap-3">
            <span className="truncate font-heading text-xl font-semibold text-secondary-foreground">{name}</span>

            {isHome && month ? (
              <span className="shrink-0 text-xs font-medium text-muted-foreground">
                <CalendarGlyphIcon className="me-1 inline-block size-3.5 align-[-0.15em]" />
                {month}
              </span>
            ) : null}
          </p>
        </div>
      </div>
    </header>
  );
}
