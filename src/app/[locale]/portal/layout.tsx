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
    /*
      `isolate` makes this wrapper a stacking context, which is what the home
      screen's glow needs to be visible at all. It is a `-z-10` layer, and a
      negative-z element paints below the *background* of every ancestor
      between it and the nearest stacking context — so without one here it would
      land under this wrapper's own `bg-background` and disappear. Inside a
      context it paints above that fill and below every in-flow surface, which
      is exactly the layer it wants. The portal's two other stacked pieces (the
      tab bar at `z-40`, the flame celebration at `z-50`) keep their order:
      they are both inside this wrapper, so they are only ever ranked against
      each other.

      `relative` is the other half of that: the glow is `absolute`, not `fixed`
      — it belongs to the top of the *page* and scrolls away with the header
      rather than staying welded to the top of the screen while the meal cards
      slide up through it. This wrapper is what it measures `top-0` against.
      Stacking context and containing block are separate mechanisms, so both
      declarations are needed and neither implies the other.

      `portal-shell` is the other hat this wrapper wears: it is the scope for
      the two portal-only rules in `globals.css` — the rail held back to `lg`,
      and, on the home tab alone, the shell's own `<main>` unpainted so the
      glow above can show through it. Both live beside `.portal-home-glow`.

      This wrapper stays a `min-h-dvh` column that grows on every tab. It was a
      `100dvh` frame on the home tab for a while, so that the meal list inside
      it could be the only thing scrolling; see the ⚠ note beside that rule for
      why the screen went back to scrolling as one document.
    */
    <PortalTheme className="portal-shell relative isolate flex min-h-dvh flex-col bg-background text-foreground">
      {children}
    </PortalTheme>
  );
}
