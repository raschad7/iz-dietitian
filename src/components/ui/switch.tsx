import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * The Qiwam switch (§9.3): a 52×30 track with a 24px knob that slides and
 * rotates −45° into the leaf angle as it lands.
 *
 * **A `<button>`, not an `<input type="checkbox">`.** Every switch in this app
 * saves a server-held setting, so each one is the submit control of its own
 * form: it carries `name`/`value`, posts the value it would move to, and works
 * with JavaScript off. A checkbox would need a script to submit at all.
 * `role="switch"` + `aria-checked` is the ARIA pattern for exactly this, and
 * Space and Enter already activate a button, so no key handling is invented.
 *
 * **The 30px track sits inside a 48px target.** §9.3 requires 48px, and the
 * track is 30 — the button is padded to reach it, so the tappable area is the
 * whole row-end rather than a shape the size of a thumbnail.
 *
 * The knob moves on `inset-inline-start`, which is a logical property: in
 * Arabic it travels right-to-left with no RTL override. Its own corner sweep is
 * 9px, the Arc at knob scale — see `knob` below for the plain disc, and for why
 * a column of these wants one.
 */
export function Switch({
  checked,
  knob = 'leaf',
  className,
  ...props
}: Omit<React.ComponentProps<'button'>, 'role' | 'aria-checked'> & {
  checked: boolean;
  /**
   * The shape of the moving part.
   *
   * `leaf` is §9.3's own drawing and the default: a 9px sweep on the
   * block-end/inline-end corner that rotates into the leaf angle as the knob
   * lands. `round` is a plain disc that slides and does not turn.
   *
   * It is a prop rather than a second switch because a list of them is a
   * different object from a single one: on the record's notification rows, four
   * knobs sit in a column two rows apart, and four leaves rotating in and out of
   * alignment turned a settings list into something that flickers as you read
   * down it. One switch on a form is a detail; four in a stack is a texture.
   */
  knob?: 'leaf' | 'round';
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-slot="switch"
      className={cn(
        // The 48px target, drawn as padding around the 52×30 track.
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
          'relative block h-[30px] w-[52px] rounded-full transition-colors duration-200 ease-out',
          checked ? 'bg-primary' : 'bg-input/60',
        )}
      >
        <span
          className={cn(
            'absolute top-[3px] block size-6 rounded-full bg-card shadow-card',
            // The Arc at knob scale — logical, so it mirrors in Arabic.
            knob === 'leaf' && 'rounded-ee-[9px]',
            'transition-[inset-inline-start,transform] duration-[220ms] ease-[cubic-bezier(.2,.6,.2,1)] motion-reduce:transition-none',
            // `start-*` is `inset-inline-start`: the knob's travel is described
            // once and runs the correct way in both scripts. The rotation goes
            // with the sweep — there is nothing to turn on a disc, and turning
            // it anyway would cost a repaint to move nothing.
            checked ? 'start-[25px]' : 'start-[3px]',
            checked && knob === 'leaf' && '-rotate-45',
          )}
        />
      </span>
    </button>
  );
}
