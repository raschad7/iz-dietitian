'use client';

import { ArrowLeft, Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { MouseEvent } from 'react';
import { useEffect } from 'react';

import { getPreviousPortalPath, recordPortalVisit } from '@/features/portal/nav-history';
import { Link, usePathname, useRouter } from '@/i18n/navigation';

/**
 * Set for a few seconds by `updateLanguageAction`, right after it changes the
 * client's language. `goBack` below reads and clears it.
 */
const LOCALE_SWITCH_COOKIE = 'PORTAL_LOCALE_SWITCH';

/** True the first time this runs after a language switch; clears the marker either way. */
function consumeLocaleSwitchMarker(): boolean {
  const present = document.cookie.split('; ').some((entry) => entry.startsWith(`${LOCALE_SWITCH_COOKIE}=`));
  if (present) {
    document.cookie = `${LOCALE_SWITCH_COOKIE}=; Max-Age=0; path=/`;
  }
  return present;
}

/**
 * The top of a pushed screen: the way back, what this is, and at most one
 * action.
 *
 * **Why it is not the greeting header.** That one opens a destination — it says
 * good morning and shows you the month. This opens a screen you asked for and
 * are going to leave, so it spends its width on the exit and the title instead.
 * The two never appear together; `(tabs)` renders one and `(screen)` the other.
 *
 * **The back control is a real link that behaves like back.** `router.back()`
 * alone is a button with no destination: it does nothing on a fresh page load,
 * cannot be opened in a new tab, and tells a screen reader nothing about where
 * it goes. This renders `fallbackHref` as an ordinary `<Link>` — which is what
 * happens with JavaScript off, or when this screen was opened directly from a
 * bookmark — and intercepts the click to step back through history when there
 * is history to step through. Tapping the avatar on the home screen and then
 * backing out lands where the client was, not on a fixed page.
 *
 * **Except for the one hop right after a language switch.** The screen the
 * client had open before Settings is still in history as it looked in the old
 * language — that entry was created before the switch, so a real
 * `history.back()` would step onto it and show the client their language
 * flipping back the moment they leave. The cookie `updateLanguageAction` sets
 * catches exactly that one press: instead of stepping through history, it
 * reopens whatever path `nav-history.ts` recorded as the one open right before
 * Settings — in the language that is active now — and real "back" resumes on
 * the next one. That path is looked up rather than fixed, so this lands the
 * client back where they actually came from (the drawer menu reaches Settings
 * from every tab, not only the profile screen that used to be assumed here).
 *
 * The arrow mirrors: it encodes direction, so in Arabic "back" points right.
 * The gear does not — a cog has no handedness.
 */
export function PortalScreenHeader({
  title,
  fallbackHref,
  action,
}: {
  title: string;
  /** Where back goes when there is no history to return to. */
  fallbackHref: '/portal' | '/portal/profile' | '/portal/settings';
  /** The trailing control. `settings` is the only one so far; screens with none pass nothing. */
  action?: 'settings';
}) {
  const t = useTranslations('portal.screen');
  const router = useRouter();
  const pathname = usePathname();

  // Every portal screen's header runs this, so the log has an entry for
  // wherever the client was before this one — see `nav-history.ts`.
  useEffect(() => {
    recordPortalVisit(pathname);
  }, [pathname]);

  function goBack(event: MouseEvent<HTMLAnchorElement>) {
    // Let the browser handle a modified click — it is someone deliberately
    // opening the fallback in a new tab, and hijacking that would be rude.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    // A fresh load has one entry, so there is nothing behind this screen and the
    // link's own destination is the honest answer.
    if (window.history.length <= 1) return;

    // The one exception to "step back through history" — see the note above.
    if (consumeLocaleSwitchMarker()) {
      const previousPath = getPreviousPortalPath();
      if (previousPath && previousPath !== pathname) {
        event.preventDefault();
        router.replace(previousPath);
      }
      return;
    }

    event.preventDefault();
    router.back();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-1 px-2 py-2 md:px-4">
        <Link
          href={fallbackHref}
          onClick={goBack}
          aria-label={t('back')}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo focus-visible:outline-none"
        >
          <ArrowLeft className="size-5.5 rtl:-scale-x-100" strokeWidth={1.9} aria-hidden="true" />
        </Link>

        {/*
          `h1`, not a styled span: this is the screen's name, and on a pushed
          screen with no other heading above it that is exactly what an h1 is
          for. It centres between two 44px controls, so the title stays optically
          centred whether or not the trailing action is there.
        */}
        <h1 className="min-w-0 flex-1 truncate text-center font-heading text-base font-medium">
          {title}
        </h1>

        {action === 'settings' ? (
          <Link
            href="/portal/settings"
            aria-label={t('settings')}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo focus-visible:outline-none"
          >
            <Settings className="size-5.5" strokeWidth={1.8} aria-hidden="true" />
          </Link>
        ) : (
          // Keeps the title centred when there is no action, without giving the
          // screen reader a control that does nothing.
          <span className="size-11 shrink-0" aria-hidden="true" />
        )}
      </div>
    </header>
  );
}
