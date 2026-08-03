'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneField } from '@/components/ui/phone-field';
import { getLocaleDirection, type Locale } from '@/i18n/routing';

import { formatLongDate, formatMinuteRange } from '../format';
import { type PendingBooking } from './client-picker';

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
  onCreate: (client: { fullName: string; phone?: string }) => void;
  onCancel: () => void;
};

export function NewClientDialog({ pending, locale, onCreate, onCancel }: NewClientDialogProps) {
  const t = useTranslations('booking');

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  const trimmedName = fullName.trim();
  const canSave = trimmedName.length >= 2;

  return (
    <Dialog
      open
      onClose={onCancel}
      label={t('newClient.title')}
      dir={getLocaleDirection(locale)}
      className="sm:w-[min(24rem,calc(100vw-2rem))]"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSave) return;
          onCreate({ fullName: trimmedName, phone: phone.trim() === '' ? undefined : phone.trim() });
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

        <DialogBody>
          <Field>
            <Label htmlFor="new-client-name">{t('newClient.fullName')}</Label>
            <Input
              id="new-client-name"
              autoFocus
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
              minLength={2}
            />
          </Field>

          <Field>
            <Label htmlFor="new-client-phone">
              {t('newClient.phone')} <span className="text-muted-foreground">{t('fields.optional')}</span>
            </Label>
            <PhoneField
              id="new-client-phone"
              locale={locale}
              onChange={setPhone}
              countryLabel={t('newClient.phoneCountry')}
            />
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={!canSave}>
            {t('newClient.saveAndBook')}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
