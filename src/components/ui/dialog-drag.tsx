'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Swipe-down-to-dismiss, for every bottom sheet the phone has.
 *
 * Below `sm` this app puts two different implementations against the block-end
 * edge and they are one surface to a reader: a native `<dialog>` (`Dialog`,
 * `ConfirmDialog`) and a Base UI popup (`SheetContent side="bottom"`). Both are
 * full-height there, both arrive from the bottom, and both are driven from
 * here — a reader who learns the gesture on one has learned it on the other,
 * which is the whole reason this is a hook and not a `<dialog>` feature.
 *
 * A surface that arrives from an edge is one a reader expects to be able to
 * push back to that edge, and on a phone the alternatives ask more of the hand:
 * Escape needs a keyboard the device only sometimes has, and the close button
 * is at the top corner furthest from the thumb holding it. The sheet's other
 * thumb-reachable exit is the band of scrim it leaves above itself — a tap
 * there closes it through the ordinary backdrop test, no code of its own. This
 * is the second: a full-width band rather than a 40px target, starting a
 * gesture that can be finished anywhere.
 *
 * ## What this is not
 *
 * It is **not** a second dismissal policy. `dismissible={false}` — a dialog
 * guarding a submission in flight — renders no grip and arms no gesture, the
 * same as Escape and the backdrop. Nor is it a snap-point sheet: there is one
 * position (open) and one gesture (leave). A half-open detent would be a second
 * height for a surface whose whole point is that it fills the screen.
 *
 * ## The transform, and the rule it is an exception to
 *
 * `globals.css` refuses to move a dialog with a `transform` and says why: a
 * transformed element becomes the containing block for every `position: fixed`
 * descendant, and the select, combobox and popover positioners are portaled
 * *into* the dialog (see `useDialogContainer`) and are fixed on a coarse
 * pointer. A standing transform would drag every popup in the sheet out of
 * position.
 *
 * A drag is not standing — it exists between one `pointerdown` and one
 * `pointerup`, and it is the only thing on screen while it does. The exception
 * is paid for twice: the gesture **refuses to start** while any positioner
 * inside the surface is open (`hasOpenPopup` below), and the transform is torn
 * off again the moment the sheet settles. Everything else in the file still
 * moves the box with `inset-block-end`, which creates no containing block.
 *
 * ⚠ On the Base UI side the property matters: Tailwind v4's `translate-y-10` —
 * which is how `SheetContent` writes its entrance and exit — compiles to the
 * standalone `translate` property, not to `transform`. The two **compose**
 * rather than overwrite, so the drag rides on top of Base UI's own transition
 * instead of fighting it, and the exit needs no special case.
 */

/** The width below which a dialog is a sheet — `Dialog`'s own line, in one place. */
const SHEET_QUERY = '(width < 40rem)';

/**
 * How far down the sheet must be left before letting go dismisses it, as a
 * share of its own height. A third is the familiar number and it is forgiving
 * in the direction that matters: an accidental nudge springs back.
 */
const DISMISS_RATIO = 0.3;

/**
 * …with a floor, for the short sheet. A dialog that opted into
 * `--q-dialog-max-block` can be 200px tall, and a third of that is a distance a
 * thumb crosses without meaning to.
 */
const DISMISS_FLOOR_PX = 96;

/**
 * …and a speed, in px/ms, for the flick that never reached either.
 *
 * A fast, short throw at the edge of the screen is how a phone dismisses
 * everything else; without this it would spring back and read as a sheet that
 * refused to close.
 */
const DISMISS_VELOCITY = 0.55;

/** Long enough to read as a spring back, short enough not to be in the way. */
const SETTLE_DURATION_MS = 220;

/** Whether a popup rendered inside this surface is open — see the note above. */
function hasOpenPopup(surface: HTMLElement): boolean {
  return surface.querySelector('[data-slot$="-positioner"][data-open]') !== null;
}

/**
 * Clears every trace of a drag from a surface.
 *
 * Called when a dialog opens, and when a dismissing one has finished closing:
 * the attribute and the custom property both survive `close()`, and a sheet
 * that reopened still carrying them would appear already pushed off the bottom
 * of the screen. A Base UI `Sheet` unmounts on close and so never needs it.
 */
export function resetSheetDrag(surface: HTMLElement | null): void {
  if (!surface) return;
  delete surface.dataset.drag;
  surface.style.removeProperty('--q-sheet-drag');
}

/**
 * Arms the gesture, and returns the props the grip has to carry.
 *
 * ## Where the listeners live, and why it is not the grip
 *
 * A thumb leaves the 28px band immediately — that being the gesture — so the
 * element the drag started on cannot be the one that hears the rest of it.
 * Pointer capture is the API for that and it is taken here, but it is taken
 * **best-effort**: `setPointerCapture` throws where the id names no active
 * pointer, and losing the whole drag to that would be a real failure bought for
 * a nicety.
 *
 * The listeners are on `window` instead, which is correct either way — a
 * captured event still bubbles to it — and correct as well for a pointer that
 * leaves the viewport entirely.
 */
export function useSheetDrag(
  surfaceRef: React.RefObject<HTMLElement | null>,
  { enabled, onDismiss }: { enabled: boolean; onDismiss: () => void },
): Pick<React.ComponentProps<'div'>, 'onPointerDown'> {
  /*
    Held in a ref and read inside the handler, so the pointer listeners are
    wired once per gesture against the current callback rather than being torn
    down and rebuilt whenever the parent re-renders mid-drag — which a dialog
    whose form is being typed into does on every keystroke.
  */
  const dismiss = React.useRef(onDismiss);

  // In an effect rather than during render: a ref written while rendering is a
  // ref written during a pass React may throw away. Effects commit before any
  // pointer event can reach the grip, so the handler never reads a stale one.
  React.useEffect(() => {
    dismiss.current = onDismiss;
  }, [onDismiss]);

  const onPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const surface = surfaceRef.current;
      if (!surface) return;

      // A right-click is not a drag; a touch has no meaningful `button`.
      if (event.pointerType === 'mouse' && event.button !== 0) return;

      /*
        Asked here rather than at render, and asked of the same query the
        stylesheet uses. A dialog that is a centred card has no edge to be
        pushed back to, and the grip is `display: none` there — but a window
        dragged across 40rem with the sheet already open would otherwise leave
        a live gesture on a hidden element.
      */
      if (!window.matchMedia(SHEET_QUERY).matches) return;
      if (hasOpenPopup(surface)) return;

      const grip = event.currentTarget;
      const startY = event.clientY;

      let offset = 0;
      let lastY = startY;
      let lastAt = event.timeStamp;
      let velocity = 0;

      // Best-effort — see the note on this hook. A drag that could not capture
      // is still a drag; `window` hears it either way.
      try {
        grip.setPointerCapture(event.pointerId);
      } catch {
        /* No active pointer with that id. The window listeners cover it. */
      }

      surface.dataset.drag = 'active';
      surface.style.setProperty('--q-sheet-drag', '0px');

      const onMove = (move: PointerEvent) => {
        /*
          Downward only. This sheet is against the block-end edge and its
          block-start edge is already at the top of the screen, so upward travel
          would promise a taller surface than exists — the rubber band every
          other sheet offers is a rubber band this one has no slack for.
        */
        offset = Math.max(0, move.clientY - startY);

        const elapsed = move.timeStamp - lastAt;
        if (elapsed > 0) velocity = (move.clientY - lastY) / elapsed;
        lastY = move.clientY;
        lastAt = move.timeStamp;

        surface.style.setProperty('--q-sheet-drag', `${offset}px`);
      };

      const finish = (dismissed: boolean) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        if (grip.hasPointerCapture(event.pointerId)) grip.releasePointerCapture(event.pointerId);

        if (dismissed) {
          /*
            Out through the edge it was pushed toward, and the Seam exit stands
            down for it — see the rule in `globals.css`. `100%` of the sheet's
            own height, so the same declaration is right whatever the dialog
            turned out to be.

            `onDismiss` is called in the same frame rather than after the slide:
            it is the caller's `open` that closes the dialog, and `Dialog` gives
            that its own 140ms before the native `close()`, which the 130ms
            slide fits inside.
          */
          surface.dataset.drag = 'dismissing';
          surface.style.setProperty('--q-sheet-drag', '100%');
          dismiss.current();
          return;
        }

        surface.dataset.drag = 'settling';
        surface.style.setProperty('--q-sheet-drag', '0px');

        /*
          The transform comes off once it is back, and only if nothing else has
          claimed the sheet in the meantime — a second drag started during the
          spring back owns the state now, and clearing it here would snap the
          finger's own gesture back to zero.
        */
        window.setTimeout(() => {
          if (surface.dataset.drag === 'settling') resetSheetDrag(surface);
        }, SETTLE_DURATION_MS);
      };

      const onUp = () => {
        const threshold = Math.max(DISMISS_FLOOR_PX, surface.offsetHeight * DISMISS_RATIO);
        finish(offset >= threshold || (offset > 0 && velocity >= DISMISS_VELOCITY));
      };

      /*
        `pointercancel` is not a rare case on a phone: iOS fires it the moment
        it decides the press was something else, and the answer is always the
        same — the sheet was never asked to leave, so it goes back.
      */
      const onCancel = () => finish(false);

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    },
    [surfaceRef],
  );

  return enabled ? { onPointerDown } : {};
}

/**
 * The band a sheet is dragged by: a pill, centred, above the header.
 *
 * `aria-hidden`, and deliberately not a button. It offers no dismissal that
 * Escape, the backdrop and the surface's own Cancel do not already offer, so as
 * a control it would be a third exit at the corner the title starts from — the
 * thing `DialogHeader` argues against at length. What it *is* is the visible
 * answer to "can I push this back down", which is a question only a pointer
 * asks.
 *
 * `display: none` from `sm` up, in the stylesheet rather than behind a media
 * hook, so the markup is the same on the server and after hydration.
 */
export function SheetGrip({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return <div {...props} data-slot="sheet-grip" aria-hidden className={cn(className)} />;
}
