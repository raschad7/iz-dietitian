'use client';

import { useTranslations } from 'next-intl';
import { useFormStatus } from 'react-dom';

import { Icon } from '@/components/ui/icon';
import { signOutAction } from '@/features/auth/actions';
import { type GreetingKey } from '@/features/portal/greeting';
import { Link, usePathname } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * The portal's own header: who you are and what day it is, rather than the
 * app's name.
 *
 * The greeting, the name and the date all show only on the home tab —
 * `isHome` below, keyed off `usePathname`. This header is shared chrome
 * across all five portal screens, and the other four are each already
 * identified by their own title or content, so repeating "Good evening,
 * <name>" on every one of them said nothing a screen didn't already say for
 * itself. The date used to live on the week strip's own heading row instead,
 * one section down; it moved up here so it reads on the same line as the
 * name, matching the current design.
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
      {/* `signOut` mirrors itself — see DIRECTIONAL in `icon.tsx`. */}
      <Icon name="signOut" className="size-5.5" />
    </button>
  );
}

export function PortalHeader({
  name,
  greeting,
  date,
  pendingCount,
  locale,
  showNav,
}: {
  name: string;
  greeting: GreetingKey;
  /**
   * Today's date, already formatted in the active locale. Shown beside the
   * name, but only on the home tab — like the greeting and name themselves,
   * see `isHome` below. Optional because `set-password`, the one caller
   * outside the tab group, is never the home route and so never needs to
   * compute it.
   */
  date?: string;
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

  /*
    **White chrome on home, ordinary foreground everywhere else.**

    The home tab is the only one with the glow behind it, and the bar is
    unfilled there (see the note on `<header>` below) — so the bell and the
    gear are sitting on the green wash rather than on a white card, and white
    is what reads on it. The other four tabs keep `bg-card`, where a white
    glyph would be a glyph you cannot see; they stay on `text-foreground`.

    The hover fill follows the same split for the same reason: `bg-muted` is a
    cool grey that shows as a smudge over the wash, so on home the press target
    tints with white at 15% instead.
  */
  const iconTone = isHome
    ? 'text-white hover:bg-white/15'
    : 'text-foreground hover:bg-muted';

  return (
    /*
      **On the home tab the bar is unfilled, and that is what lets the glow
      reach the top of the screen.** `HomeGlow` paints behind everything at
      `-z-10`; an opaque `bg-card` here was a white band across the first 120px
      of the page, so the green appeared to start below the greeting rather
      than behind it. Dropping the fill on that one tab is also what
      §Navigation already specifies for this bar — "deliberately unfilled: no
      background, no border, no elevation. The page's own cards carry the
      weight."

      The other four tabs keep the fill. They have no glow to reveal, so an
      unfilled bar there would only be a header that had lost the separation
      from the content underneath.
    */
    <header className={cn('px-4 pt-3 pb-4', isHome ? 'bg-transparent' : 'bg-card')}>
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-center justify-between">
          <Destination
            href="/portal/notifications"
            enabled={showNav}
            label={pendingCount > 0 ? t('notificationsWaiting', { count: pendingCount }) : t('notifications')}
            className={cn(
              'relative flex size-11 items-center justify-center rounded-full transition-colors',
              iconTone,
            )}
          >
            <Icon name="notifications" className="size-5.5" />

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
              className={cn('flex size-11 items-center justify-center rounded-full transition-colors', iconTone)}
            >
              <Icon name="settings" className="size-5.5" />
            </Destination>
          ) : (
            <HeaderSignOut locale={locale} />
          )}
        </div>

        {isHome ? (
          <div className="mt-2">
            {/*
              The greeting and the name go white, against the glow this header
              is deliberately unfilled over — see `iconTone` above. Only the
              home tab draws this block at all, so there is no second surface
              to check them against.
            */}
            <p className="flex items-center gap-1.5 text-sm text-white">
              {t(`greeting.${greeting}`)}
              <Icon name="greetingSun" className="size-4 text-status-complete-mark-soft" />
            </p>

            {/*
              `items-baseline`, not `items-center`: the date chip is much
              smaller than the name, and centring the two vertically would sit
              the chip noticeably above the name's own baseline instead of
              resting on the same line as its text.
            */}
            <p className="flex items-baseline justify-between gap-3">
              <span className="truncate font-heading text-xl font-semibold text-white">{name}</span>

              {date ? (
                <span className="shrink-0 text-xs font-medium text-white">{date}</span>
              ) : null}
            </p>
          </div>
        ) : null}
      </div>
    </header>
  );
}
