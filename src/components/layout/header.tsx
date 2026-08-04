import type { ReactNode } from 'react';

import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { SignOutButton } from '@/components/layout/sign-out-button';
import { type Locale } from '@/i18n/routing';

/**
 * Top app bar for the client portal.
 *
 * Deliberately unfilled: it sits directly on the canvas with no background,
 * no border and no elevation, so the page's own cards are the only surfaces
 * and the eye has one place to go. The title and controls carry themselves on
 * type and spacing alone.
 *
 * **The dietitian area has no bar at all** — its rail carries the language
 * switcher and sign-out at its block-end (see `layout/sidebar.tsx`). The portal
 * has no rail to put them in, so it keeps this.
 */
export function Header({
  title,
  userName,
  locale,
  children,
}: {
  title: string;
  userName?: string;
  locale: Locale;
  /** Contextual controls — a status chip, a page action — sit inline-end of the title. */
  children?: ReactNode;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 px-3 md:px-5">
      <h1 className="truncate font-heading text-heading-sm font-semibold text-foreground" dir="auto">
        {title}
      </h1>

      {children}

      <div className="ms-auto flex items-center gap-2">
        {userName ? (
          <span className="hidden text-caption text-muted-foreground sm:inline" dir="auto">
            {userName}
          </span>
        ) : null}
        <LocaleSwitcher />
        <SignOutButton locale={locale} />
      </div>
    </header>
  );
}
