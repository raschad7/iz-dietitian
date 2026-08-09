/**
 * The ambient green glow behind the portal's home screen alone — every other
 * tab stays plain `bg-background`. `position: fixed` so it paints behind the
 * header too, not just the `<main>` column below it; `-z-10` keeps it under
 * every normal-flow surface without either needing its own `z-10`, the same
 * stacking-context trick a modal's scrim relies on. `md:hidden` because the
 * shape and its `.portal-home-glow` ratios were tuned for a phone frame — the
 * sidebar layout above `md` never showed it in the design.
 *
 * A server component: nothing here reads the browser.
 */
export function HomeGlow() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden md:hidden">
      <div className="portal-home-glow" />
    </div>
  );
}
