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
 * Bottom sheet on a phone, centred card from `sm` up. The sheet sweeps its
 * block-start corners because it rises from the bottom edge; the centred card
 * carries the normal Arc tail.
 */
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
  className?: string;
  children: React.ReactNode;
};

function Dialog({ open, onClose, label, dir, flat, size = 'default', className, children }: DialogProps) {
  const ref = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      dir={dir}
      aria-label={label}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop targets the dialog element itself; a click
        // on anything inside targets that child instead.
        if (event.target === ref.current) ref.current?.close();
      }}
      className={cn(
        'w-full max-w-none p-0 text-start',
        'mt-auto mb-0 rounded-t-2xl',
        'sm:m-auto sm:rounded-lg sm:rounded-ee-4xl',
        size === 'wide' ? 'sm:w-[min(64rem,calc(100vw-4rem))]' : 'sm:w-[min(28rem,calc(100vw-2rem))]',
        'bg-popover text-popover-foreground ring-1',
        flat ? 'ring-primary/25' : 'shadow-overlay ring-foreground/10',
        // The scrim dims *and* blurs: the page behind a modal is context, not
        // something to read past. Written as a literal declaration rather than
        // `backdrop:backdrop-blur-sm` — Tailwind's blur utilities resolve
        // through custom properties registered on `*`, which `::backdrop` does
        // not inherit in every engine, so the utility silently does nothing.
        'backdrop:bg-[var(--overlay)] backdrop:[backdrop-filter:blur(4px)]',
        'motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-200',
        className,
      )}
    >
      {children}
    </dialog>
  );
}

/** Title inline-start, close button inline-end. */
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
  closeLabel: string;
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
  return <div className={cn('flex flex-col gap-3 p-4', className)} {...props} />;
}

/** Actions sit inline-end; the primary action is last in DOM order. */
function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-2 border-t border-border bg-muted/50 p-4',
        className,
      )}
      {...props}
    />
  );
}

export { Dialog, DialogHeader, DialogBody, DialogFooter };
