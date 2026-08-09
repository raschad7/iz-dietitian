'use client';

import { useTranslations } from 'next-intl';

import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button';
import { deleteClientAction } from '@/features/clients/actions';
import { type Locale } from '@/i18n/routing';

/**
 * Permanent delete. Archiving is the action the UI leads with; this one is
 * styled destructively and always confirms, naming the client so a mis-click on
 * the wrong row is caught before it happens.
 *
 * `destructiveGhost` inside the record's overflow menu, `destructive` where it
 * stands among other controls: the distinction the design system draws is about
 * what a control sits *among*, not how dangerous it is, and in a menu of boxless
 * rows an outlined box reads as one more destination.
 */
export function DeleteClientButton({
  locale,
  clientId,
  clientName,
  variant = 'destructive',
  size = 'default',
  className,
}: {
  locale: Locale;
  clientId: string;
  clientName: string;
  variant?: 'destructive' | 'destructiveGhost';
  size?: 'default' | 'sm';
  className?: string;
}) {
  const t = useTranslations('clients');

  return (
    <form action={deleteClientAction} className="flex">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="clientId" value={clientId} />
      <ConfirmSubmitButton
        label={t('actions.delete')}
        confirmTitle={t('actions.confirmDeleteTitle')}
        confirmMessage={t('actions.confirmDelete', { name: clientName })}
        variant={variant}
        size={size}
        icon="trash"
        className={className}
      />
    </form>
  );
}
