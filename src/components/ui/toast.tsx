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
        ## Why the font is an inline style and not a class

        Sonner ships `[data-sonner-toaster] { font-family: ui-sans-serif,
        system-ui, …, Segoe UI, … }` in a stylesheet it injects itself, and that
        stylesheet is **unlayered**. Every Tailwind utility in this app lives in
        `@layer utilities`, and in the cascade an unlayered declaration beats a
        layered one outright — specificity never gets a say. So `.toaster` on
        this element lost to `[data-sonner-toaster]` no matter what was in it,
        and the toast viewport sat in the operating system's font.

        That was not cosmetic in Arabic. Measured at 16px, "تم إخفاء الطبق من
        قائمتك" is 128px in Almarai's bold and 170px in the face Segoe UI hands
        Arabic off to — and that fallback has **no bold at all**: 400 and 600
        render identically, byte for byte. So the most-seen surface in the app
        rendered its Arabic wide, in the wrong face, and with the weight
        hierarchy silently flattened. It read as thin, because it was.

        An inline style is the one declaration that beats an unlayered rule
        without `!important`, and `--font-sans` is already locale-aware — Almarai
        under `:lang(ar)`, the Latin UI face otherwise — so this follows the page
        rather than pinning a face.

        `width` is here for the plainer reason: it is wider than Sonner's 356px
        default. The toasts this app raises are a sentence and a button on one
        line — "Moved labneh with walnuts and honey" plus Undo — and at the stock
        width the sentence wrapped while the button squeezed against it. `min()`
        so a phone still gets the full column minus its gutters.
      */
      style={{ width: 'min(28rem, calc(100vw - 2rem))', fontFamily: 'var(--font-sans)' }}
      className={cn('toaster group', className)}
      toastOptions={{
        unstyled: true,
        classNames: {
          /*
            `font-sans` here too, and it is not redundant with the inline style
            on the viewport above.

            That one fixes the inheritance; this one survives a *portalled*
            toast. Sonner renders the `<ol>` only while there is something in it
            and re-parents nothing, but anything rendered through `toast.custom`
            lands inside this element, and a caller that sets its own container
            would otherwise be back to the OS font. One declaration on the panel
            costs nothing and closes that door.

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
