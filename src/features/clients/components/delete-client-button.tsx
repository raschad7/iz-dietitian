'use client';

import { useTranslations } from 'next-intl';

import { deleteClientAction } from '@/features/clients/actions';
import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button';
import { type Locale } from '@/i18n/routing';

/**
 * Permanent delete. Archiving is the action the UI leads with; this one is
 * styled destructively and always confirms, naming the client so a mis-click on
 * the wrong row is caught before it happens.
 */
export function DeleteClientButton({
  locale,
  clientId,
  clientName,
}: {
  locale: Locale;
  clientId: string;
  clientName: string;
}) {
  const t = useTranslations('clients');

  return (
    <form action={deleteClientAction}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="clientId" value={clientId} />
      <ConfirmSubmitButton
        label={t('actions.delete')}
        confirmMessage={t('actions.confirmDelete', { name: clientName })}
        variant="destructive"
      />
    </form>
  );
}
