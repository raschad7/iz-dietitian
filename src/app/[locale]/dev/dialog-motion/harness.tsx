'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

import styles from './motion.module.css';

/**
 * Candidate dialog entrances, opened from the same content so the only thing
 * that differs between them is the motion.
 *
 * The real `Dialog` is used rather than a mock — an entrance has to be judged
 * against the actual surface, at the actual size, with the actual backdrop
 * behind it. Each variant is a class passed through `className`; the animations
 * live in `motion.module.css` and reach nothing outside this directory.
 *
 * **Open one ten times.** An entrance is not judged on the first viewing, when
 * anything moving looks better than nothing moving. It is judged on the tenth,
 * which is roughly how often a working dietitian meets it in an hour. The
 * livelier a variant is, the more this matters — the two here that are most
 * impressive once are the two most likely to grate by Friday.
 */

type VariantId = 'stagger' | 'depth' | 'focusPull' | 'seam' | 'iris';

const VARIANTS: {
  id: VariantId;
  name: string;
  timing: string;
  idea: string;
  cost: string;
  /* Optional because a CSS Module's exports are typed as possibly absent —
     a missing class would simply leave the app's own entrance in place. */
  className?: string;
}[] = [
  {
    id: 'stagger',
    name: 'B. Rise, contents staggered',
    timing: '260ms + 50ms steps',
    idea: 'The chosen baseline. The surface lands, then its rows follow — a dialog that assembles rather than one that switches on.',
    cost: 'None. Cheapest thing here and safe on every screen.',
    className: styles.stagger,
  },
  {
    id: 'depth',
    name: 'E. Depth — the page recedes',
    timing: '260ms',
    idea: 'The only one that animates something other than the dialog: the page behind scales down and blurs while the surface rises. Depth is communicated by the world moving away, not by the modal insisting it is in front.',
    cost: 'Needs a wrapper element around page content to transform. One composited layer, not repainted.',
    className: styles.depth,
  },
  {
    id: 'focusPull',
    name: 'F. Focus pull',
    timing: '320ms',
    idea: 'Arrives larger than final and out of focus, then resolves down into focus. Everything else grows from small; this shrinks. Describes attention rather than travel — nothing crossed the screen, something became legible.',
    cost: 'The expensive one. A 14px blur animating across the whole surface; test it on a mid-range Android.',
    className: styles.focusPull,
  },
  {
    id: 'seam',
    name: 'G. Seam — opens from a line',
    timing: '300ms',
    idea: 'Starts as a horizontal line across its own middle and opens outward. No travel, no scale: the box is already exactly where it will end up, and only its extent changes. Mechanical and precise rather than soft.',
    cost: 'None. Works identically in RTL — the movement is vertical and has no handedness.',
    className: styles.seam,
  },
  {
    id: 'iris',
    name: 'H. Iris — the scrim opens from your click',
    timing: '420ms scrim, surface at 140ms',
    idea: 'The backdrop is the animated thing: darkness spreads in a circle out of the button you pressed, and the dialog fades in behind it. The strongest cause-and-effect here by a distance.',
    cost: 'A large moving shape, so the most likely to wear out. Open it ten times before you decide.',
    className: styles.iris,
  },
];

export function DialogMotionHarness() {
  /*
   * Three pieces of state, and the split is what lets the *exit* play.
   *
   * `variant` is which candidate is mounted; `open` is whether it is showing;
   * `openId` increments on every open. Closing sets `open` to false but leaves
   * `variant` mounted, so the `Dialog` sees its `open` prop go false and runs
   * its `data-closing` exit — `Dialog`'s `onClose` only fires *after* that exit
   * (the native `close` event), and on Escape/backdrop it fires immediately, so
   * `onClose` has to mean "begin closing", not "unmount". Nothing unmounts: the
   * closed dialog sits invisibly until the next open, and `key={openId}` forces
   * a fresh mount each time so the entrance replays — including when the same
   * variant is reopened.
   *
   * The first version rendered `{active ? <Dialog/> : null}` and unmounted on
   * close, so the dialog was gone before it could animate out — every exit was
   * an instant disappearance. This is the lifecycle a real always-mounted caller
   * uses.
   */
  const [variant, setVariant] = React.useState<VariantId | null>(null);
  const [open, setOpen] = React.useState(false);
  const [openId, setOpenId] = React.useState(0);

  /*
   * The pressed control's centre, for the variants that grow from it.
   *
   * Written to the document element rather than passed as a `style` prop
   * because `Dialog` takes a fixed prop list and does not forward one — and a
   * harness that required changing the shared component in order to demonstrate
   * a proposal would be deciding the question it exists to ask. Custom
   * properties inherit, so they reach the dialog and its `::backdrop` from the
   * root either way. A chosen variant would set them on the element itself.
   */
  function openFrom(id: VariantId, event: React.MouseEvent<HTMLButtonElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const root = document.documentElement;
    root.style.setProperty('--cx', `${box.left + box.width / 2}px`);
    root.style.setProperty('--cy', `${box.top + box.height / 2}px`);
    setVariant(id);
    setOpen(true);
    setOpenId((n) => n + 1);
  }

  const active = VARIANTS.find((item) => item.id === variant);
  /** Begin the exit — `variant` stays set so the surface animates out mounted. */
  const close = () => setOpen(false);
  /** The depth page recedes only while the dialog is actually showing. */
  const depthActive = open && variant === 'depth';

  return (
    <>
      {/*
        The page content, wrapped so variant E has something to push back.
        `.page` carries the transition in both directions; `.pageRecedes` is the
        pushed-back end state and is toggled only for `depth`, so on close the
        page transitions back on its own while the surface drops away. Every
        other variant leaves the wrapper at rest.
      */}
      <div className={cn('origin-center', styles.page, depthActive && styles.pageRecedes)}>
        <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-6 p-6">
          <header className="space-y-1">
            <h1 className="font-heading text-heading-lg font-semibold">Dialog entrances</h1>
            <p className="text-body-sm text-muted-foreground">
              One baseline and four different ideas. Open each more than once — a first viewing
              flatters any motion at all.
            </p>
          </header>

          <div className="grid gap-3 sm:grid-cols-2">
            {VARIANTS.map((variant) => (
              <Card key={variant.id}>
                <CardContent className="flex h-full flex-col items-start gap-3">
                  <div className="flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <h2 className="font-heading text-heading-sm font-semibold">{variant.name}</h2>
                      <span className="font-mono text-caption text-muted-foreground">
                        {variant.timing}
                      </span>
                    </div>
                    <p className="text-body-sm leading-relaxed text-muted-foreground">
                      {variant.idea}
                    </p>
                    <p className="text-caption leading-relaxed text-muted-foreground">
                      <span className="font-semibold">Cost:</span> {variant.cost}
                    </p>
                  </div>

                  <Button type="button" onClick={(event) => openFrom(variant.id, event)}>
                    Open
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/*
        One dialog, remounted per variant by `key`. The remount is what replays
        the entrance: a `<dialog>` already in the tree holds its animation's
        finished state, so swapping only the class would show the new one doing
        nothing.

        `open` is driven separately from mounting (see the state note above), so
        Close plays the exit before `onClose` unmounts it.
      */}
      {active ? (
        <Dialog
          key={openId}
          open={open}
          onClose={close}
          label={active.name}
          placement="center"
          className={active.className}
        >
          <DialogHeader title={active.name} onClose={close} closeLabel="Close" />
          <DialogBody>
            <p className="text-body-sm leading-relaxed">{active.idea}</p>
            <p className="mt-3 text-body-sm leading-relaxed text-muted-foreground">
              Close and reopen it, then compare with the card beside it. An entrance is judged on
              the tenth viewing, not the first.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="neutral" onClick={close}>
              Close
            </Button>
          </DialogFooter>
        </Dialog>
      ) : null}
    </>
  );
}
