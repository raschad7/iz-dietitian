'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';

import { TableBody, TableCell, TableRow } from '@/components/ui/table';
import type { BillEntry } from '@/features/billing/bill';
import { BillLedgerPanel } from '@/features/billing/components/bill-ledger-panel';
import { BillRowActions } from '@/features/billing/components/bill-row-actions';
import { RecordChargeDialog } from '@/features/billing/components/record-charge-dialog';
import { RecordPaymentDialog } from '@/features/billing/components/record-payment-dialog';
import type { ServicePrices } from '@/features/billing/services';
import { paymentStatus, type SubscriberTotals } from '@/features/billing/money';
import { subscriptionStanding } from '@/features/billing/subscription';
import type { ClientListItem } from '@/features/clients/queries';
import type { Locale } from '@/i18n/routing';

import { BillsCell } from './bills-cell';
import { COLUMN_COUNT } from './bills-columns';
import { useBillsColumns } from './use-bills-columns';

/**
 * One subscriber on the Bills screen: the row of figures, and the bills folded
 * under it.
 *
 * ## Why the record is a client component and the table is not

 * The chevron at the end of the row opens a second `<tr>` beneath it, and the
 * two are siblings — neither can hold state the other reads, so the state lives
 * in the smallest thing that contains both, which is this. The table around it
 * stays on the server: its header, its empty state and its column list have
 * nothing to react to.
 *
 * ## Why the pair sits in a `<tbody>` of its own
 *
 * A table may have several bodies, and that is the table model's own way of
 * saying "these rows are one record" — the prop is `linked` on `TableBody`, and
 * the dashboard's register already hangs a second line under a row this way.
 * The alternative, a nested `<table>` inside one cell, lines its columns up
 * with nothing and is announced as a table inside a table.
 *
 * `linked` stays on the `<TableRow>` rather than moving up to the body,
 * deliberately: it is what stretches the name's link over the row, and on the
 * body that overlay would cover the opened panel and swallow every print button
 * in it.
 */
export function BillsRow({
  client,
  money,
  entries,
  locale,
  today,
  prices,
  consulted,
}: {
  client: ClientListItem;
  money: SubscriberTotals;
  /** This subscriber's own bills, newest first — see `ledgerByClient`. */
  entries: readonly BillEntry[];
  locale: Locale;
  /** Today in the clinic's zone — what the two dialogs offer as the date. */
  today: string;
  prices: ServicePrices;
  consulted: boolean;
}) {
  const t = useTranslations('billing');
  const { columns } = useBillsColumns();
  const [open, setOpen] = useState(false);

  /*
    **The close is instant, and that is the fix rather than a shortcut.**

    This panel used to be held on screen for the length of a closing animation,
    which is by definition a delay: however short and however smooth, the space
    it occupies is not given back until the last frame, and the rows below do
    not move until then. Three attempts at tuning that — shorter, longer,
    without the fade, with layout containment — all made a smoother version of
    the same wait, because the wait was the animation.

    Opening keeps its travel. Arriving is where an animation earns its cost:
    there is nothing on screen yet, so nothing is being withheld, and growing to
    height is what stops the table from jumping. Leaving is the opposite —
    what the reader asked for is the space back.
  */
  /* Ties the chevron to the panel for a screen reader. `useId`, because the
     same row is rendered for every subscriber on the page. */
  const panelId = useId();

  const status = paymentStatus(money);
  /*
    Read once for the row: the Subscription column draws it, and the charge card
    greys its subscription options out on the same answer. Two reads of the same
    bills could not disagree, but they could drift apart in what they mean.
  */
  const subscription = subscriptionStanding(entries, today);

  return (
    <TableBody>
      <TableRow linked>
        {/*
          Drawn in the reader's own column order — see `useBillsColumns`. One
          function keyed by column, rather than a fixed run of `<TableCell>`s: a
          fixed run cannot be reordered without either repeating every cell once
          per arrangement, or letting the header and the body disagree about
          which column is which, which is the one bug a movable column can
          introduce.
        */}
        {columns.map((column) => (
          <BillsCell
            key={column.key}
            column={column.key}
            client={client}
            money={money}
            status={status}
            /* Read from the bills already in hand, against the clinic's own
               today — no query of its own. See `subscriptionStanding`. */
            subscription={subscription}
            today={today}
            locale={locale}
            t={t}
          />
        ))}

        {/*
          `relative`, so the row's own actions sit above its stretched
          name link rather than under it — the `::after` overlay covers
          every cell, and an action inside it is otherwise unclickable.
          This is the same construction the register's action cell uses.
        */}
        <TableCell className="relative text-end">
          {/*
            Charge first, payment second — the order the money moves in.
            A subscriber is billed and then pays, and putting the wallet
            first would put the second half of the story at the start of
            the pair. Printing closes the group, after the two controls
            that make the thing being printed.

            `justify-end` keeps them against the row's far edge in both
            scripts; `whitespace-nowrap` stops the four wrapping onto two
            lines and doubling the row height on a narrow window.
          */}
          <div className="flex items-center justify-end gap-1 whitespace-nowrap">
            <RecordChargeDialog
              locale={locale}
              clientId={client.id}
              clientName={client.fullName}
              today={today}
              prices={prices}
              consulted={consulted}
              /* Greys out a second subscription while this one runs. The rule
                 itself is in `recordCharge`. */
              subscription={subscription}
            />
            <RecordPaymentDialog
              locale={locale}
              clientId={client.id}
              clientName={client.fullName}
              today={today}
              /* The ceiling on the card. `recordPayment` enforces it. */
              remainingMinor={money.remainingMinor}
            />

            {/*
              Printing closes the group, after the two controls that
              make the thing being printed. A subscriber with no ledger
              still gets both: the statement of an empty account is a
              real document — it says nothing has been billed — and the
              menu says so in as many words.
            */}
            <BillRowActions
              locale={locale}
              clientId={client.id}
              clientName={client.fullName}
              open={open}
              onToggle={() => setOpen((was) => !was)}
              panelId={panelId}
              t={t}
            />
          </div>
        </TableCell>
      </TableRow>

      {/*
        Mounted only while it is open. A panel that is always in the DOM and
        merely hidden puts every bill of every subscriber on the page into the
        accessibility tree and the tab order at once — on a full page of the
        register that is hundreds of rows nobody asked for.
      */}
      {open ? (
        <BillLedgerPanel
          id={panelId}
          locale={locale}
          clientId={client.id}
          entries={entries}
          colSpan={COLUMN_COUNT}
        />
      ) : null}
    </TableBody>
  );
}
