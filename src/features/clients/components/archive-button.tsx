'use client';

import { useTranslations } from 'next-intl';

import { setClientStatusAction } from '@/features/clients/actions';
import { ConfirmSubmitButton } from '@/features/clients/components/confirm-submit-button';
import { type Locale } from '@/i18n/routing';

/**
 * Archive / restore. Deliberately does not confirm: it is one click to undo,
 * and prompting on a reversible action only trains people to dismiss prompts.
 */
export function ArchiveButton({
  locale,
  clientId,
  archived,
  size = 'default',
}: {
  locale: Locale;
  clientId: string;
  archived: boolean;
  size?: 'default' | 'sm';
}) {
  const t = useTranslations('clients');

  return (
    <form action={setClientStatusAction}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="intent" value={archived ? 'restore' : 'archive'} />
      <ConfirmSubmitButton label={archived ? t('actions.restore') : t('actions.archive')} size={size} />
    </form>
  );
}
