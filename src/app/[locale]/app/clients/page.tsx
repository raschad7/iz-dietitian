import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
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
    // The route decides which half of the register this is; see
    // `/app/clients/archived` for the other one.
    status: 'active',
  });

  const [result, t] = await Promise.all([listClients(clinicId, input), getTranslations('clients')]);

  return (
    /*
      The page flows; nothing inside it is a scroller. It used to pin itself to
      the shell from `md` up and hand the register a bounded height to scroll
      its rows in, because a page held twenty clients and a list that long
      otherwise pushes the search field and the pager off the top and bottom of
      the screen — the two controls you reach for *because* the list is long.

      `CLIENTS_PAGE_SIZE` is now set so that a page fits, so there is nothing
      for a frame to bound: the register is drawn whole and the pager under it
      is the way to the rest.

      `min-h-full` rather than the old `h-full`, and it is what keeps the pager
      still. The column is at least as tall as `main`, so the pager's `mt-auto`
      pushes it to the foot of the screen and it stays there whether the page
      holds a full page or the last page's two — a control that moves half a screen
      depending on which page you are on is one you have to find again after
      every step. `min-h-` and not `h-`, so a short window lets the column grow
      past the frame and `main` scrolls it, instead of the overflow spilling out
      from under a pager pinned to a height the content no longer fits.
    */
    <div className="flex min-h-full flex-col gap-6 text-start">
      {/*
        The header every staff screen now opens with — see `PageHeader`. This
        page says what it is rather than greeting anyone, and the date and the
        bell sit on the far side exactly as they do on the dashboard.
      */}
      <PageHeader
        locale={locale}
        title={t('title')}
        subtitle={t('resultCount', { total: result.total })}
        clinicId={clinicId}
      />

      {/* Search, filter, the way into the archive and "New client" all live in
          this one row — see ClientSearch. The archive link had a row of its own
          here until it joined them; the note on it there has why. */}
      <ClientSearch input={input} locale={locale} />

      <ClientTable
        result={result}
        input={input}
        filtered={Boolean(input.q) || Boolean(input.filterBy && input.filterValue)}
        locale={locale}
      />

      {/* Renders nothing on an empty register, so it is a direct child: an
          empty wrapper here would still cost the register a row's worth of gap.
          `mt-auto` is what puts it at the foot of the screen — see the note on
          `min-h-full` above. */}
      <ClientPagination result={result} input={input} className="mt-auto" />
    </div>
  );
}
