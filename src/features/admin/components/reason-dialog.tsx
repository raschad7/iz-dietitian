'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { getLocaleDirection, type Locale } from '@/i18n/routing';

/*
  The pure rules module, NOT `../audit`. That one imports `next/headers` and the
  postgres driver; reaching for these two numbers through it pulled a TCP client
  into the browser bundle. See the header of `audit-rules.ts`.
*/
import { REASON_MAX_LENGTH, REASON_MIN_LENGTH } from '../audit-rules';

/**
 * The gate in front of every destructive platform action.
 *
 * ## Why a reason is required rather than merely offered
 *
 * Suspending a practice or disabling an account takes something away from
 * someone who cannot undo it and cannot see who did it. Months later the only
 * record of why will be this box. An optional field is a field nobody fills in
 * on the day they are in a hurry — which is precisely the day the reason matters
 * — so the button does not submit without one.
 *
 * `REASON_MIN_LENGTH` is five characters, not one. A required field with no
 * floor is a field people type `x` into, and a log full of `x` cost the operator
 * a click and told the reviewer nothing.
 *
 * ## The check here is a courtesy; the server's is the rule
 *
 * This component disables a button. `writeAudit` throws on a destructive verb
 * with no usable reason, and every action validates before it writes. A server
 * action is a public endpoint reachable by its id from any page that rendered
 * it — a disabled button stops a mis-click, never a request.
 *
 * ## Why not `ConfirmSubmitButton`
 *
 * That control asks a yes/no question and re-submits the form on yes. It has
 * nowhere to put a field, and bolting one on would give every confirmation in
 * the product an optional textarea it does not want. This is the platform area's
 * own dialog, and it stays here.
 */
export function ReasonDialog({
  trigger,
  title,
  description,
  confirmLabel,
  locale,
  tone = 'destructive',
  disabled = false,
}: {
  /** The words on the button that opens it. */
  trigger: string;
  title: string;
  /** What the action does, in one sentence. */
  description: string;
  confirmLabel: string;
  locale: Locale;
  tone?: 'destructive' | 'default';
  disabled?: boolean;
}) {
  const t = useTranslations('admin.reason');
  const tCommon = useTranslations('common');
  const { pending } = useFormStatus();

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const fieldId = useId();

  const trimmed = reason.trim();
  const usable = trimmed.length >= REASON_MIN_LENGTH && trimmed.length <= REASON_MAX_LENGTH;

  /*
    Close on the way out of a submission, not on the way in.

    The action revalidates the path rather than navigating, so this component is
    not unmounted when it succeeds — without this the dialog would sit open over
    a page that had already changed underneath it, with the reason still in the
    box, inviting the operator to press the button a second time. Watching the
    falling edge of `pending` is what makes "the request finished" observable
    from inside the form.
  */
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending) {
      setOpen(false);
      setReason('');
    }

    wasPending.current = pending;
  }, [pending]);

  return (
    <>
      {/*
        `type="button"`: this opens a dialog, it does not submit. The real submit
        is the button inside, which carries the reason with it.
      */}
      <Button
        type="button"
        variant={tone === 'destructive' ? 'destructive' : 'outline'}
        size="sm"
        disabled={disabled || pending}
        onClick={() => setOpen(true)}
      >
        {pending ? <Spinner className="size-4" /> : null}
        {trigger}
      </Button>

      {/*
        The field lives inside the form, always — not only while the dialog is
        open. A `<dialog>` rendered inside a form still posts its inputs, and
        keeping the value mounted means a mis-click on the backdrop does not
        discard a paragraph somebody just typed.
      */}
      <input type="hidden" name="reason" value={reason} />

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        label={title}
        dir={getLocaleDirection(locale)}
        placement="center"
        dismissible={!pending}
      >
        <DialogHeader title={title} description={description} />

        <DialogBody className="space-y-2">
          <Label htmlFor={fieldId}>{t('label')}</Label>
          <Textarea
            id={fieldId}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={REASON_MAX_LENGTH}
            placeholder={t('placeholder')}
            /* Autofocus is right here and wrong almost everywhere else: the
               dialog exists only to collect this one value, and the reader has
               already committed to the action by opening it. */
            autoFocus
          />
          <p className="text-caption text-muted-foreground">
            {t('hint', { min: REASON_MIN_LENGTH })}
          </p>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            {tCommon('cancel')}
          </Button>

          {/*
            The submit. It is inside the dialog and inside the form, so pressing
            it posts the surrounding action with the reason already in the
            payload — no second round trip and no state handed between them.
          */}
          <Button
            type="submit"
            variant={tone === 'destructive' ? 'destructive' : 'default'}
            disabled={!usable || pending}
          >
            {pending ? <Spinner className="size-4" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
