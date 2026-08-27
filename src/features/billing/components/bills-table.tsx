import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { Table, TableBody, TableEmpty, TableHeader, TableRoot } from '@/components/ui/table';
import type { BillEntry } from '@/features/billing/bill';
import { BillsRow } from '@/features/billing/components/bills-row';
import type { ServicePrices } from '@/features/billing/services';
import type { SubscriberTotals } from '@/features/billing/money';
import { emptyTotals } from '@/features/billing/queries';
import type { ClientListResult } from '@/features/clients/queries';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';

import { COLUMN_COUNT } from './bills-columns';
import { BillsHeaderRow } from './bills-header-row';

/**
 * Subscriber ▸ Bills — one row per subscriber, and where their money stands.
 *
 * ## The same table as Details, with different columns
 *
 * Built from the same `src/components/ui/table` primitives as `ClientTable`,
 * with the same sticky header, the same `linked` rows and stretched name link,
 * the same tone disc, and the same empty state living inside the table rather
 * than replacing it. Standing on Bills should feel like standing on Details
 * with the money showing.
 *
 * It is **not** `ClientTable` itself, and could not be: that table's columns are
 * age, plan status, weekly progress and portal access, and this one's are name,
 * total price, phone, remaining and total payment — no overlap but the
 * name. One component switching its entire column set on a boolean is two
 * tables sharing a file, with every cell wrapped in a condition. These two share
 * the primitives, which is the layer the design system asks them to share.
 *
 * ## Why phone is its own column here
 *
 * On the register the number rides under the name, because there it is
 * something you read off a row you have already found. Here it is the column
 * you act from — chasing an unpaid balance means picking up the phone — so it
 * was asked for as a column of its own and gets one.
 *
 * ## Nothing here is sortable
 *
 * No header carries `sorted`, deliberately, and none links anywhere. Every money
 * column is summed from `client_charges` and `client_payments` *after* the page
 * of subscribers has been chosen — the same reason Plan and Weekly progress
 * cannot be ordered by on the register. Sorting by one would mean folding both
 * aggregates into the `ORDER BY` of the paged query, which breaks the `LIMIT`
 * and the pager's `count()` together. A `sorted={false}` would be worse than
 * nothing: it sets `aria-sort="none"`, which tells a screen reader the column
 * *can* be sorted.
 */



export function BillsTable({
  result,
  totals,
  ledgers,
  filtered,
  locale,
  today,
  prices,
  consulted,
}: {
  result: ClientListResult;
  /** Keyed by client id — see `subscriberTotalsByClient`. */
  totals: Map<string, SubscriberTotals>;
  /**
   * Each subscriber's own bills, keyed by client id and newest first.
   *
   * Not drawn as rows any more — the fold-out ledger is gone — but still read:
   * the Subscription column asks them where a term stands, and the charge card
   * asks them whether a subscription is already running. Loaded with the page
   * for the same reason the totals are: see `ledgerByClient`.
   */
  ledgers: Map<string, BillEntry[]>;
  filtered: boolean;
  locale: Locale;
  /**
   * Today in the clinic's own time zone, as `YYYY-MM-DD` — what the record-a-
   * payment card offers as the date.
   *
   * Passed down from the page rather than read from `new Date()` in the dialog:
   * a dietitian working from a browser in another zone would otherwise be
   * offered yesterday, and every row would have to derive it separately.
   */
  today: string;
  prices: ServicePrices;
  /** The subscribers whose ledger already holds a consultation. */
  consulted: Set<string>;
}) {
  const t = useTranslations('billing');

  return (
    <TableRoot>
      {/*
        `table-fixed` with a column group of equal shares: every column on this
        screen is an equal share of the width — `COLUMN_COUNT` of them,
        actions included — and none widens to fit what happens to be in it.

        Auto layout was measuring each column against its own content, so the
        grid moved as the register did — a long name or a five-figure total
        pushed its neighbours narrow, and the money columns stopped lining up
        down the page between one filter and the next. A column of figures is
        read by scanning it, and a scan wants the same edge on every row.

        `min-w` keeps the even shares honest on a narrow screen: a seventh of a
        phone is not a column, so the table holds its width and the scroll
        container around it does what it is there for.
      */}
      <Table className="min-w-[64rem] table-fixed">
        <colgroup>
          {Array.from({ length: COLUMN_COUNT }, (_, index) => (
            /* The share is derived from the count, so adding a column keeps
               the table even instead of leaving a stale fraction behind. */
            <col key={index} style={{ width: `${100 / COLUMN_COUNT}%` }} />
          ))}
        </colgroup>

        {/*
          The header is its own client component: the columns can be dragged
          into another order, that order lives in this browser, and the header
          is where it is changed. See `BillsHeaderRow`.
        */}
        <TableHeader sticky>
          <BillsHeaderRow locale={locale} />
        </TableHeader>

        {/*
          An empty list is still this table — the columns stay and the message
          sits in a body under them, exactly as on the register. See the long
          note on `TableEmpty` in `client-table.tsx`.

          Its own `<tbody>`, because every subscriber below is one too: each
          record is a row plus the ledger it opens, and a table may have as many
          bodies as it has records. See `BillsRow`.
        */}
        {result.items.length === 0 ? (
          <TableBody>
            <TableEmpty colSpan={COLUMN_COUNT}>
              <div className="flex flex-col items-center gap-4">
                <p>{filtered ? t('emptyFiltered') : t('empty')}</p>

                {filtered ? (
                  <Link
                    href="/app/clients/bills"
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  >
                    {t('clearFilters')}
                  </Link>
                ) : null}
              </div>
            </TableEmpty>
          </TableBody>
        ) : null}

        {result.items.map((client) => (
          <BillsRow
            key={client.id}
            client={client}
            /*
              A subscriber who has never been billed has no ledger rows and so
              no entry in either map. That is an ordinary state — most of a new
              register is in it — and it draws as zeroes rather than as blanks,
              because "₪0.00 billed" is a fact and an empty cell is a question.
            */
            money={totals.get(client.id) ?? emptyTotals}
            entries={ledgers.get(client.id) ?? []}
            locale={locale}
            today={today}
            prices={prices}
            consulted={consulted.has(client.id)}
          />
        ))}
      </Table>
    </TableRoot>
  );
}

