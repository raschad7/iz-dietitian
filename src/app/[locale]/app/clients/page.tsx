import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { buttonVariants } from '@/components/ui/button';
import { ClientPagination } from '@/features/clients/components/client-pagination';
import { ClientSearch } from '@/features/clients/components/client-search';
import { ClientTable } from '@/features/clients/components/client-table';
import { listClients } from '@/features/clients/queries';
import { listClientsSchema } from '@/features/clients/schema';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

type ClientsPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: ClientsPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'clients' });
  return { title: t('title') };
}

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export default async function ClientsPage({ params, searchParams }: ClientsPageProps) {
  const locale = await resolveLocale(params);
  const { clinicId } = await requireStaffClinic(locale);

  const raw = await searchParams;
  const input = listClientsSchema.parse({
    q: single(raw.q),
    status: single(raw.status),
    page: single(raw.page),
  });

  const [result, t] = await Promise.all([listClients(clinicId, input), getTranslations('clients')]);

  return (
    <div className="space-y-6 text-start">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{t('title')}</h2>
          <p className="text-sm text-muted-foreground">{t('resultCount', { total: result.total })}</p>
        </div>

        <Link href="/app/clients/new" className={buttonVariants()}>
          {t('new')}
        </Link>
      </div>

      <ClientSearch input={input} />
      <ClientTable
        result={result}
        filtered={Boolean(input.q) || input.status !== 'active'}
        locale={locale}
      />
      <ClientPagination result={result} input={input} />
    </div>
  );
}
