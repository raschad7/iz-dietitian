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

import { ACTIONS_COLUMN_WIDTH, BILLS_COLUMNS, COLUMN_COUNT } from './bills-columns';
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
        `table-fixed`, with the actions column held back and the rest of the
        width split evenly between the columns that carry data.

        Auto layout was measuring each column against its own content, so the
        grid moved as the register did — a long name or a five-figure total
        pushed its neighbours narrow, and the money columns stopped lining up
        down the page between one filter and the next. A column of figures is
        read by scanning it, and a scan wants the same edge on every row.

        **The actions column is not an equal share, and giving it one was a
        bug.** Its four controls are 228px of fixed furniture that does not
        scale with the table — see `ACTIONS_COLUMN_WIDTH` — so a seventh of the
        width was a cell too small to hold its own contents on anything narrower
        than a desktop, and the menu at the end of the row was drawn outside the
        table. Taking it off the top first is what keeps the row intact at every
        width; the six columns that *do* scale then share what is left.

        **The name takes two of those shares, and the width is not declared
        here.** A `colgroup` is positional and these columns can be dragged into
        another order, so a wide first track would have stayed in the first slot
        while the name moved out of it. The five columns with no `<col>` width
        split what is left evenly; the name's own heading carries its width and
        travels with it. See `NAME_COLUMN_WIDTH`.

        `min-w` keeps those six shares honest when the screen runs out. It was
        `64rem`, which is wider than a tablet's content area once the rail is
        taken off — so Bills scrolled sideways at a width where the register
        beside it did not, on a screen where sideways is the one direction a
        table should not move. `44rem` is what the six columns need to stay
        readable, and it leaves the sideways scroll for the phones that
        genuinely cannot fit a seven-column register.
      */}
      <Table className="min-w-[44rem] table-fixed">
        <colgroup>
          {/* One `<col>` per movable column, carrying no width — see above. */}
          {BILLS_COLUMNS.map((column) => (
            <col key={column.key} />
          ))}
          <col style={{ width: ACTIONS_COLUMN_WIDTH }} />
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

