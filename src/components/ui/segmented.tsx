'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * A segmented control: two to four mutually exclusive options, all visible.
 *
 * Two screens were hand-rolling this with the same markup and nearly the same
 * classes — the calendar's day/week/month switch and the login role switch —
 * which is how a design system drifts.
 *
 * ## Semantics
 *
 * `role` is a prop rather than a fixed value because the two callers mean
 * different things. The calendar switches which *view* of the same page is
 * shown, which is a tablist. The login switch picks which *form* to fill in,
 * which is a radio group. Announcing either as the other misleads a screen
 * reader, and the visual treatment is identical, so the choice belongs to the
 * caller.
 *
 * ## Shape
 *
 * The track carries the radius; the thumb takes a smaller one, so it reads as
 * sitting inside the track rather than as a second track. The thumb moves by
 * re-tinting rather than by translating a shared element,
 * because the options are not a fixed width in two languages and an animated
 * offset would need measuring on every locale change.
 *
 * `shape="pill"` is the phone form: a track spanning the row with two equal
 * halves inside it. It exists because a switch that is the *first* thing on a
 * screen — the portal's upcoming/past appointments — is being aimed at with a
 * thumb rather than a pointer, and a 40px control hugging its own labels in the
 * corner is neither findable nor comfortably tappable.
 *
 * **The track is the well and the selected half is the raised thumb** — the
 * shadcn tab shape: a quiet neutral groove with a white, shadowed segment
 * sitting in it. That inverts what this shape used to draw, which was a white
 * card track with an olive-tinted half inside; a raised track holding a tinted
 * segment reads as two surfaces at the same height with one of them coloured
 * in, and it spent the brand hue on a filter. Here the *elevation* carries the
 * state instead of the colour, so nothing on the screen has to compete with it,
 * and the label goes to full-strength foreground where it was olive.
 *
 * `default` keeps its own treatment: it is bordered rather than filled and is
 * used inside toolbars where a grey well would be a third box.
 */
type SegmentedOption<T extends string> = {
  value: T;
  label: React.ReactNode;
};

function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  role = 'tablist',
  size = 'default',
  shape = 'default',
  className,
  activeClassName = 'bg-primary text-primary-foreground',
  inactiveClassName,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for a screen reader, e.g. "Calendar view". */
  label: string;
  role?: 'tablist' | 'radiogroup';
  size?: 'default' | 'sm';
  /** `pill` fills its row with equal, fully rounded halves. See above. */
  shape?: 'default' | 'pill';
  className?: string;
  /** The selected option's fill. Defaults to the primary olive used everywhere else. */
  activeClassName?: string;
  /**
   * The unselected options, replacing the default grey-plus-hover-fill.
   *
   * Its twin `activeClassName` exists so the calendar can repaint the selected
   * segment; this is the other half of the same seam. Pass a class list with no
   * `hover:` in it and the segments stop answering the pointer — which the
   * calendar's view switch wants and the login role switch does not.
   *
   * It replaces rather than appends, because switching a hover *off* by adding
   * classes means naming every property the default sets and trusting
   * tailwind-merge to unpick each one.
   */
  inactiveClassName?: string;
}) {
  const isTablist = role === 'tablist';
  const pill = shape === 'pill';

  return (
    <div
      role={role}
      aria-label={label}
      className={cn(
        'inline-flex rounded-lg border border-border p-0.5',
        /*
         * 44px segments inside 4px of track, so the control lands at 52px and
         * every half clears the touch minimum on its own. `w-full` rather than
         * a width on the caller: two equal halves is what makes this shape
         * readable as one switch instead of two chips.
         */
        // The neutral well. No ring and no shadow — the track is the recess,
        // and the selected half is the only thing on this control that lifts.
        pill && 'w-full rounded-[14px] border-transparent bg-muted p-1',
        /*
         * `sm` is pinned to 40px so the control matches `Button size="sm"` and
         * a 40px field beside it — the height is set on the *track*, and the
         * options fill it, because the track is what someone measures the
         * control by. It used to be ~26px of text padding, which left the one
         * switch in a toolbar visibly shorter than everything around it.
         *
         * `default` is unchanged: the login role switch and the client tabs
         * are its only callers and neither sits in a row of 40px controls.
         */
        size === 'sm' && 'h-10',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            role={isTablist ? 'tab' : 'radio'}
            aria-selected={isTablist ? active : undefined}
            aria-checked={isTablist ? undefined : active}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex items-center justify-center rounded-md font-medium',
              'transition-[color,background-color,box-shadow,transform] duration-(--duration-label) ease-(--ease-sweep)',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-focus-halo focus-visible:outline-none',
              // `h-full`: the track owns the height (see above), the option
              // owns its inline padding.
              size === 'sm' ? 'h-full px-4 text-label' : 'px-3 py-2 text-body-md',
              // 12px, which is the track's 16px less the 4px of padding around
              // it: concentric, so the half sits inside the track rather than
              // looking pasted onto it.
              // 10px against the track's 14px less its 4px of padding:
              // concentric, so the half sits inside the well rather than
              // looking pasted onto it.
              pill && 'relative h-11 flex-1 rounded-[10px] px-3 py-0 font-semibold',
              // `activeClassName` rather than the olive literal, so a caller can
              // repaint the selected half; it defaults to that same olive, which
              // is what every shape draws unless told otherwise.
              active
                ? cn(activeClassName, 'scale-100 shadow-card')
                : inactiveClassName
                  ? inactiveClassName
                  : pill
                  ? // Label colour alone, with no hover fill of its own: the
                    // track *is* a fill, so tinting a half on hover puts a
                    // second grey inside the first and reads as a half that has
                    // half-selected itself. Darkening the label is the whole
                    // hover, which is what leaves the white thumb as the only
                    // thing that ever marks the selection.
                    //
                    // The `scale-[0.99] hover:scale-100` this line carried on
                    // `main` is deliberately not merged: it grew the half under
                    // the pointer, and geometry here does not move (§Shape —
                    // "hover is carried by the ring and the fill instead").
                    'text-muted-foreground hover:text-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-secondary-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export { Segmented };

/**
 * The form-submit sibling of `Segmented`, above.
 *
 * That one is a controlled client component for a choice that only changes
 * *what this page shows* — the calendar's day/week/month view, the login
 * role. This one is for a choice that is really a setting: the portal's theme
 * and language pickers, and its own plan-adherence log. Each segment there is
 * a real submit button carrying `name`/`value`, so choosing one posts it and
 * the control works with JavaScript off — there is no `onChange` anywhere
 * near it, and no client component wrapping it either.
 *
 * `role="radio"`/`role="group"` would promise arrow-key navigation that plain
 * buttons do not provide; `aria-pressed` inside a labelled group describes
 * what is actually here, and Tab and Enter behave as a keyboard user expects
 * with no key handling invented.
 *
 * ⚠ **No swept corner, and no olive.** Both were here: the shell and the
 * selected segment each drew one corner at roughly twice the radius of the
 * other three (§9.3's own motif), and the selection was a solid olive fill.
 *
 * The sweep is gone because the corner it lands on is `inset-block-end
 * inset-inline-end` — logical, so in Arabic it resolves to the *bottom left*,
 * and on the settings screen it read as one corner of a two-button strip having
 * come unstuck rather than as a deliberate mark. A motif that only announces
 * itself as a mistake is not carrying its own weight at this size.
 *
 * The olive is gone because this control is a *preference*, not an action. A
 * solid brand fill is the loudest thing the system has, and spending it on
 * "which language is on" put the settings screen's strongest colour on the one
 * row nobody came for. The selection is now the same white-thumb-in-a-grey-well
 * shape `Segmented shape="pill"` draws above — elevation carrying the state
 * instead of hue — so the portal's two switches are one control in two places.
 */
export function SegmentedGroup({
  label,
  className,
  ...props
}: Omit<React.ComponentProps<'div'>, 'role' | 'aria-label'> & { label: string }) {
  return (
    <div
      role="group"
      aria-label={label}
      data-slot="segmented"
      className={cn(
        // `max-w-full` so a long option set wraps inside its row rather than
        // pushing the page into a horizontal scroll on a narrow phone.
        //
        // One radius on all four corners, and no border: the grey fill is
        // already the edge of the well, so a hairline around it drew a second
        // one a pixel outside the first.
        'inline-flex max-w-full gap-1 rounded-[14px] bg-muted p-1',
        className,
      )}
      {...props}
    />
  );
}

export function SegmentedOption({
  selected,
  className,
  ...props
}: Omit<React.ComponentProps<'button'>, 'aria-pressed'> & { selected: boolean }) {
  return (
    <button
      aria-pressed={selected}
      data-slot="segmented-option"
      className={cn(
        // 10px against the well's 14px less its 4px of padding — concentric,
        // and the same pair `shape="pill"` above uses.
        'min-h-10 min-w-0 rounded-[10px] px-3 text-sm font-semibold whitespace-nowrap',
        'transition-all duration-[180ms] ease-[cubic-bezier(.2,.6,.2,1)] motion-reduce:transition-none',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo',
        'disabled:pointer-events-none disabled:opacity-50',
        selected
          ? 'bg-card text-foreground shadow-card'
          : // No hover fill — see the pill above: a tint inside the well is a
            // second grey, and it reads as a half-selected segment.
            'text-muted-foreground hover:text-foreground',
        className,
      )}
      {...props}
    />
  );
}
