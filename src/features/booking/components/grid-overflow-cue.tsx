'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/**
 * "There is more below" — a fade along the panel's bottom edge, and a button
 * that goes there.
 *
 * Two marks rather than one, because they do different jobs. The fade makes the
 * cut edge read as *continuing* instead of ending: an appointment dissolving
 * into the canvas is obviously a block with more of itself further down, where
 * the same block sliced flat by a border simply looks finished. The button is
 * what makes that actionable on a touch screen, where there is no scrollbar,
 * no wheel and nothing to hover.
 *
 * Both appear together, and only when an appointment is genuinely hidden below
 * — see `useScrollOverflow`. A fade over empty afternoon rules would be the
 * same false promise the arrow would be.
 *
 * Sits outside the grid's horizontal scroller — see `calendar.tsx` — so it
 * stays pinned to the panel while the week's columns slide underneath it.
 */

export type GridOverflowCueProps = {
  /** True when an appointment starts below the grid's visible bottom edge. */
  visible: boolean;
  onScrollDown: () => void;
};

export function GridOverflowCue({ visible, onScrollDown }: GridOverflowCueProps) {
  const t = useTranslations('booking');

  return (
    <div
      className={cn(
        // `pointer-events-none` on the wrapper is load-bearing, not tidiness.
        // This box spans the panel's whole width, and the last hour of every
        // column sits underneath it — left solid, it would quietly swallow
        // every drag-to-create aimed at the end of the day. Only the button
        // itself takes the pointer back.
        'pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center',
        // Faded rather than unmounted, so arriving at the last appointment is a
        // settle rather than a control blinking out from under the pointer.
        'transition-opacity duration-(--duration-label) ease-(--ease-sweep)',
        visible ? 'opacity-100' : 'opacity-0',
      )}
      // Nothing below means nothing to announce: the button is a shortcut for a
      // scroll, and offering one that goes nowhere is noise.
      aria-hidden={!visible}
    >
      {/*
        The fade.

        Vertical, and that is why it needs no RTL treatment — `to top` means the
        same thing in both directions, unlike the horizontal gradients the
        design system warns about. The midpoint stop keeps the ramp from going
        milky across the middle, which is what makes it read as depth rather
        than as a translucent panel laid over the hours.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-background via-background/85 to-transparent"
      />

      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label={t('scrollDown')}
        // Out of the tab order while hidden: `aria-hidden` on the wrapper would
        // otherwise leave a focusable control inside a hidden subtree.
        tabIndex={visible ? undefined : -1}
        className={cn(
          // `relative` lifts it above the fade it sits on.
          'relative mb-2 shadow-elevated',
          // The one part of this that answers the pointer — and only while
          // there is somewhere for it to go.
          visible ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        onClick={onScrollDown}
      >
        <Icon name="chevronDown" />
      </Button>
    </div>
  );
}
