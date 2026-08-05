import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { ClientPagination } from '@/features/clients/components/client-pagination';
import { ClientSearch } from '@/features/clients/components/client-search';
import { ClientTable } from '@/features/clients/components/client-table';
import { listClients } from '@/features/clients/queries';
import { listClientsSchema } from '@/features/clients/schema';
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
    filterBy: single(raw.filterBy),
    filterValue: single(raw.filterValue),
    sort: single(raw.sort),
    dir: single(raw.dir),
    page: single(raw.page),
  });

  const [result, t] = await Promise.all([listClients(clinicId, input), getTranslations('clients')]);

  return (
    /*
      The page fills the shell and does not scroll; the register does, inside
      itself. A long list otherwise pushes the search field and the pager off
      the top and bottom of the screen, and the two controls you reach for
      *because* the list is long are the two the list hides.

      Below `md` the page scrolls as a whole, the way the dashboard does: on a
      phone the chrome and a usable number of rows do not both fit, and a
      pinned frame there would leave a two-row window to scroll a hundred
      clients through. The column names still stay put — the table header is
      sticky either way.
    */
    <div className="flex flex-col gap-6 text-start md:h-full md:min-h-0">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('resultCount', { total: result.total })}</p>
      </div>

      {/* Search, filter and "New client" all live in this row — see ClientSearch. */}
      <ClientSearch input={input} locale={locale} />

      <ClientTable
        result={result}
        input={input}
        filtered={Boolean(input.q) || Boolean(input.filterBy && input.filterValue)}
        locale={locale}
      />

      {/* Renders nothing on a single-page list, so it is a direct child: an
          empty wrapper here would still cost the register a row's worth of gap. */}
      <ClientPagination result={result} input={input} />
    </div>
  );
}
