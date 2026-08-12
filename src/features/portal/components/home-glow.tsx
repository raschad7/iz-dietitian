'use client';

import { usePathname } from '@/i18n/navigation';

/**
 * The ambient green glow behind the portal's home screen alone — every other
 * tab stays plain `bg-background`. It spans the shell's full width so it paints
 * behind the header too, not just the `<main>` column below it; `-z-10` keeps
 * it under every normal-flow surface without either needing its own `z-10`, the
 * same stacking-context trick a modal's scrim relies on.
 *
 * ## Why it scrolls with the page rather than staying put
 *
 * ⚠ It was `fixed inset-0` — pinned to the viewport — and that was invisible
 * for as long as the home screen was a `100dvh` frame that could not scroll.
 * Once the page scrolled as one document the wash stayed welded to the top of
 * the *screen* while the content slid up through it, so the day's meal cards
 * climbed into the green a section at a time. A wash that content passes
 * through is not an ambient background; it is a green stripe across the middle
 * of the page.
 *
 * The green belongs to the top of the *page* — the header, the greeting, the
 * commitment card — so it is anchored there and leaves with them. `h-dvh` is
 * the same box `inset-0` gave it, measured from the top of the portal shell
 * instead of from the top of the viewport, which is what reproduces the
 * original geometry exactly before the first scroll.
 *
 * `PortalTheme` carries the `relative` this positions against. It is the
 * outermost portal wrapper and spans the whole document column, so `top-0` is
 * the top of the portal rather than the top of `<body>` — which stays true if
 * anything is ever added above the shell.
 *
 * **Every width, with no breakpoint of its own.** It carried `md:hidden` for a
 * long time, on the reasoning that the sidebar layout above `md` never showed
 * the glow in the design. That is not worth what it costs: the home screen's
 * identity *is* this wash, and a tablet or a desktop opening on a plain white
 * page is not the same product.
 *
 * What that gate was really protecting against was the **shape**, not the
 * layout. `.portal-home-glow` was written as ratios of the viewport *width*, so
 * on a wide screen its height ran to more than twice the viewport and every
 * blurred edge fell off screen — a flat green page rather than a wash. The rule
 * in `globals.css` re-bases the vertical on viewport height from `md` up, which
 * is what makes turning this on everywhere possible; the arithmetic is in the
 * note beside it.
 *
 * Because the green is behind the header at every width, `PortalHeader` draws
 * its bell, gear, greeting and name white at every width too — one rule, rather
 * than a pair of breakpoints that have to be kept in step. Getting that pairing
 * wrong is what made those controls invisible on an iPad: the glow stopped at
 * `md` and the white did not. ⚠ That is the trap to remember if `md:hidden`
 * is ever proposed again — it has to move together with `PortalHeader`'s
 * `iconTone` and the greeting's own white, or the bell, the gear, the greeting
 * and the client's name go white on a white page from 768px up.
 *
 * ## Why it is rendered from the layout, and why it knows its own route
 *
 * It used to be a server component rendered by `(tabs)/page.tsx`, and it was
 * quietly broken: `(tabs)/template.tsx` is `.q-route-stage`, which carries
 * `animation: q-route-enter-* … both` — and that animation's `from` frame sets
 * a `transform`. **An ancestor with a transform becomes the containing block
 * for `position: absolute`/`fixed` descendants**, so `inset-0` stopped meaning
 * "the page" and started meaning "the template's box": the glow began exactly
 * where `main`'s content began, left a gutter down each side the width of
 * `main`'s own `px-4`, and no amount of unfilling the header above it could
 * make the green reach the top, because the green was never up there to begin
 * with. A transform captures both kinds of positioning, so this still applies
 * now the wash is `absolute` rather than `fixed`.
 *
 * Rendering it from `(tabs)/layout.tsx` puts it *outside* that stage, where its
 * own `relative` ancestor (`PortalTheme`) is the containing block instead. The
 * cost is that the layout is shared by all five tabs and cannot ask the router
 * which one it is serving, so this reads the path itself — the same
 * `usePathname() === '/portal'` test `PortalHeader` already makes to decide
 * whether to draw the greeting, so the glow and the unfilled header can never
 * disagree about which screen is home.
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
    // `top-0 h-dvh`, not `inset-0`: the shell this is measured against is the
    // whole document column, so `inset-0` would stretch the clip box the
    // length of the page. One viewport tall from the top is the same box the
    // old `fixed inset-0` gave it, which is what reproduces the original
    // geometry exactly before the first scroll.
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-dvh overflow-hidden"
    >
      <div className="portal-home-glow" />
    </div>
  );
}
