'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { useDialogPresence } from '@/components/ui/dialog-motion';
import { FieldError } from '@/components/ui/field';
import { Icon, type IconName } from '@/components/ui/icon';
import { ROW_ACTION_CLASS } from '@/features/billing/components/row-action';
import { type BillingFormState, initialBillingFormState } from '@/features/billing/form-state';
import { getLocaleDirection, type Locale } from '@/i18n/routing';

/**
 * The shell both ledger dialogs are built from — recording a charge, and
 * recording a payment.
 *
 * The two ask for different fields and call different actions; everything
 * around those is identical, so it lives here once. A copy would have meant two
 * dialogs whose focus handling, submit-guarding and error rendering drift apart
 * the first time one of them is fixed.
 *
 * Callers pass their fields as `children` and their server action as `action`.
 * The hidden `locale` and `clientId` inputs are written here, because every
 * billing action needs both and forgetting one is a runtime failure rather than
 * a type error.
 *
 * ## It records, it does not collect
 *
 * Both dialogs write down something that already happened in the room. Nothing
 * here contacts a bank and no card details are asked for or accepted — see the
 * header of `src/db/schema/billing.ts`. The wording follows: "Record a
 * payment", never "Pay".
 */
export function BillingEntryDialog({
  locale,
  clientId,
  icon,
  title,
  description,
  openLabel,
  openLabelFor,
  submitLabel,
  action,
  children,
}: {
  locale: Locale;
  clientId: string;
  /** The glyph on the row. */
  icon: IconName;
  title: string;
  description: string;
  /** The trigger's `title` — the short form, without the name. */
  openLabel: string;
  /** The trigger's accessible name, which must say *which* subscriber. */
  openLabelFor: string;
  submitLabel: string;
  action: (previous: BillingFormState, formData: FormData) => Promise<BillingFormState>;
  children: React.ReactNode;
}) {
  const t = useTranslations('billing');
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, initialBillingFormState);
  const present = useDialogPresence(open);

  const trigger = useRef<HTMLButtonElement>(null);

  /*
    Close once the write has actually landed — not optimistically on submit.
    The totals behind the dialog are revalidated by the action, so closing early
    would return the reader to a table that has not caught up with what they
    just entered, and would hide the error if the write had in fact failed.

    Adjusted during render against the previous status rather than from an
    effect: that is React's own answer for "react to a value changing", and what
    the `set-state-in-effect` rule points at. From an effect this would render
    the card open, commit, then close it — a visible flash of a dialog whose
    work is already done.

    Guarded on `open` too, so a `success` still sitting in action state from the
    last submission cannot slam a freshly reopened card shut.
  */
  const [lastStatus, setLastStatus] = useState(state.status);

  if (lastStatus !== state.status) {
    setLastStatus(state.status);
    if (open && state.status === 'success') setOpen(false);
  }

  /*
    Focus goes back where it came from. An effect and not part of the close
    above, because moving focus is a DOM operation rather than state — and it
    belongs on *every* close, not only the successful one: Escape, Cancel and
    the header's × all leave a reader who would otherwise be dropped at the top
    of the document.
  */
  const wasOpen = useRef(false);

  useEffect(() => {
    if (wasOpen.current && !open) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const error = state.status === 'error' ? t(`errors.${state.messageKey}`) : null;

  return (
    <>
      {/*
        Icon-only, like the register's row actions: two labelled buttons per row
        across a whole table would be wider than most of the columns beside
        them. The subscriber's name travels in `aria-label`, so the glyph is
        shorthand for people who know the screen and never the only way to find
        out what it does.

        `type="button"` because the page contains the search `<form>`, and an
        unqualified button inside it would submit that.
      */}
      <Button
        ref={trigger}
        type="button"
        variant="ghost"
        size="icon"
        className={ROW_ACTION_CLASS}
        onClick={() => setOpen(true)}
        aria-label={openLabelFor}
        title={openLabel}
      >
        <Icon name={icon} className="size-5" />
      </Button>

      {present ? (
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          label={title}
          dir={getLocaleDirection(locale)}
          /* Not dismissible mid-write: the card guards a submission in flight. */
          dismissible={!pending}
        >
          <DialogHeader
            title={title}
            description={description}
            onClose={pending ? undefined : () => setOpen(false)}
            closeLabel={t('recordPayment.close')}
          />

          <form action={formAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="clientId" value={clientId} />

            <DialogBody className="space-y-4">
              {children}

              {/* One line, under the fields — the actions report a single
                  message key rather than per-field issues. */}
              <FieldError>{error}</FieldError>
            </DialogBody>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                {t('recordPayment.cancel')}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? t('recordPayment.saving') : submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </Dialog>
      ) : null}
    </>
  );
}
