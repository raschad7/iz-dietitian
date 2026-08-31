'use client';

import { useEffect, useId, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { SheetGrip, useSheetDrag } from '@/components/ui/dialog-drag';
import { DIALOG_NATIVE_CLOSE_DELAY_MS } from '@/components/ui/dialog-motion';
import { getLocaleDirection, type Locale } from '@/i18n/routing';

/**
 * Asks before an action that is awkward to undo.
 *
 * Built on the native `<dialog>` with `showModal()`, the same way
 * `AppointmentDialog` is: focus trapping, Escape-to-close and the backdrop come
 * from the platform rather than from code here, and all three are easy to get
 * subtly wrong by hand.
 *
 * Every string arrives as a prop. A shared control carries no feature
 * vocabulary, so the caller translates and this stays reusable.
 *
 * This does not replace `ConfirmSubmitButton`. That one guards a form submit and
 * has its own `useFormStatus` behaviour; this one guards an arbitrary callback.
 */

export type ConfirmDialogProps = {
  locale: Locale;
  title: string;
  /** The consequence, in one sentence. Omit when the title already says it. */
  description?: string;
  /**
   * A consequence the description does not cover, and that the reader would not
   * have predicted — something the action gives up rather than something it
   * does. Drawn as an attention note so it separates from the description
   * instead of becoming a second sentence nobody reads.
   *
   * Amber and not clay: clay is the system's only alarm, and this is a warning
   * about a door closing, not a destructive act. Deletion says so with `tone`.
   */
  note?: string;
  confirmLabel: string;
  cancelLabel: string;
  /** `destructive` colours the confirm button red. Use it for deletions. */
  tone?: 'default' | 'destructive';
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  locale,
  title,
  description,
  note,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const direction = getLocaleDirection(locale);
  /** Generated, so two of these on one page cannot collide on the same id. */
  const titleId = useId();

  const dialogRef = useRef<HTMLDialogElement>(null);
  /**
   * Whether an answer has already been given.
   *
   * Closing the dialog fires `onClose` however it happened — Escape, the
   * backdrop, or the confirm button. Without this the confirm path would report
   * the answer and then immediately report a cancellation on top of it.
   */
  const settled = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
    Swipe-down-to-dismiss, the same gesture `Dialog` arms — this surface is a
    bottom sheet below `sm` too, and a reader who learned the push on one has
    learned it here. Pushing it away is a "no", exactly as Escape and the
    backdrop are.

    `beginClose` is a hoisted function declaration, so naming it above its own
    definition is safe; the hook only ever calls it from a pointer handler.
  */
  const dragProps = useSheetDrag(dialogRef, {
    enabled: true,
    onDismiss: () => beginClose(false),
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog?.open) dialog?.showModal();

    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  function settle(confirmed: boolean): void {
    if (settled.current) return;
    settled.current = true;

    if (confirmed) onConfirm();
    else onCancel();
  }

  function beginClose(confirmed: boolean): void {
    const dialog = dialogRef.current;
    if (!dialog || settled.current || dialog.dataset.closing === 'true') return;

    dialog.dataset.closing = 'true';
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    closeTimer.current = setTimeout(() => {
      settle(confirmed);
      if (dialog.open) dialog.close();
    }, reduceMotion ? 0 : DIALOG_NATIVE_CLOSE_DELAY_MS);
  }

  return (
    <dialog
      ref={dialogRef}
      dir={direction}
      aria-labelledby={titleId}
      className={[
        'q-dialog',
        // Bottom sheet on small screens, centred card from `sm` up — the same
        // shape the appointment dialog takes, so the two read as one system.
        'w-full max-w-none rounded-t-2xl p-0',
        'mt-auto mb-0 sm:m-auto sm:w-[min(24rem,calc(100vw-2rem))] sm:rounded-2xl',
        'bg-popover text-popover-foreground shadow-overlay ring-1 ring-foreground/10',
        'backdrop:bg-[var(--overlay)] backdrop:[backdrop-filter:blur(4px)]',
      ].join(' ')}
      // Escape and the backdrop both land here, and both mean "no".
      onClose={() => settle(false)}
      onCancel={(event) => {
        event.preventDefault();
        beginClose(false);
      }}
      onClick={(event) => {
        // A click on the backdrop targets the dialog element itself.
        if (event.target === dialogRef.current) beginClose(false);
      }}
    >
      <SheetGrip {...dragProps} />
      <div className="flex flex-col gap-3 p-4 text-start">
        <h2 data-slot="dialog-header" id={titleId} className="text-base font-semibold" dir="auto">
          {title}
        </h2>

        {description || note ? (
          <div data-slot="dialog-body" className="flex flex-col gap-3">
            {description && (
              <p className="text-sm text-muted-foreground" dir="auto">
                {description}
              </p>
            )}

            {note && (
              <p
                className="rounded-md bg-status-attention-bg px-3 py-2 text-sm text-status-attention-fg"
                dir="auto"
              >
                {note}
              </p>
            )}
          </div>
        ) : null}

        {/*
          Cancel first in the DOM, so the native dialog's own autofocus lands on
          it: pressing Enter the moment this appears must not delete anything.
        */}
        <div data-slot="dialog-footer" className="mt-1 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => beginClose(false)}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={tone === 'destructive' ? 'destructive' : 'default'}
            size="sm"
            onClick={() => beginClose(true)}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
