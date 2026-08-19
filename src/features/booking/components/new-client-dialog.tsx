'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { ClientIdentityFields } from '@/features/clients/components/client-identity-fields';
import { isValidationKey, VALIDATION_VALUES } from '@/features/clients/form-rules';
import { getLocaleDirection, type Locale } from '@/i18n/routing';

import { formatLongDate, formatMinuteRange } from '../format';
import { newClientSchema, type NewClientInput } from '../schema';
import { type PendingBooking } from './client-picker';
import { NO_REPEAT, RepeatField } from './repeat-field';

/**
 * Adding a client without leaving the booking.
 *
 * Saving creates the client *and* books the pending slot in one server call, so
 * there is no window in which a new person exists with no appointment. The
 * pending booking — including the practitioner chosen back in the picker — is
 * passed straight through, which is why that choice is held by the calendar and
 * not by the popover this dialog replaced.
 *
 * Only a name and a phone number: staff are mid-booking with someone in front of
 * them. The rest of the record belongs to the clients area.
 */

export type NewClientDialogProps = {
  open: boolean;
  pending: PendingBooking;
  locale: Locale;
  pendingLabel?: string;
  /**
   * Whatever repeat was already chosen in the picker this dialog was opened
   * from. Carried through rather than reset, so stepping aside to add the
   * person does not silently discard the span that was set a click earlier.
   */
  weeks?: number;
  onCreate: (client: NewClientInput, weeks: number) => void;
  onCancel: () => void;
};

export function NewClientDialog({
  open,
  pending,
  locale,
  weeks: initialWeeks = NO_REPEAT,
  onCreate,
  onCancel,
}: NewClientDialogProps) {
  const t = useTranslations('booking');
  /*
    The clients namespace, for the field complaints only. This dialog belongs to
    the calendar and its own copy is `booking.*`, but the fields inside it are
    the clients page's fields and their messages have to read identically on
    both screens — one register, one set of rules, one wording.
  */
  const tClients = useTranslations('clients');

  const [weeks, setWeeks] = useState(initialWeeks);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});

  /** Same lookup, and the same guard, as the clients card's own `errorFor`. */
  const errorFor = (field: string) => {
    const key = fieldErrors[field]?.[0];
    if (key === undefined || !isValidationKey(key)) return undefined;

    return tClients(`validation.${key}`, VALIDATION_VALUES);
  };

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      label={t('newClient.title')}
      dir={getLocaleDirection(locale)}
      className="sm:w-[min(28rem,calc(100vw-2rem))]"
    >
      {/*
        Uncontrolled, and read off `FormData` on submit.

        The fields are the clients page's own — see `ClientIdentityFields` — and
        those are uncontrolled so they can post through a form action there.
        Mirroring that here costs nothing and keeps one definition: holding this
        copy in `useState` would mean the shared component had to support both
        shapes, which is how two surfaces drift back apart.

        ⚠ `noValidate`, where this used to call `reportValidity()`.

        The browser's own bubbles were the right answer while the name was the
        only rule and the schema agreed with `required` by accident. Four of
        these fields are required now and two carry rules the browser cannot
        state — a real calendar day, ten digits after the calling code — so the
        two validators would disagree about the same form. Worse, the native
        bubble fires *first* and dismisses on the next click, so the reader
        would get a grey tooltip here and the red edge everywhere else for the
        same mistake.

        `newClientSchema` is the one that runs, which is also the schema the
        server re-runs on the payload. The complaints below are therefore the
        clients page's complaints, in the clients page's words.
      */}
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();

          const data = new FormData(event.currentTarget);
          const parsed = newClientSchema.safeParse({
            firstName: data.get('firstName'),
            lastName: data.get('lastName'),
            phone: data.get('phone'),
            dateOfBirth: data.get('dateOfBirth'),
            sex: data.get('sex'),
          });

          if (!parsed.success) {
            setFieldErrors(z.flattenError(parsed.error).fieldErrors);
            return;
          }

          setFieldErrors({});
          onCreate(parsed.data, weeks);
        }}
      >
        <DialogHeader
          title={t('newClient.title')}
          description={`${formatMinuteRange(
            locale,
            pending.date,
            pending.startMinute,
            pending.startMinute + pending.durationMinutes,
          )} · ${formatLongDate(locale, pending.date)}`}
          onClose={onCancel}
          closeLabel={t('actions.cancel')}
        />

        <DialogBody className="gap-4">
          {/*
            The clients page's own fields, not a smaller echo of them. A person
            added here is the same kind of record as one added from the register,
            and the two forms asking different questions was the reason they
            were not.
          */}
          <ClientIdentityFields locale={locale} errorFor={errorFor} />

          {/* The same field as the picker's, because this saves the same
              appointment — just with a person who did not exist a moment ago. */}
          <RepeatField
            locale={locale}
            date={pending.date}
            weeks={weeks}
            onChange={setWeeks}
            idPrefix="new-client-repeat"
          />
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" size="sm">
            {t('newClient.saveAndBook')}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
