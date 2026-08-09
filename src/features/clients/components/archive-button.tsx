'use client';

import { useTranslations } from 'next-intl';

import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button';
import { setClientStatusAction } from '@/features/clients/actions';
import { type Locale } from '@/i18n/routing';

/**
 * Archive / restore. Deliberately does not confirm: it is one click to undo,
 * and prompting on a reversible action only trains people to dismiss prompts.
 */
export function ArchiveButton({
  locale,
  clientId,
  archived,
  variant = 'outline',
  size = 'default',
  iconOnly = false,
  className,
}: {
  locale: Locale;
  clientId: string;
  archived: boolean;
  variant?: 'outline' | 'ghost' | 'neutral';
  size?: 'default' | 'sm';
  /** Table rows use the glyph; the record page keeps the words. */
  iconOnly?: boolean;
  className?: string;
}) {
  const t = useTranslations('clients');

  const label = archived ? t('actions.restore') : t('actions.archive');

  return (
    <form action={setClientStatusAction} className="flex">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="intent" value={archived ? 'restore' : 'archive'} />
      <ConfirmSubmitButton
        label={label}
        variant={iconOnly ? 'ghost' : variant}
        size={iconOnly ? 'icon-sm' : size}
        icon={archived ? 'restore' : 'archive'}
        className={className}
      />
    </form>
  );
}
