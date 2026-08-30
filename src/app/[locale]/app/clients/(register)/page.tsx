import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';

import { PageHeader } from '@/components/layout/page-header';
import { FitRows } from '@/components/ui/fit-rows';
import { ClientPagination } from '@/features/clients/components/client-pagination';
import { ClientSearch } from '@/features/clients/components/client-search';
import { ClientTable } from '@/features/clients/components/client-table';
import { listClients } from '@/features/clients/queries';
import { CLIENTS_FIT_LIST, CLIENTS_ROWS, listClientsSchema } from '@/features/clients/schema';
import { resolveLocale } from '@/i18n/params';
import { resolveFittedRows, rowsCookieName } from '@/lib/fit-rows';
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

  /*
    How many rows this screen can hold, measured by the browser that is going to
    draw them and carried back in a cookie — see `FitRows`. Absent on a first
    visit, in which case `CLIENTS_ROWS.fallback` is what the page is drawn with
    until the probe below has something to say.
  */
  const jar = await cookies();
  const pageSize = resolveFittedRows(jar.get(rowsCookieName(CLIENTS_FIT_LIST))?.value, CLIENTS_ROWS);

  const raw = await searchParams;
  const input = listClientsSchema.parse({
    pageSize,
    q: single(raw.q),
    filterBy: single(raw.filterBy),
    filterValue: single(raw.filterValue),
    sort: single(raw.sort),
    dir: single(raw.dir),
    page: single(raw.page),
    /*
      Which half of the register this is, read from the query string.

      The archive used to be a route of its own (`/app/clients/archived`) and is
      now a view of this page: `?status=archived` swaps the rows and the row
      action, and nothing else about the screen moves. Leaving the register to
      look at the archive meant losing the toolbar you were standing at — the
      search you had typed, the filter you had set — and arriving somewhere that
      had to redraw a header, a title and a way back for a list of the same
      people. The old address still works; it redirects here.

      Anything else in the parameter falls back to `active` through the schema's
      `.catch()`, so a hand-edited value shows the register rather than erroring.
    */
    status: single(raw.status),
  });

  const archived = input.status === 'archived';

  const [result, t] = await Promise.all([listClients(clinicId, input), getTranslations('clients')]);

  return (
    /*
      ── The register is a frame, and a page of it is what the frame holds ──

      This column pinned itself to the shell from `md` up once, and handed the
      table a bounded height to scroll its rows inside; then it stopped, on the
      grounds that `CLIENTS_PAGE_SIZE` was "set so that a page fits" and there
      was nothing left for a frame to bound.

      Nine rows fit the screen that figure was measured on and no other. A
      1366×768 laptop, a 1080p panel at 125% scaling and a browser at 110% zoom
      all hold fewer, and on every one of them the pager — the only way through
      the register — sat below the fold. The list did not stop being long; the
      page simply stopped admitting it.

      So the frame is back, and the guess is gone. From `lg` up — the widths
      where the shell itself is bounded — this column is exactly as tall as
      `main` and the region below holds one page of the register. How many rows
      that is, is measured rather than assumed: `FitRows` reads the region and
      the server pages by the answer. The pager is therefore always the last
      thing *inside* the frame, and nothing scrolls, because there is never
      anything to scroll.

      `min-h-full` still stands below `lg`. A phone scrolls its register as one
      page, which is what a phone should do, and asks for `CLIENTS_ROWS.fallback`
      rows while it does — the nine it has always drawn.
    */
    <div className="flex min-h-full flex-col gap-6 text-start lg:h-full lg:min-h-0">
      {/*
        The title and the toolbar, as one block that does not give up height.

        Grouped rather than left as two children of the column: they are the
        furniture the frame is measured *against*, and a flex child's default
        `min-height: auto` is not a promise — a column short of space would
        squeeze the search row before it squeezed anything else.
      */}
      <div className="flex shrink-0 flex-col gap-6">
        {/*
          The header every staff screen now opens with — see `PageHeader`. This
          page says what it is rather than greeting anyone, and the date and the
          bell sit on the far side exactly as they do on the dashboard.
        */}
        <PageHeader
          locale={locale}
          /* The archive is this same screen reading the other half of the
             register, so it says so here rather than on a page of its own. */
          title={archived ? t('archive.title') : t('title')}
          subtitle={
            archived
              ? `${t('archive.subtitle')} · ${t('resultCount', { total: result.total })}`
              : t('resultCount', { total: result.total })
          }
          clinicId={clinicId}
        />

        {/* Search, filter, the way into the archive and "New client" all live in
            this one row — see ClientSearch. The archive link had a row of its own
            here until it joined them; the note on it there has why. */}
        <ClientSearch input={input} locale={locale} />
      </div>

      {/*
        One page of the register: the rows, and the pager held at the foot of
        them. `data-fit-region` is what marks this box as the height a page has
        to fit into — see `FitRows` for the whole contract.

        `flex-1` at every width and `min-h-0` only from `lg`. Filling is what
        holds the pager at the foot of the screen on a short page, and a phone
        wants that as much as a desktop does — but a phone's column is only
        `min-h-full`, so the region has to keep its default `min-height: auto`
        there and refuse to be squeezed under its own rows. From `lg`, where the
        column is exactly as tall as the shell, `min-h-0` is what lets it be the
        free space rather than its content.
      */}
      <div data-fit-region className="flex flex-1 flex-col lg:min-h-0">
        <ClientTable
          result={result}
          input={input}
          filtered={Boolean(input.q) || Boolean(input.filterBy && input.filterValue)}
          locale={locale}
          archived={archived}
        />

        {/*
          `mt-auto` is what puts the pager at the foot of the frame rather than
          under the last row: a short last page would otherwise pull it half a
          screen upwards, and a control that moves depending on which page you
          are on is one you have to find again after every step.

          The wrapper carries the gap the column used to give it, so an empty
          register — where `ClientPagination` draws nothing at all — still costs
          no space. And it is what `FitRows` measures the pager by, which is why
          the padding is on this box and not inside the control: the room the
          pager needs includes the room it is held clear by.
        */}
        <div data-fit-footer className="mt-auto pt-6">
          <ClientPagination result={result} input={input} />
        </div>

        {/* Renders nothing. It measures this region and tells the server how
            many rows the next page of it should hold. */}
        <FitRows name={CLIENTS_FIT_LIST} current={input.pageSize} bounds={CLIENTS_ROWS} />
      </div>
    </div>
  );
}
