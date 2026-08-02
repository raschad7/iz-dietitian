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
  className?: string;
  children: React.ReactNode;
};

function Dialog({ open, onClose, label, dir, className, children }: DialogProps) {
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
        'sm:m-auto sm:w-[min(28rem,calc(100vw-2rem))] sm:rounded-lg sm:rounded-ee-4xl',
        'bg-popover text-popover-foreground shadow-overlay ring-1 ring-foreground/10',
        'backdrop:bg-[var(--overlay)]',
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
