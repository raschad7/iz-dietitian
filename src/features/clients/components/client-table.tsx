import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
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
  const tNav = useTranslations('nav');

  if (result.items.length === 0) {
    return (
      <div className="space-y-4 rounded-lg border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">{filtered ? t('emptyFiltered') : t('empty')}</p>

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
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-start font-medium">{t('fields.fullName')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('fields.phone')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('fields.email')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('fields.status')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('fields.portalAccess')}</th>
            <th className="px-3 py-2 text-end font-medium">
              <span className="sr-only">{t('fields.actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {result.items.map((client) => (
            <tr key={client.id} className="border-t border-border hover:bg-muted/40">
              <td className="px-3 py-2 text-start">
                <Link href={`/app/clients/${client.id}`} className="font-medium underline-offset-4 hover:underline">
                  {client.fullName}
                </Link>
              </td>
              <td className="px-3 py-2 text-start" dir="ltr">
                {client.phone ?? '—'}
              </td>
              <td className="px-3 py-2 text-start" dir="ltr">
                {client.email ?? '—'}
              </td>
              <td className="px-3 py-2 text-start">
                <StatusBadge status={client.status} />
              </td>
              <td className="px-3 py-2 text-start">
                {client.hasPortalAccess ? <Badge variant="outline">{t('portal.title')}</Badge> : '—'}
              </td>

              {/* Row actions: the things worth doing without opening the record. */}
              <td className="px-3 py-2">
                <div className="flex items-center justify-end gap-2">
                  {/* Straight to this client's board — the client is the route, not a query param. */}
                  <Link
                    href={`/app/weekly-plans/${client.id}`}
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  >
                    {tNav('weeklyPlans')}
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
