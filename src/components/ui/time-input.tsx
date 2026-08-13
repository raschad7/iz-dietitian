import * as React from 'react';

import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * A time, typed into the browser's own segmented time field, with a clock
 * leading it.
 *
 * This replaced `TimeField` (an hour list beside a minute list) and
 * `TimeSelect` (one list of whole times). Both are gone; this is the only time
 * control in the app.
 *
 * ## What the two lists were solving, and what this gives up
 *
 * `docs/design-system.md` used to say in as many words that a time is *not*
 * `<input type="time">`, and the reasoning was not wrong — so it is worth
 * being precise about which parts this addresses and which it accepts.
 *
 * - **The OS popup is gone**, and that was the loudest objection: Chrome's
 *   three-column spinner is drawn in the operating system's own type and reads
 *   as a foreign object dropped into an Arabic page. Hiding
 *   `::-webkit-calendar-picker-indicator` removes the button that summons it,
 *   leaving the segmented field, which is drawn in the page's own type.
 * - **The 12-hour concern remains, and it is the browser's call.** A time input
 *   formats to the *browser's* locale, not the page's, so a clinic that works
 *   in 24 can still be shown `08:30 AM` by a browser set to US English. The
 *   submitted value is unaffected — it is always `HH:MM` in 24-hour form, which
 *   is what `timeOfDaySchema` parses — so this is a display difference, not a
 *   data one.
 * - **`step` is what keeps a control off-grid values.** Where a form validates
 *   to a grid, pass it (in seconds, so a quarter hour is `900`): the browser
 *   snaps its own stepper to that grid and reports a typed off-grid value as
 *   invalid, rather than accepting it and letting the server reject it. A
 *   control that offers a time its own form refuses is a trap the reader walks
 *   into once per visit, and that rule outlived the lists it was written for.
 *
 * ## It is an LTR island, in both scripts
 *
 * `dir="ltr"` on the wrapper rather than on the input alone. A time reads
 * left-to-right in Arabic exactly as a phone number does, and the direction has
 * to be set on the element that positions *both* halves: the glyph is placed
 * with a logical `start-0` and the box clears it with a logical `ps-12`, so
 * setting the direction on the input alone would resolve those two against
 * opposite edges and drop the clock on top of the digits.
 */

type TimeInputProps = Omit<React.ComponentProps<'input'>, 'type'> & {
  /**
   * Seconds. Pass the grid the form validates to — `900` for quarter hours.
   * Omitted, the browser's default of 60 lets any whole minute through, which
   * is right where the form accepts any minute.
   *
   * ⚠ Never pass `1`. It adds a seconds segment to the field, and nothing in
   * this app stores a time more precisely than the minute.
   */
  step?: number;

  /**
   * Whether to draw the leading clock. On by default; pass `false` in a column
   * of times.
   *
   * **The glyph costs 48px of the content box**, and with the field's own 20px
   * end padding that is 68px of chrome before a digit is drawn. In the clinic's
   * weekly schedule — two 128px fields per row, seven rows — that left about
   * 60px for the value, and a browser rendering 12-hour time clipped `06:00 PM`
   * to `06:00 P`. A time you cannot read is worse than a time with no icon.
   *
   * Dropping it there is also the better design on its own terms: the column is
   * already headed "opens" and "closes", so fourteen identical clocks label
   * nothing that the heading above them has not said once. The same reasoning
   * removed the fourteen repeated من/إلى labels this table used to carry.
   */
  icon?: boolean;
};

function TimeInput({ className, step, icon = true, ...props }: TimeInputProps) {
  return (
    <span dir="ltr" className="relative block">
      {icon ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 start-0 flex w-12 items-center justify-center text-muted-foreground"
        >
          <Icon name="clock" className="size-5" />
        </span>
      ) : null}

      <Input
        type="time"
        step={step}
        className={cn(
          // The same well `Input`'s own `icon` prop reserves, so a time field
          // and an iconned text field start their content at the same offset.
          icon && 'ps-12',
          'tabular',
          /*
           * The indicator is the button that opens the OS spinner. `appearance`
           * as well as `display`, because they are two different opt-outs and
           * engines have historically honoured one without the other.
           */
          '[&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none',
          className,
        )}
        {...props}
      />
    </span>
  );
}

export { TimeInput };
