'use client';

import { type ReactNode } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TooltipHint } from '@/components/ui/tooltip-hint';
import { PANEL_ACTION_CLASS } from '@/features/billing/components/row-action';
import { cn } from '@/lib/utils';

/**
 * The Expenses panel's overflow menu — the two things that produce a *document*
 * rather than change the ledger: Export bills, and Send by WhatsApp.
 *
 * ## Why they moved off the row
 *
 * The panel's action row carried four labelled buttons side by side, and only
 * two of them are what the card is open for. Record a payment and Add a bill
 * write to the account; the other two hand the same statement to a printer or
 * to WhatsApp. Four peers meant the two that matter had to be found among four,
 * and on a narrow record the row wrapped to two lines of buttons above a
 * balance nobody could see any more.
 *
 * One mark instead of two labelled buttons, and the two keep their words inside
 * it — which they need. "Export bills" and "Send by WhatsApp" are not glyphs
 * anybody recognises unlabelled, which is the same argument the Bills row's own
 * menu makes.
 *
 * ## It takes children rather than labels
 *
 * The two controls are rendered by the panel — a server component, holding the
 * translations and the ids they need — and handed here as `children`. This
 * component is a client one only because a popover is: it opens and closes.
 * Passing elements in rather than re-declaring every prop those two buttons
 * take is what keeps that boundary from turning into a third copy of their
 * signatures.
 */
export function ExpensesActionsMenu({
  /** The trigger's hover words and its accessible name. */
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Popover>
      {/*
        Dressed as the panel's other secondary buttons — the same outline and
        the same grey hover — at icon width. It is a peer of Add a bill beside
        it, not a quiet mark like the ones in a register row: on a card with
        four controls at most, a trigger that recedes is one nobody finds.

        `rounded-sm` — 8px, the design system's `radius.sm` — over the button's
        own 10px control radius, and restated for hover and `aria-expanded`
        because `PANEL_ACTION_CLASS` pins those to the control radius for the
        labelled buttons it was written for. Two pixels sounds like nothing and
        is not: this is the one square control in a row of wide ones, and at
        icon width ten reads as a rounded square where the buttons beside it
        read as buttons. The same eight the register's row marks take.
      */}
      <TooltipHint label={label} className="shrink-0">
        <PopoverTrigger
          aria-label={label}
          className={cn(
            buttonVariants({ variant: 'outline', size: 'icon' }),
            PANEL_ACTION_CLASS,
            'rounded-sm hover:rounded-sm aria-expanded:rounded-sm',
          )}
        >
          <Icon name="moreActions" className="size-4" />
        </PopoverTrigger>
      </TooltipHint>

      {/*
        `align="start"` hangs the panel from the trigger's leading edge, which
        Base UI resolves logically — so the menu opens *into* the card in both
        directions rather than off its end, with no `:dir()` and no Arabic
        branch. The Bills row's menu ends its row and hangs from `end` for the
        same reason.
      */}
      <PopoverContent align="start" className="w-64 gap-1 p-1.5">
        {children}
      </PopoverContent>
    </Popover>
  );
}
