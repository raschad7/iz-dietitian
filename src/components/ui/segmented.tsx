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
 * The track is a card rather than a sunken well: white, hairline, the card
 * shadow. A cream track on a white page drew a grey slab across the top of the
 * screen, and the switch read as a strip of background rather than as the
 * control it is. Raising it puts it on the same plane as the cards it filters,
 * which is the truth about what it does. Same tokens, same states, same
 * semantics as `default`.
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
        pill && 'w-full rounded-lg border-transparent bg-card p-1 shadow-card ring-1 ring-foreground/10',
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
              pill && 'relative h-11 flex-1 rounded-[12px] px-3 py-0 font-semibold',
              // `activeClassName` rather than the olive literal, so a caller can
              // repaint the selected half; it defaults to that same olive, which
              // is what every shape draws unless told otherwise.
              active
                ? cn(activeClassName, 'scale-100 shadow-card')
                : inactiveClassName
                  ? inactiveClassName
                  : pill
                  ? // The track is white now, so an unselected half can take
                    // `muted-foreground` (6.38:1 there) and let the selected one
                    // hold the colour. On the old cream track that pairing was
                    // the one to avoid — it measured under 4.5:1 — and this half
                    // had to carry full-strength foreground instead.
                    //
                    // The `scale-[0.99] hover:scale-100` this line carried on
                    // `main` is deliberately not merged: it grew the half under
                    // the pointer, and geometry here does not move (§Shape —
                    // "hover is carried by the ring and the fill instead"). On
                    // the cream track it was also compensating for a hover fill
                    // that barely registered; on the white one the fill does the
                    // work on its own.
                    'text-muted-foreground hover:bg-muted hover:text-foreground'
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
 * The shell and the active segment each carry a swept corner — §9.3's own
 * drawing, and not a nested-surface violation: the segment is the control's
 * moving part, not a card inside a card.
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
        'inline-flex max-w-full gap-1 rounded-md rounded-ee-xl border border-border bg-muted p-1',
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
        'min-h-10 min-w-0 rounded-[9px] rounded-ee-[18px] px-3 text-sm font-semibold whitespace-nowrap',
        'transition-all duration-[180ms] ease-[cubic-bezier(.2,.6,.2,1)] motion-reduce:transition-none',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo',
        'disabled:pointer-events-none disabled:opacity-50',
        selected
          ? 'bg-primary text-primary-foreground shadow-card'
          : 'text-muted-foreground hover:bg-card hover:text-foreground',
        className,
      )}
      {...props}
    />
  );
}
