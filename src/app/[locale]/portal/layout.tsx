import type { ReactNode } from 'react';

import { PortalTheme } from '@/features/portal/components/portal-theme';
import { requirePortalClient } from '@/features/portal/session';
import { resolveLocale } from '@/i18n/params';

type PortalLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

/**
 * Shell for the whole client area: authenticates, sets the client app's
 * appearance, and nothing more.
 *
 * **What is deliberately not here.** Neither the navigation nor the header.
 * Both are in `(secured)/(tabs)/layout.tsx`, alongside the
 * `mustChangePassword` guard, because a client who has not yet replaced their
 * temporary password can reach exactly one page — offering them five tabs that
 * all bounce back to it would be a shell with no floor. `set-password` carries
 * its own header for the same reason, so it still has a way out.
 *
 * That guard is in a route group because route groups do not appear in the
 * URL: `/portal` still resolves to `(secured)/(tabs)/page.tsx` while
 * `/portal/set-password` is reached through this layout alone. Putting the
 * check here instead would lock every client out permanently — in the App
 * Router a nested layout wraps its parent rather than replacing it, so
 * `set-password` would inherit the redirect and bounce to itself forever.
 *
 * ## Appearance
 *
 * The portal's appearance is fixed to light here, on a wrapper this area owns.
 * It never reaches `<html>`, so the practitioner app's chrome is untouched —
 * `PortalTheme` explains how.
 */
export default async function PortalLayout({ children, params }: PortalLayoutProps) {
  const locale = await resolveLocale(params);

  await requirePortalClient(locale);

  return (
    <PortalTheme className="flex min-h-dvh flex-col bg-background text-foreground">{children}</PortalTheme>
  );
}
