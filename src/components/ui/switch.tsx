import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * A 44×24 track with a 20px disc — shadcn/ui's switch, drawn in this palette.
 *
 * **It used to be the old Qiwam switch (§9.3): 52×30, with a 24px knob carrying a
 * 9px corner sweep that rotated −45° into the leaf angle as it landed.** That
 * drawing is gone, everywhere, by decision — see §"Controls built from §9.3" in
 * `docs/design-system.md`, which has been rewritten to match. The `knob` prop
 * that chose between the leaf and a plain disc went with it: there is one
 * drawing now, so there is nothing to choose. Nothing in the app passed it.
 *
 * What did **not** change is everything about how this control behaves, and
 * that part is load-bearing:
 *
 * **A `<button>`, not an `<input type="checkbox">`, and not a Radix root.**
 * Every switch in this app saves a server-held setting, so each one is the
 * submit control of its own form: it carries `name`/`value`, posts the value it
 * would move to, and works with JavaScript off. shadcn's own switch is a Radix
 * primitive driven by `onCheckedChange` — a controlled component that submits
 * nothing — so taking it wholesale would have traded a working no-JS settings
 * screen for a drawing. The drawing is what was asked for; the drawing is what
 * changed. `role="switch"` + `aria-checked` is the ARIA pattern for exactly
 * this, and Space and Enter already activate a button, so no key handling is
 * invented.
 *
 * **The 24px track still sits inside a 48px target.** §9.3 requires 48px and
 * the track is 24, so the button is padded out to reach it — the tappable area
 * is the whole row-end rather than a shape the size of a fingernail. This
 * matters more than it did: the new track is 6px shorter than the old one, and
 * without the padded target the control would have shrunk below the touch floor
 * rather than merely looking lighter.
 *
 * **The disc still travels on `inset-inline-start`.** shadcn moves its thumb
 * with `translate-x`, which is a physical direction and would slide the wrong
 * way in Arabic. A logical inset describes the travel once and runs correctly in
 * both scripts (§RTL) — the one place this deliberately departs from the
 * upstream component's implementation rather than its appearance.
 *
 * `border-2 border-transparent` is upstream's, and it is padding rather than an
 * edge: it insets the disc by 2px on every side so the track reads as a groove
 * the disc sits *in*. The off fill carries the visible boundary instead.
 */
export function Switch({
  checked,
  className,
  ...props
}: Omit<React.ComponentProps<'button'>, 'role' | 'aria-checked'> & {
  checked: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-slot="switch"
      className={cn(
        // The 48px target, drawn as padding around the 44×24 track.
        'group/switch inline-grid size-12 shrink-0 place-items-center rounded-full',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          'relative block h-6 w-11 rounded-full border-2 border-transparent shadow-xs transition-colors duration-200 ease-out',
          /*
            Upstream's flat `bg-input` off.

            ⚠ **This was `bg-input/60`, and the reason for the 60% expired.** It
            was written when `--input` was n-500 (#837F6E) — a dark warm grey
            picked to read as a 1px line, which poured into a 44×24 slab made
            the off state heavier than the on state. The token has since moved
            two steps lighter, to c-300 (#D1D5DB), and 60% of that composites to
            about #E3E6EA: roughly 1.2:1 against the card, so the off track had
            faded to the point where the switch read as a disc floating on
            nothing.

            Flat c-300 measures ~1.5:1 and `--primary` ~1.9:1, so the off state
            is still the quieter of the two — which is the only thing the 60%
            was ever there to guarantee.
          */
          checked ? 'bg-primary' : 'bg-input',
        )}
      >
        <span
          className={cn(
            'absolute top-0 block size-5 rounded-full bg-card shadow-sm',
            'transition-[inset-inline-start] duration-[220ms] ease-[cubic-bezier(.2,.6,.2,1)] motion-reduce:transition-none',
            /*
              `start-*` is `inset-inline-start`, measured from the padding box —
              the 2px border is outside it, so `start-0` already sits the disc
              2px in from the track's edge. The padding box is 40×20 and the disc
              is 20, so 20px is the full travel and there is no arithmetic to
              keep in sync with the track's width beyond that pair.

              There is nothing to rotate any more: the leaf sweep is gone, and a
              disc that turned would cost a repaint to move nothing.
            */
            checked ? 'start-5' : 'start-0',
          )}
        />
      </span>
    </button>
  );
}
