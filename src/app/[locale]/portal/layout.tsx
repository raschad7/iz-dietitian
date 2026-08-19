import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { PortalTheme } from '@/features/portal/components/portal-theme';
import { PORTAL_THEME_COLOR } from '@/features/portal/pwa/brand';
import { ServiceWorkerRegister } from '@/features/portal/pwa/service-worker-register';
import { requirePortalClient } from '@/features/portal/session';
import { resolveLocale } from '@/i18n/params';

type PortalLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

/**
 * PWA metadata for the client portal only — never the staff app. Scoped here
 * rather than in the root layout so `<link rel="manifest">`, the theme-color
 * meta tag and the apple-web-app tags appear solely on `/portal/*` pages;
 * everything under `(secured)`/`(screen)`/`(tabs)` and `set-password` inherits
 * it, nothing outside `/portal` does.
 *
 * `manifest` points at the per-locale Route Handler in
 * `portal/manifest.webmanifest/route.ts`, not a static file — the portal's
 * `start_url`/`scope` need to carry the locale prefix every portal URL
 * already has (`routing.localePrefix: 'always'`).
 */
export async function generateMetadata({ params }: Omit<PortalLayoutProps, 'children'>): Promise<Metadata> {
  const locale = await resolveLocale(params);

  return {
    manifest: `/${locale}/portal/manifest.webmanifest`,
    icons: {
      icon: '/api/pwa-icons/192',
      apple: '/api/pwa-icons/apple-180',
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
    },
  };
}

/**
 * `themeColor` moved out of `metadata` and into its own export in the App
 * Router; putting it here (rather than the root layout) keeps the staff app's
 * browser chrome untouched. The portal is fixed to light appearance
 * (`PortalTheme` below), so there is one theme color, not a dark-mode pair.
 *
 * **`viewportFit: 'cover'` now lives in the root layout**, so this export no
 * longer needs to mention it and must not restate it. It used to say the
 * opposite — that `cover` was deliberately left off and `PortalTabBar`'s
 * `env(safe-area-inset-bottom)` therefore resolved to `0`. That was true and it
 * was the bug: an installed portal was letterboxed inside the safe area with
 * the theme colour filling the margin, which is what "the PWA has cut edges"
 * describes. See the `viewport` export in `[locale]/layout.tsx` for the whole
 * of the reasoning, and `--q-safe-b` in `globals.css` for the inset every
 * block-end surface now carries.
 *
 * Only `themeColor` is declared here, and only because it is portal-specific:
 * Next merges a nested viewport export over its parent field by field, so
 * naming a field here would silently replace the app-wide one.
 */
export function generateViewport(): Viewport {
  return {
    themeColor: PORTAL_THEME_COLOR,
  };
}

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

      `relative` is the other half of that: it gives `HomeGlow` a containing
      block to be `absolute` against — see the note there on why it moved off
      `position: fixed`, and why the wash now belongs to the top of the *page*
      rather than staying welded to the top of the screen while the cards slide
      up through it. Stacking context and containing block are separate
      mechanisms, so both declarations are needed and neither implies the other.

      `portal-shell` is the other hat this wrapper wears: it is the scope for
      the two portal-only rules in `globals.css` — the rail held back to `lg`,
      and the shell's own `<main>` unpainted so the glow can show through it.
      Both live beside `.portal-home-glow`.

      This wrapper is a `min-h-dvh` column that grows on every tab, home
      included, and the window does the scrolling. It was a clipped `100dvh`
      frame on the home tab for a while, so that the meal list inside it could
      be the only thing that scrolled; the ⚠ note beside that rule records why
      the screen went back to scrolling as one document.
    */
    <PortalTheme className="portal-shell relative isolate flex min-h-dvh flex-col bg-background text-foreground">
      {/*
        Registered once for the whole client area, including `set-password` —
        renders nothing, so it carries no chrome or layout weight here. See
        the component for why registration lives outside `requirePortalClient`'s
        result rather than depending on it.
      */}
      {/*
        The `beforeinstallprompt` capture is no longer rendered here: an inline
        script emitted from a layout that re-renders on the client never runs.
        It is in the root locale layout's <head> instead — see
        `InstallPromptCapture` for why, and `use-install-prompt.ts` for how the
        event is picked back up.
      */}
      <ServiceWorkerRegister locale={locale} />

      {children}
    </PortalTheme>
  );
}
