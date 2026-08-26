'use client';

import { useTranslations } from 'next-intl';

import { TableBody, TableCell, TableRow } from '@/components/ui/table';
import type { BillEntry } from '@/features/billing/bill';
import { BillRowMenu } from '@/features/billing/components/bill-row-menu';
import { SendBillButton } from '@/features/billing/components/send-bill-button';
import { RecordChargeDialog } from '@/features/billing/components/record-charge-dialog';
import { RecordPaymentDialog } from '@/features/billing/components/record-payment-dialog';
import type { ServicePrices } from '@/features/billing/services';
import { formatAmountCompact, paymentStatus, type SubscriberTotals } from '@/features/billing/money';
import { subscriptionStanding } from '@/features/billing/subscription';
import type { ClientListItem } from '@/features/clients/queries';
import type { Locale } from '@/i18n/routing';

import { BillsCell } from './bills-cell';
import { useBillsColumns } from './use-bills-columns';

/**
 * One subscriber on the Bills screen: the row of figures, and the controls that
 * act on them.
 *
 * ## Why the record is a client component and the table is not
 *
 * The columns can be dragged into another order, and that order lives in this
 * browser — so the row has to read it to know which cell to draw where. The
 * table around it stays on the server: its header, its empty state and its
 * column list have nothing to react to.
 *
 * ## Why the row sits in a `<tbody>` of its own
 *
 * A table may have several bodies, and that is the table model's own way of
 * saying "these rows are one record" — the prop is `linked` on `TableBody`,
 * and the dashboard's register already groups rows this way.
 *
 * **The bills used to fold out underneath.** A chevron at the end of the row
 * opened a second `<tr>` listing every operation on the account, each with a
 * printer of its own. It is gone, and the printer that remains prints the whole
 * account in one press — which is what the panel was mostly opened to do. What
 * the panel could say that the statement cannot, it said inside a row of a
 * table nobody could scan; the record's own Expenses tab is where a
 * subscriber's ledger is read, and the name in this row now opens straight
 * onto it.
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
        <TableCell className="relative text-center">
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
          <div className="flex items-center justify-center gap-1 whitespace-nowrap">
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
              Printing left the row for the menu — it is labelled "Print all
              bills" in there, which is what the mark could never say. See
              `BillRowMenu`.
            */}

            {/*
              The last bill on WhatsApp, which is how most of this clinic’s
              subscribers actually receive one — the printer is for the copy
              handed across the desk. It closes the row because it is the one
              control here that reaches somebody outside the clinic; see
              `SendBillButton` for why it is the only one with a hover card.

              **The last bill, not the statement.** A row is where a dietitian
              stands after recording a charge, and what they want to send is
              the thing they just recorded. The whole account is a different
              request, and it is one press away in the menu beside this and on
              the record itself — both places with room to say which they are.

              Which bill that is, is resolved on the server: a row holds a
              subscriber and no ledger. See `renderBill`’s `latest`.
            */}
            <SendBillButton
              locale={locale}
              clientId={client.id}
              latest
              phone={client.phone}
              labels={{
                action: t('sendBill.lastBill'),
                confirmTitle: t('sendBill.confirmLastTitle'),
                confirmBody: t('sendBill.confirmLastBody', { name: client.fullName }),
                sent: t('sendBill.sentBill'),
              }}
            />

            {/*
              Everything else this account can be sent through: a reminder about
              what is owed, and the whole ledger on paper. Last in the row,
              because a menu is where you look when the marks beside it are not
              what you wanted.
            */}
            <BillRowMenu
              locale={locale}
              clientId={client.id}
              /* The card's half of the rule that greys the reminder out —
                 `sendPaymentReminderAction` re-reads it on the server. */
              remainingMinor={money.remainingMinor}
              labels={{
                more: t('rowMenu.more'),
                reminder: t('rowMenu.reminder'),
                reminderNothing: t('rowMenu.reminderNothing'),
                confirmTitle: t('rowMenu.confirmTitle'),
                confirmBody: t('rowMenu.confirmBody', {
                  name: client.fullName,
                  amount: formatAmountCompact(locale, money.remainingMinor),
                }),
                sent: t('rowMenu.sent'),
                printAll: t('rowMenu.printAll'),
                printAllFor: t('rowMenu.printAllFor', { name: client.fullName }),
              }}
            />
          </div>
        </TableCell>
      </TableRow>

    </TableBody>
  );
}
