import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/features/clients/components/status-badge';
import { type ClientListResult } from '@/features/clients/queries';
import { Link } from '@/i18n/navigation';

export function ClientTable({ result, filtered }: { result: ClientListResult; filtered: boolean }) {
  const t = useTranslations('clients');

  if (result.items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {filtered ? t('emptyFiltered') : t('empty')}
      </p>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
