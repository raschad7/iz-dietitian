'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { ClientIdentityFields } from '@/features/clients/components/client-identity-fields';
import { getLocaleDirection, type Locale } from '@/i18n/routing';

import { formatLongDate, formatMinuteRange } from '../format';
import { type NewClientInput } from '../schema';
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
  pending,
  locale,
  weeks: initialWeeks = NO_REPEAT,
  onCreate,
  onCancel,
}: NewClientDialogProps) {
  const t = useTranslations('booking');

  const [weeks, setWeeks] = useState(initialWeeks);

  return (
    <Dialog
      open
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

        `reportValidity` rather than a disabled button. The name is `required`
        with a `minLength`, so the browser already knows what is wrong and where
        — a greyed-out submit says only that something is, and on a form this
        long that is a worse answer.
      */}
      <form
        noValidate={false}
        onSubmit={(event) => {
          event.preventDefault();

          const form = event.currentTarget;
          if (!form.reportValidity()) return;

          const data = new FormData(form);
          const text = (name: string) => {
            const value = data.get(name);
            const trimmed = typeof value === 'string' ? value.trim() : '';
            return trimmed === '' ? undefined : trimmed;
          };

          const fullName = text('fullName');
          if (fullName === undefined) return;

          /*
            `FormData` yields strings, and the schema wants one of two words.
            Narrowing here rather than casting: the radios can only emit these
            two, so anything else came from a tampered form and is dropped on
            the way out — the action re-validates regardless, but a client
            object that is honestly typed cannot quietly carry a third answer.
          */
          const rawSex = text('sex');
          const sex = rawSex === 'male' || rawSex === 'female' ? rawSex : undefined;

          onCreate({ fullName, phone: text('phone'), dateOfBirth: text('dateOfBirth'), sex }, weeks);
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
          <ClientIdentityFields locale={locale} />

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
