import { getTranslations } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { batchNumbers, billNumber, describeEntry, type BillEntry } from '@/features/billing/bill';
import { PrintBillButton } from '@/features/billing/components/print-bill-button';
import { RecordChargeDialog } from '@/features/billing/components/record-charge-dialog';
import { subscriptionStanding } from '@/features/billing/subscription';
import { RecordPaymentDialog } from '@/features/billing/components/record-payment-dialog';
import { STATUS_VARIANTS } from '@/features/billing/components/bills-status';
import { formatAmountCompact, paymentStatus, subscriberTotals } from '@/features/billing/money';
import type { ServicePrices } from '@/features/billing/services';
import type { Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * Expenses and bills, for one subscriber, inside their record.
 *
 * The Bills screen answers "who owes what" across a whole register; this
 * answers "what has happened on this account" for the person whose record is
 * open. Same ledger, same two dialogs, same printer — a charge recorded here is
 * a charge recorded there, and neither screen knows which one entered it.
 *
 * ## Why this is not the Bills table with one row in it
 *
 * That table is built to be read *down*: five columns, a status chip per row,
 * a chevron opening a panel underneath. With a single subscriber there is
 * nothing to compare against, so the columns become a horizontal row of labels
 * for facts that want to be a summary, and the chevron opens the only thing on
 * screen. What a record wants is the totals stated once and the operations
 * listed under them, which is what this is.
 *
 * ## The shape
 *
 * Three parts, in the order the question is asked:
 *
 * 1. **What it comes to** — billed, paid, and what is left, with the status
 *    chip. The outstanding figure is the one the eye should land on, so it is
 *    the largest thing on the panel and the other two are stated beside it.
 * 2. **What to do about it** — record a payment, add a charge, print the
 *    statement. One primary action: money coming in is the common case at a
 *    counter, and the other two are visibly secondary.
 * 3. **What has happened** — every operation, newest first.
 *
 * ## Notes on the drawing
 *
 * - Money is `tabular-nums` everywhere and isolated `dir="ltr"`: an amount runs
 *   left to right in both scripts, and a column of figures whose digits shift
 *   width as they change is a column nobody can compare down.
 * - The status is a chip with words in it, never a colour alone — the ledger's
 *   own rule, and the reason nothing here is red: an unpaid bill is an ordinary
 *   state of a working clinic.
 * - The ledger is a list, not a table. A five-column table on a 360px screen is
 *   either a horizontal scroll or five ellipses; each entry is one row that
 *   wraps, with its reference and date under its title.
 * - Empty says what to do rather than that there is nothing: an account with no
 *   operations is the normal state of a subscriber who joined this morning.
 */
export async function ClientExpensesPanel({
  locale,
  clientId,
  clientName,
  today,
  entries,
  prices,
  consulted,
}: {
  locale: Locale;
  clientId: string;
  clientName: string;
  /** Today, in the clinic's zone, resolved on the server. */
  today: string;
  /** Every charge and payment on this account, newest first. */
  entries: BillEntry[];
  /** What the clinic charges, from Settings. */
  prices: ServicePrices;
  /** Whether this subscriber's ledger already holds a consultation. */
  consulted: boolean;
}) {
  const t = await getTranslations('billing');

  /*
    Summed here rather than read from a column. There is no stored total — see
    the header of `src/db/schema/billing.ts` — and this is the same arithmetic
    the Bills table and the printed statement do, from the same rows.
  */
  const charged = entries
    .filter((entry) => entry.kind === 'charge')
    .reduce((total, entry) => total + entry.amountMinor, 0);
  const paid = entries
    .filter((entry) => entry.kind === 'payment')
    .reduce((total, entry) => total + entry.amountMinor, 0);

  const totals = subscriberTotals(charged, paid);
  const status = paymentStatus(totals);
  const batches = batchNumbers(entries);

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{t('expenses.title')}</CardTitle>
          <Badge variant={STATUS_VARIANTS[status]}>{t(`status.${status}`)}</Badge>
        </div>

        {/*
          The answer, then its parts. `remaining` is what somebody opens this
          panel to find out, so it is the figure at display size and the two it
          is derived from sit beside it in body type — hierarchy by size and
          space rather than by colour, which is doing other work here.
        */}
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <p className="text-body-sm text-muted-foreground">{t('fields.remaining')}</p>
            <p
              dir="ltr"
              className={cn(
                'text-display-sm font-bold tabular-nums',
                totals.remainingMinor > 0 ? 'text-destructive' : 'text-foreground',
              )}
            >
              {formatAmountCompact(locale, totals.remainingMinor)}
            </p>
          </div>

          <dl className="flex gap-8 text-body-sm">
            <div>
              <dt className="text-muted-foreground">{t('fields.totalPrice')}</dt>
              <dd dir="ltr" className="font-medium tabular-nums">
                {formatAmountCompact(locale, totals.chargedMinor)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('fields.totalPayment')}</dt>
              <dd
                dir="ltr"
                className={cn(
                  'font-medium tabular-nums',
                  totals.paidMinor > 0 ? 'text-status-on-track-fg' : 'text-foreground',
                )}
              >
                {formatAmountCompact(locale, totals.paidMinor)}
              </dd>
            </div>
          </dl>
        </div>

        {/*
          The operations: the same two dialogs the Bills screen opens, given the
          same subscriber. Labelled here and icon-only there — a register row has
          no width for words, a panel does, and a control that has to be pressed
          to find out what it does is one nobody presses first.

          One primary action. Money coming in is what happens at a counter, so
          the wallet is filled and the other two are outlined — the printer
          included, because a mark between two labelled buttons reads as a
          control that was left unfinished. It stays outlined rather than
          filled: it opens a document, it does not change the ledger.
        */}
        <div className="flex flex-wrap items-center gap-2">
          <RecordPaymentDialog
            locale={locale}
            clientId={clientId}
            clientName={clientName}
            today={today}
            trigger="button"
            emphasis="primary"
            /* The same ceiling the register puts on a payment, from the totals
               this panel has already summed. */
            remainingMinor={totals.remainingMinor}
          />
          <RecordChargeDialog
            locale={locale}
            clientId={clientId}
            clientName={clientName}
            today={today}
            prices={prices}
            consulted={consulted}
            /* The same rule the register enforces, read from the entries this
               panel is already drawing. */
            subscription={subscriptionStanding(entries, today)}
            trigger="button"
          />
          <PrintBillButton
            href={`/${locale}/app/clients/bills/${clientId}/print`}
            label={t('print.statementFor', { name: clientName })}
            hint={t('print.statement')}
            text={t('print.exportBills')}
          />
        </div>
      </CardHeader>

      <CardContent>
        {entries.length === 0 ? (
          /*
            An account with nothing on it is the normal state of a subscriber who
            joined this morning, so this says what to do next rather than
            reporting an absence.
          */
          <p className="py-8 text-center text-body-sm text-muted-foreground">
            {t('expenses.empty')}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {entries.map((entry) => {
              const described = describeEntry(entry, locale, t);
              const charge = entry.kind === 'charge';

              return (
                <li key={`${entry.kind}-${entry.id}`} className="flex items-center gap-3 py-3">
                  {/*
                    The mark says which side of the ledger this is before the
                    figure does — `aria-hidden`, because the amount's own sign
                    and the words beside it already say it to a screen reader.
                  */}
                  <span
                    aria-hidden
                    className={cn(
                      'grid size-9 shrink-0 place-items-center rounded-full',
                      charge
                        ? 'bg-status-medical-bg text-status-medical-fg'
                        : 'bg-status-on-track-bg text-status-on-track-fg',
                    )}
                  >
                    <Icon name={charge ? 'recordCharge' : 'recordPayment'} className="size-4" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-sm font-medium">{described.title}</p>
                    <p dir="ltr" className="text-caption text-muted-foreground tabular-nums">
                      {`#${billNumber(entry)} · ${described.date}`}
                      {batches.get(entry.id) ? ` · ${batches.get(entry.id)}` : ''}
                    </p>
                  </div>

                  <span dir="ltr" className="shrink-0 text-body-sm font-medium tabular-nums">
                    {described.amount}
                  </span>

                  <PrintBillButton
                    href={`/${locale}/app/clients/bills/${clientId}/print/${entry.id}`}
                    label={t('print.billNumbered', { number: billNumber(entry) })}
                    hint={t('print.bill')}
                    iconClassName="size-4"
                  />
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
