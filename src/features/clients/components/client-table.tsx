import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '@/components/ui/table';
import { ArchiveButton } from '@/features/clients/components/archive-button';
import { StatusBadge } from '@/features/clients/components/status-badge';
import { type ClientListResult } from '@/features/clients/queries';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';

export function ClientTable({
  result,
  filtered,
  locale,
}: {
  result: ClientListResult;
  filtered: boolean;
  locale: Locale;
}) {
  const t = useTranslations('clients');
  const tMealPlans = useTranslations('mealPlans');

  if (result.items.length === 0) {
    return (
      <Card variant="empty" className="items-center gap-4 p-8 text-center">
        <p>{filtered ? t('emptyFiltered') : t('empty')}</p>

        {/* An empty list with no way out is a dead end; offer the next step. */}
        {filtered ? (
          <Link href="/app/clients" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            {t('clearFilters')}
          </Link>
        ) : (
          <Link href="/app/clients/new" className={buttonVariants({ size: 'sm' })}>
            {t('new')}
          </Link>
        )}
      </Card>
    );
  }

  return (
    <TableRoot>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('fields.fullName')}</TableHead>
            {/* `numeric` keeps a phone number in LTR order inside Arabic text. */}
            <TableHead numeric>{t('fields.phone')}</TableHead>
            <TableHead numeric>{t('fields.email')}</TableHead>
            <TableHead>{t('fields.status')}</TableHead>
            <TableHead>{t('fields.portalAccess')}</TableHead>
            <TableHead className="text-end">
              <span className="sr-only">{t('fields.actions')}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.items.map((client) => (
            <TableRow key={client.id}>
              <TableCell>
                <Link href={`/app/clients/${client.id}`} className="font-medium underline-offset-4 hover:underline">
                  {client.fullName}
                </Link>
              </TableCell>
              <TableCell numeric>{client.phone ?? '—'}</TableCell>
              <TableCell numeric>{client.email ?? '—'}</TableCell>
              <TableCell>
                <StatusBadge status={client.status} />
              </TableCell>
              <TableCell>
                {client.hasPortalAccess ? <Badge variant="outline">{t('portal.title')}</Badge> : '—'}
              </TableCell>

              {/* Row actions: the things worth doing without opening the record. */}
              <TableCell>
                <div className="flex items-center justify-end gap-2">
                  {/* Carries the client through, so the plan form arrives with them chosen. */}
                  <Link
                    href={{ pathname: '/app/meal-plans/new', query: { clientId: client.id } }}
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  >
                    {tMealPlans('new')}
                  </Link>
                  <Link
                    href={`/app/clients/${client.id}/edit`}
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  >
                    {t('edit')}
                  </Link>
                  <ArchiveButton
                    locale={locale}
                    clientId={client.id}
                    archived={client.status === 'archived'}
                    size="sm"
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableRoot>
  );
}
