'use client';

import type { ComponentProps } from 'react';
import { Toaster as SonnerToaster, toast } from 'sonner';

import { cn } from '@/lib/utils';

/**
 * The Shadcn notification surface.
 *
 * Sonner owns measurement and stacking. Keeping those mechanics out of the
 * weekly-plan render tree is important: the former Base UI toast measured its
 * animated height synchronously after a drop and could trap Chromium in a
 * resize/update loop, freezing the whole planner after the database write had
 * already succeeded.
 */
function Toaster({ className, ...props }: ComponentProps<typeof SonnerToaster>) {
  return (
    <SonnerToaster
      position="bottom-center"
      visibleToasts={3}
      gap={10}
      /*
        Wider than Sonner's 356px default.

        The toasts this app raises are a sentence and a button on one line —
        "Moved labneh with walnuts and honey" plus Undo — and at the stock width
        the sentence wrapped to two lines while the button squeezed against it,
        so the most-seen surface in the planner looked cramped every single
        time. `min()` rather than a flat width so a phone still gets the full
        column minus its gutters.
      */
      style={{ width: 'min(28rem, calc(100vw - 2rem))' }}
      className={cn('toaster group', className)}
      toastOptions={{
        unstyled: true,
        classNames: {
          /*
            `font-sans`, declared — not inherited.

            Sonner ships a `font-family: ui-sans-serif, system-ui, …` on its own
            container, which is a real declaration and therefore beats whatever
            the page was inheriting. So the one surface that appears unbidden,
            over whatever you were reading, was the one surface drawn in the
            operating system's font: Segoe UI on Windows, and for Arabic
            whatever fallback that stack happened to land on. Restating the
            token here puts the toast back in the app's own face — Almarai under
            `:lang(ar)`, the Latin UI face otherwise — and every child inherits
            it from this element, so the title, the description and the buttons
            are all one typeface.

            `p-4` and a 16px gap: this is a panel that interrupts, not a chip.
          */
          toast:
            'group/toast flex w-full items-center gap-3.5 rounded-xl border border-border bg-card p-4 font-sans text-foreground shadow-overlay',
          content: 'min-w-0 flex-1',
          icon: 'grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-primary [&>svg]:size-5',
          // One face for the whole panel, so size and weight carry the
          // hierarchy: 16px at 600 over 14px muted.
          title: 'text-body-md font-semibold leading-6',
          description: 'mt-1 text-body-sm leading-5 text-muted-foreground',
          error:
            '[&_[data-icon]]:bg-destructive-subtle [&_[data-icon]]:text-destructive',
          warning:
            '[&_[data-icon]]:bg-status-attention-bg [&_[data-icon]]:text-status-attention-fg',
          /*
            The brand fill, not an outline.

            Undo is the only thing on this panel you can do, and it is on a
            deadline — the toast leaves and takes the offer with it. An outlined
            button beside a green icon disc read as the quieter of two things
            when it was the only one. It is now the same solid primary every
            other committing button in the app wears.

            40px, the touch floor every other button clears; at 32px it was the
            smallest target on screen and the only one that expires.
          */
          actionButton:
            'ms-auto inline-flex h-10 shrink-0 items-center rounded-[10px] bg-primary px-4 text-label font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          cancelButton:
            'ms-auto inline-flex h-10 shrink-0 items-center rounded-[10px] border border-border bg-card px-4 text-label font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        },
      }}
      {...props}
    />
  );
}

export { Toaster, toast };
