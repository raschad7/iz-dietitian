import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';

export function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('clients');
  const isArchived = status === 'archived';

  return (
    <Badge variant={isArchived ? 'muted' : 'default'}>
      {isArchived ? t('status.archived') : t('status.active')}
    </Badge>
  );
}
