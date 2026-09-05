'use client';

import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';

import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/**
 * A box that is ticked or not.
 *
 * Base UI's root, which renders the visible control plus a hidden native
 * `<input type="checkbox">` alongside it — so this posts `name=on` in an
 * ordinary form and can be wrapped in a `<label>` without a `for`.
 *
 * ## The unchecked edge is `--control-edge`, not `--input`
 *
 * ⚠ **It used to be `--input`, and unchecked the control was invisible.**
 *
 * That token is documented as a deliberate sub-3:1 trade, and the reasoning is
 * sound for what it was written about: a text field is a 48px box with a
 * `Label` over it, so a faint hairline still leaves a reader something to find.
 * A checkbox has none of that. Unchecked it has no fill, no size and no label
 * of its own — the 1px line *is* the whole control — and on the tinted card the
 * measurement dialog's decisions sit on, c-300 measured about 1.4:1. Ticking
 * the box and unticking it looked less like a state change than like the
 * control breaking, which is how it was reported.
 *
 * `--control-edge` exists for this: the boundary of a control whose *shape*
 * carries its state. See its note in `globals.css` for the stops and the ratios.
 *
 * ## The rest is the app's, not upstream's
 *
 * Focus is the app's — a 2px `--ring` band held off the control by a
 * `--focus-halo` offset — the same treatment `Button`, `Segmented` and `Switch`
 * wear. shadcn's `ring-3 ring-ring/50` plus a recoloured border was a third
 * focus language in a system that has one.
 *
 * The offset is 1px rather than the usual 2, as `SegmentedOption`'s is. On a
 * 40px button a 2px dark band plus a 2px ring is a hairline; on a 16px box it
 * is a quarter of the control's width added to each side, and the checkbox read
 * as sitting in a black bracket. The dark band still earns its place at 1px —
 * without it the green ring would run straight into the green fill of a ticked
 * box, which is the whole reason `--focus-halo` exists.
 *
 * The `dark:` variants are gone. Every colour here is a semantic token and the
 * tokens already carry their dark values (`globals.css`), so a `dark:` variant
 * could only ever disagree with them — which is why almost nothing else in this
 * folder has one.
 *
 * The `after:` pseudo-element is upstream's and worth keeping: it grows the hit
 * area to 40×32 without changing the 16px drawing, so a checkbox that is *not*
 * wrapped in a label still clears the touch floor.
 */
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px]',
        'border border-control-edge transition-colors outline-none',
        'after:absolute after:-inset-x-3 after:-inset-y-2',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-focus-halo',
        'data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground',
        'aria-invalid:border-destructive aria-invalid:aria-checked:border-primary',
        'group-has-disabled/field:opacity-50 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <Icon name="check" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
