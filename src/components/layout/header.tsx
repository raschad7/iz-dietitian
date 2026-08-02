import type { ReactNode } from 'react';

import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { SignOutButton } from '@/components/layout/sign-out-button';
import { type Locale } from '@/i18n/routing';

/**
 * Top app bar for both signed-in areas.
 *
 * Deliberately unfilled: it sits directly on the canvas with no background,
 * no border and no elevation, so the dark rail is the only heavy surface in
 * the shell and the eye has one place to go. The title and controls carry
 * themselves on type and spacing alone.
 *
 * Sign-out lives here rather than in the sidebar because the sidebar is hidden
 * below `md`, and the client portal has no sidebar at all.
 */
export function Header({
  title,
  userName,
  locale,
  actions,
  children,
}: {
  title: string;
  userName?: string;
  locale: Locale;
  /**
   * Shell-level controls that belong beside sign-out — the notification bell.
   * Separate from `children` because those sit next to the title, and because
   * the portal has no equivalent.
   */
  actions?: ReactNode;
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
        {actions}
        <LocaleSwitcher />
        <SignOutButton locale={locale} />
      </div>
    </header>
  );
}
