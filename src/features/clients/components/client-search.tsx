import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { CLIENT_STATUSES, type ListClientsInput } from '@/features/clients/schema';

/**
 * A plain GET form. Submitting it puts the filters in the URL, which is what the
 * page reads — so the filtered list is a shareable address and this component
 * ships no client JavaScript at all.
 */
export function ClientSearch({ input }: { input: ListClientsInput }) {
  const t = useTranslations('clients');

  return (
    <form method="get" className="flex flex-wrap items-end gap-2">
      <div className="min-w-56 flex-1">
        <Input
          name="q"
          type="search"
          defaultValue={input.q ?? ''}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
        />
      </div>

      <Select name="status" defaultValue={input.status} aria-label={t('fields.status')} className="w-40">
        {CLIENT_STATUSES.map((status) => (
          <option key={status} value={status}>
            {t(`status.${status}`)}
          </option>
        ))}
        <option value="all">{t('status.all')}</option>
      </Select>

      <Button type="submit" variant="outline">
        {t('actions.filter')}
      </Button>
    </form>
  );
}
