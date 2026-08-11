'use client';

import { useTranslations } from 'next-intl';
import type { MouseEvent } from 'react';

import { Icon } from '@/components/ui/icon';
import { Link, useRouter } from '@/i18n/navigation';

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
 * **A language switch needs no special case here, and used to have one.** Every
 * entry already in history was rendered in the old language and keeps its old
 * locale prefix, so stepping back onto one would show the client their language
 * flipping back. This file used to catch the first such press with a cookie and
 * reopen the previous path in the new language — which fixed one hop by pushing
 * a fresh copy on top of the stale one, leaving the old copy for the *next*
 * press to land on. `proxy.ts` now corrects the locale on the way in instead, so
 * back is plain back at every depth and the browser's own arrow behaves the same
 * as this one.
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

  function goBack(event: MouseEvent<HTMLAnchorElement>) {
    // Let the browser handle a modified click — it is someone deliberately
    // opening the fallback in a new tab, and hijacking that would be rude.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    // A fresh load has one entry, so there is nothing behind this screen and the
    // link's own destination is the honest answer.
    if (window.history.length <= 1) return;

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
          <Icon name="back" className="size-5.5" />
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
            <Icon name="settings" className="size-5.5" />
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
