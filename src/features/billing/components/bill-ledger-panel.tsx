'use client';

import { useTranslations } from 'next-intl';

import { TableCell, TableRow } from '@/components/ui/table';
import { batchNumbers, billNumber, describeEntry, type BillEntry } from '@/features/billing/bill';
import { PrintBillButton } from '@/features/billing/components/print-bill-button';
import type { Locale } from '@/i18n/routing';
import { formatTime, stripBidiMarks } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The panel's columns, in the order they are read.
 *
 * Fixed, unlike the table above it. Reordering belongs to the register — the
 * screen a dietitian stands in front of all day and reads across — and giving
 * the same gesture to a panel that opens under one row would mean two orders to
 * remember and a drag target inside a drag target.
 *
 * `numeric` marks a column whose *value* runs left-to-right whatever direction
 * the page is in: a batch number, a reference, a date, an amount.
 */
const LEDGER_COLUMNS = [
  { key: 'batchNo', numeric: true },
  { key: 'billNo', numeric: true },
  { key: 'date', numeric: true },
  { key: 'amount', numeric: true },
  { key: 'method', numeric: false },
  { key: 'note', numeric: false },
] as const;

type LedgerColumnKey = (typeof LEDGER_COLUMNS)[number]['key'];

/** Every column above, plus the unnamed one the row's printer sits in. */
const LEDGER_COLUMN_COUNT = LEDGER_COLUMNS.length + 1;

/**
 * A subscriber's own bills, opened underneath their row.
 *
 * ## Why this is a second row and not a popover
 *
 * It began as a dropdown menu, which was the wrong container: a menu is a list
 * of *commands*, and this is a list of *records* — six fields per bill that
 * want columns, alignment and a heading, none of which a menu row can carry.
 * Read across, "#4 · PAY-… · 24/08 · ₪1,500 · cash" is a table, so it is drawn
 * as one, inside the table it belongs to rather than floating over it.
 *
 * Several `<tr>`s making one record is what `TableBody`'s grouping is for — the
 * dashboard's register already hangs a second line under a row this way.
 *
 * ## What is missing from the actions column, and why
 *
 * One control per bill: print. Editing or reversing a recorded charge are real
 * operations with real questions behind them — what happens to a bill already
 * handed to a subscriber, who may do it, what the ledger keeps of the old value
 * — and none of those are answered yet. An icon that looked like the others and
 * did nothing would be worse than an absence.
 */
export function BillLedgerPanel({
  id,
  locale,
  clientId,
  entries,
  /** How many columns the row above spans, so this one lines up under all of it. */
  colSpan,
}: {
  /** What the row's chevron points at with `aria-controls`. */
  id: string;
  locale: Locale;
  clientId: string;
  entries: readonly BillEntry[];
  colSpan: number;
}) {
  const t = useTranslations('billing');

  /*
    A fact about the set, not about a row — see `batchNumbers`. Computed once
    for the panel rather than per cell, so every row is numbered against the
    same list.
  */
  const batches = batchNumbers(entries);

  return (
    /*
      `plain` — no hover fill and no pointer. The row above is the record you
      click; this is what it opened, and lighting up under the cursor would say
      it leads somewhere too.
    */
    <TableRow plain>
      {/*
        `p-0` on the cell so the panel can draw its own edge to edge, and the
        inset background is what separates what was opened from the register it
        was opened from.
      */}
      <TableCell colSpan={colSpan} className="bg-muted/40 p-0">
        {/*
          `w-0 min-w-full` is not decoration: it stops the panel from moving the
          register's own columns.

          The row above uses the browser's automatic table layout, which sizes
          every column from the widest thing in it — and this cell spans all of
          them. Without a width of its own the panel's contents join that
          calculation, so opening one shoves the subscriber's name, the amounts
          and the status chip sideways, and closing it shoves them back. A cell
          that reports zero intrinsic width takes no part in the measurement;
          `min-w-full` then fills the width the row actually turned out to be.
        */}
        <div
          id={id}
          /*
            `px-3` is what `TableCell` uses, so the panel's first column
            starts exactly under the subscriber's name in the row that opened
            it and its last ends under the actions — the panel reads as part
            of the table rather than as a card someone dropped into it.
          */
          className="w-0 min-w-full px-3 py-3"
        >
          {/*
            `table-fixed` is what makes the columns one width each.

            Left to itself a table sizes columns by their content, so the widths
            moved with the data — a subscriber whose notes were long got a wide
            Note column and a squeezed Amount, and the next subscriber's panel
            was laid out differently again. Fixed layout ignores the content and
            divides the width evenly, so every panel on the page has its columns
            in the same places and the eye can run down them.

            The cost is that content no longer widens its column, which is why
            the columns that can hold a sentence wrap inside theirs.
          */}
          <table className="w-full table-fixed border-collapse text-sm">
            <thead>
              <tr>
                {LEDGER_COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className="border-b border-border/60 pb-2 pe-6 text-start text-xs font-medium text-muted-foreground"
                  >
                    {t(`ledger.${column.key}`)}
                  </th>
                ))}

                {/*
                  The actions column's heading — named for a screen reader and
                  silent on screen, like the one on the table above.
                */}
                <th scope="col" className="border-b border-border/60 pb-2 text-end">
                  <span className="sr-only">{t('ledger.actions')}</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={LEDGER_COLUMN_COUNT} className="py-3 text-muted-foreground">
                    {t('print.noBills')}
                  </td>
                </tr>
              ) : null}

              {entries.map((entry) => {
                const described = describeEntry(entry, locale, t);

                return (
                  <tr key={entry.id} className="border-b border-border/40 last:border-b-0">
                    {/*
                      Drawn from the same list the headings are, through one
                      function keyed by column, so a heading and the cells under
                      it cannot come apart.
                    */}
                    {LEDGER_COLUMNS.map((column) => (
                      <td
                        key={column.key}
                        className={cn(
                          'py-2 pe-6',
                          /* The two references carry a little weight because
                             they are what a reader scans for. The amount does
                             not: a price is drawn at the same weight as every
                             other figure on this screen. */
                          (column.key === 'batchNo' || column.key === 'billNo') && 'font-medium',
                          (column.key === 'method' || column.key === 'note') && 'break-words text-muted-foreground',
                        )}
                      >
                        <LedgerCell
                          column={column.key}
                          entry={entry}
                          locale={locale}
                          batch={batches.get(entry.id)}
                          described={described}
                          chargeLabel={t('ledger.chargeKind')}
                        />
                      </td>
                    ))}

                    <td className="py-2 text-end">
                      {/*
                        This one bill, printed over the screen it was opened on.
                        Smaller than the row's printer above it: the panel's own
                        type is a step down from the register's, and an icon at
                        the row's weight would out-shout the figures beside it.
                      */}
                      <PrintBillButton
                        href={`/${locale}/app/clients/bills/${clientId}/print/${entry.id}`}
                        label={t('print.billNumbered', { number: billNumber(entry) })}
                        hint={t('print.bill')}
                        iconClassName="size-4"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * One cell's contents, by column.
 *
 * Split out so the row above stays a list of columns rather than a switch
 * wrapped in markup — and so a column that moves carries its own formatting
 * with it.
 *
 * **Direction goes on the value, never on the cell.** A `<td dir="ltr">` inside
 * an Arabic table takes its own direction for everything, including its logical
 * padding: `pe-6` on such a cell pads the side away from the next column, so
 * the gap lands outside the table and its figures run into the heading beside
 * them. The cell stays in the page's direction; only the figure is isolated.
 */
function LedgerCell({
  column,
  entry,
  locale,
  batch,
  described,
  chargeLabel,
}: {
  column: LedgerColumnKey;
  entry: BillEntry;
  locale: Locale;
  batch: number | undefined;
  described: { title: string; date: string; amount: string };
  chargeLabel: string;
}) {
  switch (column) {
    /* The short number a person says out loud — see `batchNumbers`. */
    case 'batchNo':
      return (
        <span dir="ltr" className="tabular-nums">
          {batch ?? <Missing />}
        </span>
      );

    /*
      The reference the clinic quotes. `whitespace-nowrap`: a reference broken
      across two lines is not one anybody can read down the phone.
    */
    case 'billNo':
      return (
        <span dir="ltr" className="whitespace-nowrap tabular-nums">
          {billNumber(entry)}
        </span>
      );

    /*
      The day the money moved, with the time it was entered beside it. Two
      different facts — see the schema — and the panel has room to say both.
    */
    case 'date':
      return (
        <>
          <span dir="ltr" className="tabular-nums">
            {described.date}
          </span>
          {/*
            No `dir="ltr"` on the time, and that is the whole point of it being
            different from the date beside it.

            `م` and `ص` are Arabic letters, so in an Arabic run the marker lands
            to the *left* of the digits — `٣:٢٢ م` as it is written and read.
            Forced into an LTR run it was pushed to the right of them instead,
            which is not how anyone writes the time in Arabic. English is
            untouched: `PM` is Latin, so it stays where it already was, after
            the digits.

            The digits do not need the isolation the date does — a bare
            `3:22` has nothing in it a bidirectional layout can reorder, while
            `24/08/2026` has two slashes that can.
          */}
          <span className="ms-2 text-xs text-muted-foreground tabular-nums">
            {stripBidiMarks(formatTime(locale, entry.createdAt))}
          </span>
        </>
      );

    /*
      The amount as it was recorded, sign and all — no minus is added to a
      payment for being one.

      A payment used to print with a leading minus, on the argument that it
      moves the account the other way. It reads as a *deduction* instead: the
      figure the clinic received is ₪1,500, not −₪1,500, and a column where
      every second row is negative is one nobody can add up by eye. Which side
      of the ledger a row is on is said by the Method column beside it, in
      words, which is where a reader was looking anyway.

      The one negative that survives is the one that means something: a refund
      is stored negative — see `client_payments` — and prints negative, because
      that is money going back out.
    */
    case 'amount':
      return (
        <span dir="ltr" className="whitespace-nowrap tabular-nums">
          {described.amount}
        </span>
      );

    /* A payment is named by how it was taken; a charge has no method to name. */
    case 'method':
      return <>{entry.kind === 'payment' ? described.title : chargeLabel}</>;

    case 'note':
      return <>{entry.note ?? <Missing />}</>;
  }
}

/** An em-dash for a field the row does not have. Matches the table above it. */
function Missing() {
  return (
    <span aria-hidden className="text-muted-foreground/60">
      —
    </span>
  );
}
