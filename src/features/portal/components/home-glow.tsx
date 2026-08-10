'use client';

import { usePathname } from '@/i18n/navigation';

/**
 * The ambient green glow behind the portal's home screen alone — every other
 * tab stays plain `bg-background`. `position: fixed` so it paints behind the
 * header too, not just the `<main>` column below it; `-z-10` keeps it under
 * every normal-flow surface without either needing its own `z-10`, the same
 * stacking-context trick a modal's scrim relies on. `md:hidden` because the
 * shape and its `.portal-home-glow` ratios were tuned for a phone frame — the
 * sidebar layout above `md` never showed it in the design.
 *
 * ## Why it is rendered from the layout, and why it knows its own route
 *
 * It used to be a server component rendered by `(tabs)/page.tsx`, and it was
 * quietly broken: `(tabs)/template.tsx` is `.q-route-stage`, which carries
 * `animation: q-route-enter-* … both` — and that animation's `from` frame sets
 * a `transform`. **An ancestor with a transform becomes the containing block
 * for `position: fixed` descendants**, so `inset-0` stopped meaning "the
 * viewport" and started meaning "the template's box": the glow began exactly
 * where `main`'s content began, left a gutter down each side the width of
 * `main`'s own `px-4`, and no amount of unfilling the header above it could
 * make the green reach the top, because the green was never up there to begin
 * with.
 *
 * Rendering it from `(tabs)/layout.tsx` puts it *outside* that stage, where
 * `fixed` means what it says. The cost is that the layout is shared by all
 * five tabs and cannot ask the router which one it is serving, so this reads
 * the path itself — the same `usePathname() === '/portal'` test `PortalHeader`
 * already makes to decide whether to draw the greeting, so the glow and the
 * unfilled header can never disagree about which screen is home.
 *
 * The other half of the fix is on the portal's own root: `PortalTheme` carries
 * `isolate`. Without a stacking context there, a `-z-10` element paints below
 * the *background* of every ancestor between it and the root — including that
 * wrapper's own `bg-background` — so hoisting the glow out of the stage would
 * have swapped one invisible glow for another.
 */
export function HomeGlow() {
  const pathname = usePathname();

  if (pathname !== '/portal') return null;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden md:hidden">
      <div className="portal-home-glow" />
    </div>
  );
}
