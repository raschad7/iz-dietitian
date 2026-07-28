import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { SignOutButton } from '@/components/layout/sign-out-button';
import { type Locale } from '@/i18n/routing';

/**
 * Top bar for both signed-in areas.
 *
 * Sign-out lives here rather than in the sidebar because the sidebar is hidden
 * below `md`, and the client portal has no sidebar at all.
 */
export function Header({
  title,
  userName,
  locale,
}: {
  title: string;
  userName?: string;
  locale: Locale;
}) {
  return (
    <header className="flex h-14 items-center gap-4 border-b border-border px-4">
      <h1 className="truncate text-sm font-semibold">{title}</h1>

      <div className="ms-auto flex items-center gap-3">
        {userName ? <span className="hidden text-sm text-muted-foreground sm:inline">{userName}</span> : null}
        <LocaleSwitcher />
        <SignOutButton locale={locale} />
      </div>
    </header>
  );
}
