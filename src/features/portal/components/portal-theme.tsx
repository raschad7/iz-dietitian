import type { ReactNode } from 'react';

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
 * **Always light.** The portal no longer offers a dark or system-matched
 * appearance — `data-theme` is fixed rather than read from a stored
 * preference, so there is nothing left for a phone's dark mode to switch.
 *
 * A server component: it renders an attribute and a `div`, and there is nothing
 * on this path that needs the browser.
 */
export function PortalTheme({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div data-theme="light" className={className}>
      {children}
    </div>
  );
}
