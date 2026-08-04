import type { ReactNode } from 'react';

import { type ThemePreference } from '@/features/portal/types';

/**
 * The client app's appearance, applied to the client app alone.
 *
 * **Why the attribute goes here and not on `<html>`.** The practitioner
 * dashboard and the client portal share a root layout. A theme written to the
 * document element would be a client's phone deciding what colour their
 * dietitian's calendar is, which is not a setting anybody asked for. This
 * wrapper is the portal's own root, so `[data-theme]` reaches every portal
 * screen and stops exactly at its edge.
 *
 * **Why there is no JavaScript in here.** `system` is resolved by a media query
 * in `globals.css`, not by reading `matchMedia` after hydration. A script that
 * resolves the theme has already lost — the first paint happened before it ran
 * — and one that resolves it on the server cannot know the device's setting at
 * all. The attribute is rendered once, the browser matches it, and a phone
 * switching to dark at sunset re-matches with no code involved.
 *
 * A server component: it renders an attribute and a `div`, and there is nothing
 * on this path that needs the browser.
 */
export function PortalTheme({
  preference,
  className,
  children,
}: {
  preference: ThemePreference;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div data-theme={preference} className={className}>
      {children}
    </div>
  );
}
