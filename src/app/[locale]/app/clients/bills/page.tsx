import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { BillsTable } from '@/features/billing/components/bills-table';
import { clinicServicePrices, consultedClients } from '@/features/billing/queries';
import { ledgerByClient, subscriberTotalsByClient } from '@/features/billing/queries';
import { wallClockIn } from '@/features/booking/completed';
import { DISPLAY_TIME_ZONE } from '@/lib/format';
import { ClientPagination } from '@/features/clients/components/client-pagination';
import { ClientSearch } from '@/features/clients/components/client-search';
import { listClients } from '@/features/clients/queries';
import { listClientsSchema } from '@/features/clients/schema';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

/**
 * Subscriber ▸ Bills — the second half of the Subscriber group in the rail.
 *
 * The register decides *which* subscribers are on the page — search, filter,
 * sort and paging all come from `listClients`, so the toolbar and the pager are
 * the register's own and behave identically here. The ledger is then summed for
 * exactly that page of ids and merged in.
 *
 * **The money is a second query, not a join, and that is deliberate.** Folding
 * two aggregates into the paged client query breaks the `LIMIT` and the pager's
 * `count()` — the same reason the register merges plan status and weekly
 * progress after the fact rather than joining them. It also means a subscriber
 * with no ledger at all is still on the screen, drawn as zeroes, instead of
 * being dropped by an inner join.
 */

type BillsPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: BillsPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'billing' });
  return { title: t('title') };
}

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export default async function BillsPage({ params, searchParams }: BillsPageProps) {
  const locale = await resolveLocale(params);
  const { clinicId } = await requireStaffClinic(locale);

  /*
    The same input the register parses, from the same schema. `ClientSearch` and
    the pager write their parameters against whatever path they are rendered on,
    so search, filter and paging all work here without a line of their own — and
    a link copied from one screen to the other keeps its query.

    `status` is not read from the URL. The archive is a view of Details, and
    what someone who has left the register owes is a different question from the
    one this screen asks; the schema's default keeps this to active subscribers.
  */
  const raw = await searchParams;
  const input = listClientsSchema.parse({
    q: single(raw.q),
    filterBy: single(raw.filterBy),
    filterValue: single(raw.filterValue),
    sort: single(raw.sort),
    dir: single(raw.dir),
    page: single(raw.page),
  });

  const [result, t] = await Promise.all([listClients(clinicId, input), getTranslations('billing')]);

  /*
    Sequential after `listClients` rather than in the `Promise.all` above,
    because it needs the ids that query returns. One extra round trip for the
    page of rows on screen, not for the whole register.
  */
  const clientIds = result.items.map((client) => client.id);

  const [totals, ledgers, prices, consulted] = await Promise.all([
    subscriberTotalsByClient(clinicId, clientIds),
    /*
      The rows behind the sums — what each row's print menu lists, and what the
      PDF routes render. Alongside the totals rather than after them: they read
      the same two tables for the same ids and neither needs the other's answer.
    */
    ledgerByClient(clinicId, clientIds),
    /*
      The clinic's price list, which is what a charge is recorded at. One read
      for the page rather than one per row: it is three rows keyed by the clinic
      and every dialog on the screen wants the same answer.
    */
    clinicServicePrices(clinicId),
    /*
      Who has already had a consultation, for the free-first rule on the charge
      card. A set of ids rather than a count per subscriber: the question is
      whether there has been one at all.
    */
    consultedClients(clinicId, clientIds),
  ]);

  return (
    /* The register's own column, for the reason given on `min-h-full` there. */
    <div className="flex min-h-full flex-col gap-6 text-start">
      <PageHeader
        locale={locale}
        title={t('title')}
        subtitle={t('subtitle')}
        clinicId={clinicId}
      />

      <ClientSearch input={input} locale={locale} />

      <BillsTable
        result={result}
        totals={totals}
        ledgers={ledgers}
        filtered={Boolean(input.q) || Boolean(input.filterBy && input.filterValue)}
        locale={locale}
        /* The clinic's own today, not the browser's — see the prop's comment. */
        today={wallClockIn(DISPLAY_TIME_ZONE).date}
        prices={prices}
        consulted={consulted}
      />

      <ClientPagination result={result} input={input} className="mt-auto" />
    </div>
  );
}
