'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/**
 * A modal built on the platform's own `<dialog>`.
 *
 * `showModal()` gives focus trapping, inert background, Escape-to-close and
 * the top layer for free — all of which a div-based modal has to reimplement,
 * usually incompletely. Two booking dialogs were already doing this by hand
 * with the same class string; this is that, shared, with the scrim moved off
 * `bg-black/40` and onto the olive-tinted `--overlay` token.
 *
 * Bottom sheet on a phone, centred card from `sm` up. The sheet rounds its
 * block-start corners only, because it rises from the bottom edge and its other
 * two are off-screen; the centred card rounds all four like any other surface.
 *
 * `placement="center"` opts out of the sheet half and is centred at every width
 * — for a short modal that asks one thing rather than a surface you work in.
 * See the prop for when that is the right call, and for the entrance it takes
 * with it.
 */
/**
 * The open dialog element, for popups that would otherwise be hidden behind it.
 *
 * A `<dialog>` opened with `showModal()` sits in the browser's **top layer**,
 * which paints above every element in the normal document no matter what
 * `z-index` they carry. A Base UI popup portals to `document.body` by default,
 * so a select opened inside a dialog rendered *underneath* it: positioned
 * correctly, painted behind, and `elementFromPoint` over the list returned the
 * dialog. Unreachable, in every dialog in the app.
 *
 * z-index cannot fix it — the top layer is outside the stacking order entirely.
 * The popup has to be portaled *into* the dialog, which is what this hands it.
 *
 * `null` outside a dialog, which is Base UI's own default, so a select on an
 * ordinary page is unaffected.
 */
const DialogContainerContext = React.createContext<HTMLElement | null>(null);

/**
 * The container a popup opened inside a dialog must portal into.
 *
 * Every overlay component in `components/ui` that portals — Select, Popover,
 * Combobox — reads this and passes it to its own portal. A new one must do the
 * same or it will not be clickable inside a dialog.
 */
function useDialogContainer() {
  return React.useContext(DialogContainerContext);
}

type DialogProps = {
  open: boolean;
  onClose: () => void;
  /** Announced as the dialog's name. Required — a modal with no name is a trap. */
  label: string;
  /** Direction for the dialog's own subtree; `<dialog>` renders in the top layer. */
  dir?: 'rtl' | 'ltr';
  /**
   * Drops the overlay shadow for the brand edge — the same "the edge, never a
   * lift" language `Card` speaks. The blurred scrim already separates the
   * surface from the page, so the shadow is doing a job nobody asked it to do.
   *
   * A prop rather than a `shadow-none` in `className`: tailwind-merge files
   * `shadow-overlay` as a shadow *colour*, so the two classes never collide and
   * which one wins would come down to stylesheet order.
   */
  flat?: boolean;
  /**
   * `wide` is for a dialog whose content is a row of choices rather than a
   * form — the default 28rem forces three columns into one. It stays a full
   * bottom sheet on a phone like every other dialog.
   */
  size?: 'default' | 'wide';
  /**
   * Where the surface sits on a phone. From `sm` up both are the same centred
   * card, so this only decides what happens below that.
   *
   * `sheet` is the default and the app's ordinary modal: full width, risen from
   * the block-end edge, block-start corners rounded. It is right for a surface
   * you *work in* — the client form, the intake panels, the meal inspector —
   * where the sheet buys the full height of the screen and the thumb starts near
   * the controls.
   *
   * `center` is a card floating in the middle at every width. It is for a short
   * modal that asks one thing and leaves: at four or five rows tall a bottom
   * sheet is a strip along the bottom edge with two-thirds of a blurred page
   * above it, which reads as a surface that failed to finish opening rather than
   * as a small one. Centred, the same content reads as a card that is simply
   * short.
   *
   * ⚠ It also changes the entrance, and that is not decoration: a sheet
   * animates *up* from the edge it belongs to, and a centred card that slid up
   * from nowhere would be describing a movement it did not make. The keyframe
   * swap is driven by the `q-dialog-centered` class this adds — see the block
   * beside `.q-dialog[open]` in `globals.css`.
   */
  placement?: 'sheet' | 'center';
  /**
   * Whether Escape and a backdrop click may close the dialog. Long-running
   * submissions set this to false so the protected task cannot be hidden while
   * it is still in flight. Programmatic changes to `open` continue to work.
   */
  dismissible?: boolean;
  className?: string;
  children: React.ReactNode;
};

function Dialog({
  open,
  onClose,
  label,
  dir,
  flat,
  size = 'default',
  placement = 'sheet',
  dismissible = true,
  className,
  children,
}: DialogProps) {
  const ref = React.useRef<HTMLDialogElement>(null);

  /*
   * The same element as `ref`, held in state as well.
   *
   * A ref does not re-render when it attaches, and the context below has to
   * publish the node to popups that render in the same pass. State does.
   */
  const [container, setContainer] = React.useState<HTMLDialogElement | null>(null);

  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open) {
      dialog.removeAttribute('data-closing');
      if (!dialog.open) dialog.showModal();
      return;
    }

    if (!dialog.open) return;
    dialog.dataset.closing = 'true';

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timeout = window.setTimeout(() => {
      if (dialog.open) dialog.close();
      dialog.removeAttribute('data-closing');
    }, reduceMotion ? 0 : 140);

    return () => window.clearTimeout(timeout);
  }, [open]);

  return (
    <dialog
      ref={(node) => {
        ref.current = node;
        setContainer(node);
      }}
      dir={dir}
      /*
        Published so CSS can tell the two surfaces apart without re-deriving the
        breakpoint. The safe-area inset in `globals.css` is owed to the sheet —
        which reaches the block-end edge of the screen and so can land under the
        home indicator — and not to the centred card, which floats clear of
        every edge at any width.
      */
      data-placement={placement}
      /*
        And its size, for the same reason and to the same reader. The coarse-
        pointer sheet in `globals.css` takes the surface's width back from the
        `sm:w-[…]` utilities below, so above 40rem it has to know which of the
        two widths it is putting back — and `size` is otherwise legible only
        from the class list it is compiled into.
      */
      data-size={size}
      aria-label={label}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(event) => {
        if (!dismissible) return;

        /*
         * A click on the backdrop targets the dialog element itself; a click on
         * anything inside targets that child instead.
         *
         * **The target test alone is not enough.** A popup portalled into this
         * dialog paints over the dialog's own surface, and a press that lands
         * between two rows of it — or on any part of the popup the browser does
         * not hit-test — falls through to the dialog element, which the rule
         * above then reads as "the backdrop was clicked" and closes. Choosing
         * from a select shut the whole dialog.
         *
         * The backdrop is by definition outside the dialog's box, so the
         * pointer position settles it: inside the rectangle is never a backdrop
         * click, whatever the event happens to target. Keyboard-synthesised
         * clicks report 0,0 and are excluded by the same check.
         */
        const dialog = ref.current;
        if (!dialog || event.target !== dialog) return;

        const box = dialog.getBoundingClientRect();
        const inside =
          event.clientX >= box.left &&
          event.clientX <= box.right &&
          event.clientY >= box.top &&
          event.clientY <= box.bottom;

        if (!inside) onClose();
      }}
      className={cn(
        'q-dialog',
        /*
          `max-w-none` in both placements, and it is doing real work: the UA
          stylesheet caps a `<dialog>` at `calc(100% - 6px - 2em)`, so without it
          the width below is a ceiling the browser has already lowered.
        */
        'max-w-none p-0 text-start',

        placement === 'center'
          ? [
              /*
                Centred at every width. `m-auto` is what does it — a modal
                `<dialog>` is `position: fixed` with `inset: 0` under the UA
                stylesheet, so auto margins on all four sides centre a box with a
                definite width in both axes. That is the same mechanism the
                `sm:m-auto` below has always used; this placement simply stops
                waiting for `sm` to use it.

                The width is stated once here rather than as a `sm:` step,
                because a centred card is the shape at every size — on a phone
                `calc(100vw-2rem)` is the whole screen less a 16px gutter, which
                is what keeps the scrim visible around all four edges and stops
                the card reading as a full-bleed page.
              */
              'q-dialog-centered m-auto rounded-lg',
              size === 'wide'
                ? 'w-[min(64rem,calc(100vw-4rem))]'
                : 'w-[min(28rem,calc(100vw-2rem))]',
            ]
          : [
              // The sheet: full width, pinned to the block-end edge, only its
              // block-start corners rounded — the other two are off-screen.
              'w-full mt-auto mb-0 rounded-t-2xl',
              'sm:m-auto sm:rounded-lg',
              size === 'wide'
                ? 'sm:w-[min(64rem,calc(100vw-4rem))]'
                : 'sm:w-[min(28rem,calc(100vw-2rem))]',
            ],

        'bg-popover text-popover-foreground ring-1',
        flat ? 'ring-primary/25' : 'shadow-overlay ring-foreground/10',
        // The scrim dims *and* blurs: the page behind a modal is context, not
        // something to read past. Written as a literal declaration rather than
        // `backdrop:backdrop-blur-sm` — Tailwind's blur utilities resolve
        // through custom properties registered on `*`, which `::backdrop` does
        // not inherit in every engine, so the utility silently does nothing.
        'backdrop:bg-[var(--overlay)] backdrop:[backdrop-filter:blur(4px)]',
        className,
      )}
    >
      <DialogContainerContext.Provider value={container}>
        {children}
      </DialogContainerContext.Provider>
    </dialog>
  );
}

/**
 * Title inline-start, optional close button inline-end.
 *
 * **The X is opt-in, and a dialog is allowed to have none.** Escape, a backdrop
 * click and the footer's own cancel button all close a `<dialog>` already, so a
 * form whose footer says "Cancel" beside "Save" is not made more escapable by a
 * third exit — it is only made busier at the corner the title starts from. Pass
 * `onClose` where the surface has no footer to leave by.
 */
function DialogHeader({
  title,
  description,
  onClose,
  closeLabel,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  onClose?: () => void;
  /** Required with `onClose` — the button is icon-only and carries no other name. */
  closeLabel?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className={cn('flex items-start gap-2 px-4 pt-4', className)}>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-heading-sm font-semibold" dir="auto">
          {title}
        </h2>
        {description ? (
          <p className="text-caption text-muted-foreground" dir="auto">
            {description}
          </p>
        ) : null}
      </div>

      {children}

      {onClose ? (
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label={closeLabel}>
          <Icon name="close" />
        </Button>
      ) : null}
    </header>
  );
}

function DialogBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="dialog-body" className={cn('flex flex-col gap-3 p-4', className)} {...props} />;
}

/** Actions sit inline-end; the primary action is last in DOM order. */
/**
 * The dialog's action row.
 *
 * **It wraps**, and that is the whole of the difference from the row it used to
 * be. A dialog is at its narrowest on the screen where it matters most — below
 * `sm` it is a full-width bottom sheet — and an unwrappable row of actions
 * simply ran off the end of it. The appointment dialog carries three (Delete,
 * Cancel, Save) and in English they overflowed a 390px phone by 93px, which put
 * *Save* off screen: the dialog could be opened and filled in and not submitted.
 * Nothing scrolls a footer sideways, so those pixels were unreachable.
 *
 * Wrapping costs a row of height on a narrow screen and keeps every action on
 * it. `gap-y-2` is what stops the two rows touching once it happens.
 *
 * `justify-end` still holds on one line, and a call site passing
 * `justify-between` — as the appointment dialog does, to put Delete opposite the
 * pair — keeps its own arrangement when there is room and stacks when there is
 * not.
 */
function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'flex flex-wrap items-center justify-end gap-2 gap-y-2 border-t border-border bg-muted/50 p-4',
        className,
      )}
      {...props}
    />
  );
}

export { Dialog, DialogHeader, DialogBody, DialogFooter, useDialogContainer };
