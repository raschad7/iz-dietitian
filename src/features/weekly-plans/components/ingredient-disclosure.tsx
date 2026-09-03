'use client';

import type { ReactNode } from 'react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/**
 * A run of ingredient lines, folded away until asked for.
 *
 * ## Why anything is folded at all
 *
 * The meal panel was one column holding, in order: the quantity card with its
 * steppers, every remaining ingredient of the main, every ingredient of every
 * side, the sides' own controls, the replacement list, a browse button, a
 * nutrition table and the model's rationale. Each of those earned its place on
 * its own; together they are a page a dietitian scrolls through looking for the
 * two rows they came to change.
 *
 * What the folding is *for* is that most of that list is reference rather than
 * instruction. The two or three primary lines are what a dietitian sets; the
 * onion, the oil and the pine nuts are what they check once and then stop
 * reading. A salad's four vegetables are the same — the fact that matters on
 * that row is *there is a salad here and it is this one*, and its contents are a
 * question asked occasionally.
 *
 * So the shape is: the thing you act on is open, the thing you verify is one
 * press away, and the press is on a row that says how many lines are behind it
 * — a count, because "3" is the difference between a fold worth opening and one
 * that will show you nothing you did not expect.
 *
 * ## Why not `<details>`
 *
 * The panel next door (`client-progress-panel.tsx`) uses the native element with
 * a CSS-only reveal, and the portal's meal card uses `<details>` driven by
 * `AnimatedDisclosure`. Both are the right answer where they are: the first is
 * server-rendered, the second must keep a week's recipes off the wire.
 *
 * This panel is already a client component with a live board behind it, and the
 * shared `Collapsible` gives the height animation, the `hidden="until-found"`
 * search behaviour and the ARIA wiring for nothing. Reaching for the primitive
 * the design system already owns is the rule (docs/design-system.md, "Required
 * UI workflow"), and a fourth hand-rolled disclosure in one feature is how four
 * of them end up animating at four different speeds.
 */
export function IngredientDisclosure({
  label,
  count,
  defaultOpen = false,
  children,
  className,
}: {
  label: string;
  /**
   * How many lines are behind the row. Printed beside the label, because a fold
   * that does not say what it is hiding is a fold nobody opens.
   */
  count: number;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} render={<div className={cn('min-w-0', className)} />}>
      <CollapsibleTrigger className="group/lines flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md py-1.5 text-start text-caption text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
        <Icon
          name="chevronDown"
          className="size-3.5 shrink-0 transition-transform duration-(--duration-label) ease-(--ease-sweep) group-data-[panel-open]/lines:rotate-180 motion-reduce:transition-none"
        />
        <span className="min-w-0 truncate">{label}</span>
        {/* `dir="ltr"` on the figure alone: it is a numeral inside Arabic text,
            and the parentheses would otherwise swap ends. */}
        <span className="shrink-0 tabular-nums opacity-70" dir="ltr">
          ({count})
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent
        hiddenUntilFound
        className="h-(--collapsible-panel-height) overflow-hidden opacity-100 transition-[height,opacity] duration-(--duration-arc) ease-(--ease-sweep) data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none [&[hidden]:not([hidden='until-found'])]:hidden"
      >
        {/* The padding is on an inner box: the panel is what animates, and
            padding on it is height the close has to travel through, so the row
            would never quite shut. Same reason as `Disclosure`. */}
        <div className="pb-2 pt-1">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
