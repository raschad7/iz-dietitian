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
 * sitting inside the track rather than as a second track.
 *
 * **`pill` and `contained` move a real thumb; `default` re-tints.** The
 * distinction is not taste, it is arithmetic. Both lay their options out
 * `flex-1`, so they are *equal* by construction and the selected one's offset is
 * `index / count` of the track — a number this component already knows, with
 * nothing to measure. `default` sizes its options to their labels, which are two
 * different widths in two languages, so a travelling thumb there really would
 * need measuring on every locale change and re-measuring on every font swap. It
 * keeps the re-tint.
 *
 * The offset is written to `inset-inline-start` rather than to a `translate`.
 * A transform would need the sign flipped in Arabic — positive X is rightward
 * in both directions — which means either a `:dir()` rule or reading the
 * computed direction during render. The logical inset resolves to `left` in
 * English and `right` in Arabic on its own, and at this size the difference in
 * paint cost is not measurable against a correctness trap.
 *
 * ⚠ The thumb assumes **every option is visible**. `SegmentedOption.className`
 * can gate an option by width, which would leave the thumb counting a segment
 * that is not on screen — so do not combine that gate with `pill` or
 * `contained`. The calendar's view switch is `contained`, and it gates the whole
 * control below `md` rather than any single segment, so all three are always
 * present together whenever the thumb is.
 *
 * ⚠ **Never pass a `display` utility in `className` on a thumbed shape.** The
 * equal-thirds arithmetic above is only true because `contained` is an
 * `inline-grid` of equal columns (and `pill` a `w-full` flex row). The calendar
 * hid its switch with `hidden md:inline-flex`, which reinstated flex from `md`
 * up — segments then sized to their own labels, and since Arabic's "يوم" is far
 * shorter than "أسبوع" the raised card landed across the wrong segment and hung
 * off the end of the track. Hide a thumbed control with `max-*:hidden`, which
 * only ever writes `display: none` and leaves the layout to this component.
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
 * card track with an green-tinted half inside; a raised track holding a tinted
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
  /**
   * Classes for this option alone — the width gate the calendar's view switch
   * needs, and nothing else so far.
   *
   * It exists because *which options a control offers* can be a property of the
   * screen. The calendar offers day, week and month on a desktop and day and
   * week on a tablet, because a month grid is not something a 900px-wide screen
   * renders usefully however it is arranged. Expressing that as `hidden lg:flex`
   * on the option keeps the decision in CSS with the rest of the responsive
   * rules, and out of a `matchMedia` read that would flash the wrong set of
   * segments before hydration.
   *
   * ⚠ A hidden option still exists: it is in the DOM, and the state it selects
   * is still reachable by URL. Anything using this must also make sure the
   * *current* value can never be one the reader can no longer see — see
   * `CalendarViewGuard` for how the calendar closes that door.
   */
  className?: string;
};

function Segmented<T extends string>({
  options,
  value,
  onChange,
  onOptionHover,
  label,
  role = 'tablist',
  size = 'default',
  shape = 'default',
  className,
  activeClassName,
  inactiveClassName,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /**
   * A segment is about to be chosen — the pointer is on it, or focus has
   * reached it. Optional, and for preparing the *result* of a choice, never for
   * making one: it fires for segments the reader then moves off.
   *
   * The calendar uses it to prefetch the view under the pointer, so that by the
   * time the click lands the page is already in the router cache. Hover leads a
   * click by a couple of hundred milliseconds, which is most of a round trip.
   *
   * `onFocus` as well as `onMouseEnter`, so a keyboard arrowing along the track
   * gets the same head start a pointer does.
   */
  onOptionHover?: (value: T) => void;
  /** Names the group for a screen reader, e.g. "Calendar view". */
  label: string;
  role?: 'tablist' | 'radiogroup';
  size?: 'default' | 'sm';
  /** `pill` fills its row; `contained` matches the raised Settings tab bar. */
  shape?: 'default' | 'pill' | 'contained';
  className?: string;
  /** Overrides the selected fill; contained shapes default to a raised card. */
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
  const contained = shape === 'contained';
  const selectedClassName =
    activeClassName ??
    (pill || contained ? 'bg-card text-foreground' : 'bg-primary text-primary-foreground');

  /*
   * Where the travelling thumb is, for `pill` and `contained` — the two shapes
   * whose segments are equal-width by construction, so the selected one's offset
   * is `index / count` of the track with nothing to measure. `-1` — a value that
   * is not in `options` — parks it out of sight rather than snapping it to the
   * first segment, so a controlled caller passing an unknown value shows *no*
   * selection instead of a wrong one.
   */
  const selectedIndex = options.findIndex((option) => option.value === value);
  const showThumb = (pill || contained) && selectedIndex >= 0;

  /*
   * The track's own padding, as a number the thumb and the CSS below can agree
   * on. `p-1` is 4px, so the segments share `100% - 8px` between them.
   */
  const trackPad = '0.25rem';
  const segmentWidth = `calc((100% - ${trackPad} * 2) / ${options.length})`;

  return (
    <div
      role={role}
      aria-label={label}
      className={cn(
        'inline-flex rounded-lg border border-border p-0.5',
        // The thumb is positioned against this box.
        (pill || contained) && 'relative isolate',
        /*
         * 44px segments inside 4px of track, so the control lands at 52px and
         * every half clears the touch minimum on its own. `w-full` rather than
         * a width on the caller: two equal halves is what makes this shape
         * readable as one switch instead of two chips.
         */
        // The neutral well. No ring and no shadow — the track is the recess,
        // and the selected half is the only thing on this control that lifts.
        pill && 'w-full rounded-[14px] border-transparent bg-muted p-1',
        // Matches the contained link tabs used by Settings: the same 44px
        // recessed track with a raised card for the selected view. No `gap`
        // between the segments — like `pill`, they sit flush so the travelling
        // thumb, sized to `100% / count`, lands exactly on one of them.
        //
        // `inline-grid` with equal `fr` columns, **not** flex. The track sizes
        // to its content (it lives in a toolbar and must not stretch across its
        // grid track), and `flex-1` cannot equalise segments inside a
        // shrink-to-fit flex box — with no free space to distribute, each
        // segment collapses to its own label and "day"/"week"/"month" come out
        // three different widths, which the equal-thirds thumb would then miss.
        // Equal `fr` columns in a shrink-to-fit grid all resolve to the widest
        // label, so the segments are equal *and* the control stays content-wide.
        contained && 'inline-grid auto-cols-fr grid-flow-col h-11 rounded-lg border-transparent bg-muted p-1',
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
        size === 'sm' && !contained && 'h-10',
        className,
      )}
    >
      {/*
        The thumb.

        `aria-hidden` and `pointer-events-none`: it is the selection *drawn*, and
        the selection is already announced by `aria-checked` / `aria-selected` on
        the button it sits under. A screen reader that met this would find an
        unlabelled element between the options.

        `-z-10` against the track's `isolate` puts it behind the labels without
        escaping into any stacking context the caller happens to be inside.
      */}
      {showThumb ? (
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-y-1 -z-10',
            // Concentric with the segment it sits under: 10px inside the pill's
            // 14px well, 6px (`rounded-md`) inside the contained track's `lg`.
            pill ? 'rounded-[10px]' : 'rounded-md',
            'transition-[inset-inline-start] duration-(--duration-arc) ease-(--ease-sweep)',
            'motion-reduce:transition-none',
            selectedClassName,
            'shadow-card',
          )}
          style={{
            inlineSize: segmentWidth,
            insetInlineStart: `calc(${trackPad} + ${selectedIndex} * ${segmentWidth})`,
          }}
        />
      ) : null}

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
            onMouseEnter={onOptionHover ? () => onOptionHover(option.value) : undefined}
            onFocus={onOptionHover ? () => onOptionHover(option.value) : undefined}
            className={cn(
              'flex items-center justify-center rounded-md font-medium',
              'transition-[color,background-color,box-shadow,transform] duration-(--duration-label) ease-(--ease-sweep)',
              'motion-reduce:transition-none',
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
              // `font-normal`, not the base `font-medium`: in Arabic the two are
              // the same 400 file anyway, and this is the one weight that is a
              // real step down in both scripts.
              // ⚠ `min-w-0` is what makes `flex-1` here actually mean *equal
              // fifths*, and the thumb depends on it. A flex item's default
              // `min-width: auto` refuses to shrink below its own content, so
              // once the labels no longer fit — five views in the client record
              // at a narrow desktop width, where four settings tabs never did —
              // the segments size to their labels instead, come out unequal, and
              // the thumb behind them (sized `100% / count`) lands across a
              // seam. With it they stay equal and the longest label truncates,
              // which is the failure this control can survive.
              pill && 'relative h-11 min-w-0 flex-1 rounded-[10px] px-3 py-0 font-normal',
              // Equal-width by the track's grid columns (see the track above),
              // so the travelling thumb behind them lands on one exactly. The
              // button stretches to fill its `1fr` cell on its own — no `flex-1`,
              // which would be inert on a grid item anyway.
              contained && 'relative h-full rounded-md px-2.5 py-0',
              // The default shape stays olive; recessed shapes lift a neutral
              // card out of their track unless the caller overrides it.
              active
                ? pill || contained
                  ? /*
                      Label colour and nothing else. The fill, the radius and the
                      shadow are all on the thumb behind this button now —
                      repainting them here would put an opaque box over the
                      element that is doing the travelling, and the segment would
                      appear to arrive before the thumb did.

                      No `animate-in` either, for the same reason: a segment that
                      zooms itself in on selection is a *second* answer to "which
                      one is picked", fired at the moment the first one starts
                      moving.
                    */
                    'text-foreground'
                  : cn(
                      selectedClassName,
                      'scale-100 shadow-card',
                      'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-(--duration-label)',
                    )
                : inactiveClassName
                  ? inactiveClassName
                  : pill || contained
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
              // Last, so a call site gating this option by width wins over the
              // `display` the shape above just set.
              option.className,
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
