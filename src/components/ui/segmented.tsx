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
 * `shape="pill"` is the phone form: a filled cream track spanning the row with
 * two equal halves inside it, both fully rounded. It exists because a switch
 * that is the *first* thing on a screen — the portal's upcoming/past
 * appointments — is being aimed at with a thumb rather than a pointer, and a
 * 40px control hugging its own labels in the corner is neither findable nor
 * comfortably tappable. The track drops its hairline in this shape: at full
 * width the fill already draws the boundary, and the border only added a second
 * edge around it. Same tokens, same states, same semantics as `default`.
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
        pill && 'w-full rounded-full border-transparent bg-muted p-1',
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
              'flex items-center justify-center rounded-md font-medium transition-colors duration-180',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-focus-halo focus-visible:outline-none',
              // `h-full`: the track owns the height (see above), the option
              // owns its inline padding.
              size === 'sm' ? 'h-full px-4 text-label' : 'px-3 py-2 text-body-md',
              pill && 'h-11 flex-1 rounded-full px-3 py-0 font-semibold',
              active
                ? 'bg-primary text-primary-foreground'
                : pill
                  ? // An unselected half sits on the track, not on the page, so
                    // `muted-foreground` on `muted` is the one pairing to avoid
                    // here — it measures under 4.5:1. Full-strength foreground
                    // instead, with the weight and the fill carrying the state.
                    'text-foreground hover:bg-card'
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
