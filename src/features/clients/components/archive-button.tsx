'use client';

import { useTranslations } from 'next-intl';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { setClientStatusAction } from '@/features/clients/actions';
import { type Locale } from '@/i18n/routing';

export function ArchiveButton({
  locale,
  clientId,
  archived,
}: {
  locale: Locale;
  clientId: string;
  archived: boolean;
}) {
  const t = useTranslations('clients');

  return (
    <form action={setClientStatusAction}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="intent" value={archived ? 'restore' : 'archive'} />
      <Submit label={archived ? t('actions.restore') : t('actions.archive')} />
    </form>
  );
}

function Submit({ label }: { label: string }) {
  const tCommon = useTranslations('common');
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="outline" disabled={pending}>
      {pending ? tCommon('loading') : label}
    </Button>
  );
}
