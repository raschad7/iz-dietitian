import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * A key, as printed in a hint.
 *
 * ## Not a keycap
 *
 * The obvious drawing of this is a little 3D key — a border, a lighter face, a
 * heavier bottom edge. It was that, and it was the wrong call twice over. A
 * bordered chip is a *control's* vocabulary in this system, so a row of them
 * beside a label read as three tiny buttons nobody could press; and three
 * bordered boxes in the foot of a dialog carry more visual weight than the
 * dialog's own hairline, which put the loudest thing on the surface in the
 * quietest corner of it.
 *
 * What is left is a tinted patch of `--muted` with no border at all: enough to
 * read as "a key" beside prose, not enough to read as a thing to press. It is
 * the same move the rest of the system makes for a `Badge` over a `Button`.
 *
 * ## Sizing
 *
 * `min-inline-size` rather than a fixed width, with the padding taking over
 * once a legend outgrows it. `↵` and `esc` then sit on one rhythm — a square
 * for the single glyphs, a slightly wider patch for the word — instead of the
 * ragged row a purely content-sized chip gives.
 *
 * ## Direction
 *
 * `dir="ltr"` is stated here, once, rather than at each call site. A chord is
 * not prose: `⌘K` is `⌘K` in Arabic too, and left to the page's direction the
 * two characters swap. Stating it here also means no caller has to know that
 * `ms-auto` on this element would resolve against `ltr` and push the wrong way
 * — put the margin on a sibling or let a neighbour grow instead.
 */
const kbdVariants = cva(
  cn(
    'inline-flex items-center justify-center rounded-[0.3rem] font-mono font-medium',
    'bg-muted text-muted-foreground select-none',
  ),
  {
    variants: {
      size: {
        /** Beside a label in a hint legend, or inside a field. */
        default: 'h-5 min-w-5 px-1 text-[0.6875rem] leading-none',
        /** For a hint set in `text-caption`, where the default out-measures the words. */
        sm: 'h-[1.125rem] min-w-[1.125rem] px-1 text-[0.625rem] leading-none',
      },
    },
    defaultVariants: { size: 'default' },
  },
);

function Kbd({
  className,
  size,
  ...props
}: React.ComponentProps<'kbd'> & VariantProps<typeof kbdVariants>) {
  return (
    <kbd
      data-slot="kbd"
      dir="ltr"
      // Decorative in every current use: the label beside it says what the key
      // does, and a screen reader announcing "up down arrow navigate" adds
      // nothing a keyboard user does not already have from `aria-keyshortcuts`.
      aria-hidden
      className={cn(kbdVariants({ size }), className)}
      {...props}
    />
  );
}

export { Kbd, kbdVariants };
