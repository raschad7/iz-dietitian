'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog?.open) dialog?.showModal();
  }, []);

  const trimmedName = fullName.trim();
  const canSave = trimmedName.length >= 2;

  return (
    <dialog
      ref={dialogRef}
      dir={getLocaleDirection(locale)}
      aria-label={t('newClient.title')}
      className={[
        'w-full max-w-none rounded-t-2xl p-0 backdrop:bg-black/40',
        'mt-auto mb-0 sm:m-auto sm:w-[min(24rem,calc(100vw-2rem))] sm:rounded-2xl',
        'bg-popover text-popover-foreground border border-border shadow-xl',
      ].join(' ')}
      onClose={onCancel}
      onClick={(event) => {
        if (event.target === dialogRef.current) dialogRef.current?.close();
      }}
    >
      <form
        className="flex flex-col gap-3 p-4 text-start"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSave) return;
          onCreate({ fullName: trimmedName, phone: phone.trim() === '' ? undefined : phone.trim() });
        }}
      >
        <header className="space-y-0.5">
          <h2 className="text-base font-semibold">{t('newClient.title')}</h2>
          <p className="text-xs text-muted-foreground" dir="auto">
            {formatMinuteRange(locale, pending.date, pending.startMinute, pending.startMinute + pending.durationMinutes)}
            {' · '}
            {formatLongDate(locale, pending.date)}
          </p>
        </header>

        <div className="space-y-1">
          <Label htmlFor="new-client-name">{t('newClient.fullName')}</Label>
          <Input
            id="new-client-name"
            autoFocus
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
            minLength={2}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="new-client-phone">
            {t('newClient.phone')} <span className="text-muted-foreground">{t('fields.optional')}</span>
          </Label>
          <Input id="new-client-phone" dir="ltr" value={phone} onChange={(event) => setPhone(event.target.value)} />
        </div>

        <div className="mt-1 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => dialogRef.current?.close()}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={!canSave}>
            {t('newClient.saveAndBook')}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
