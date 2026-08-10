'use client';

import type * as React from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * A tooltip that is one string on one control.
 *
 * The registry's tooltip is three components — a root, a trigger and a popup —
 * which is the right shape when the tip carries a keyboard shortcut, a heading
 * or an image. Every tooltip in this app carries a single line of text on a
 * single icon button, and writing four lines at each of those call sites would
 * be six copies of one arrangement.
 *
 * This is the shorthand and the parts are still exported; reach for them
 * directly when a tip needs more than a sentence.
 *
 * It replaces a CSS-only tooltip that positioned itself with `absolute` above
 * the trigger and never checked whether there was room — the same class of
 * defect the select menus had. Base UI flips and shifts it instead.
 */
export function TooltipHint({
  label,
  children,
  side = 'top',
  className,
}: {
  /** The tip itself. Required — a tooltip with nothing to say is decoration. */
  label: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'inline-start' | 'inline-end';
  className?: string;
}) {
  return (
    <Tooltip>
      {/*
        The trigger renders a wrapping span rather than taking the child over,
        because the children here are already whole controls — a Button, a
        submit button carrying its own form state — and `render` would replace
        their element rather than sit around it.
      */}
      <TooltipTrigger render={<span className={cn('inline-flex', className)} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
