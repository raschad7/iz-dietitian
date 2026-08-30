import { getTranslations } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDivider, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { batchNumbers, billNumber, describeEntry, type BillEntry } from '@/features/billing/bill';
import { ExpensesActionsMenu } from '@/features/billing/components/expenses-actions-menu';
import { PrintBillButton } from '@/features/billing/components/print-bill-button';
import { ExpensesBillList } from '@/features/billing/components/expenses-bill-list';
import { SendBillButton } from '@/features/billing/components/send-bill-button';
import { MENU_ITEM_CLASS, PANEL_ACTION_CLASS } from '@/features/billing/components/row-action';
import { RecordChargeDialog } from '@/features/billing/components/record-charge-dialog';
import { subscriptionStanding } from '@/features/billing/subscription';
import { RecordPaymentDialog } from '@/features/billing/components/record-payment-dialog';
import { STATUS_VARIANTS } from '@/features/billing/components/bills-status';
import { formatAmountCompact, paymentStatus, subscriberTotals } from '@/features/billing/money';
import { methodTone } from '@/features/billing/payment-methods';
import { serviceTone, type ServicePrices } from '@/features/billing/services';
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
 * 1. **What it comes to** — what is left, at display size on its own line at
 *    the card's reading edge, because it is the one figure the eye should land
 *    on. Billed and paid are tiles up in the title row beside the status chip:
 *    the three things that describe the account, together and away from the
 *    controls.
 * 2. **What to do about it** — record a payment, add a charge, and a menu
 *    holding the two that produce a document. On the debt's own line, at the
 *    far edge. One primary action: money coming in is the common case at a
 *    counter, and the rest are visibly secondary.
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
  phone,
  today,
  entries,
  prices,
  consulted,
}: {
  locale: Locale;
  clientId: string;
  clientName: string;
  /**
   * The subscriber's number as the record holds it — what the WhatsApp sends
   * go to. Passed down rather than queried here: the record above has already
   * loaded this person, and a second read for one column would be this panel
   * asking the database something its own caller already knows.
   */
  phone: string | null;
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
    /*
      Fills the column rather than sizing to its rows, so it ends level with the
      identity panel beside it. The bill list is capped at seven, so what fills
      the card is a known quantity rather than however long the account happens
      to be.
    */
    <Card className="lg:flex lg:h-full lg:min-h-0 lg:flex-col">
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{t('expenses.title')}</CardTitle>

          {/*
            The parts and the standing, together at the far end of the title
            row. Both answer "where is this account" rather than "what should I
            do", so they belong beside each other and beside the heading they
            qualify — and the row below is left to the debt and the controls,
            which is one question and one set of answers.
          */}
          <div className="flex flex-wrap items-center gap-2">
            {/*
              The two figures the debt comes from, each on a tile of its own, at
              the top of the card beside the status chip.

              **Why up here.** They have been under the debt and then between it
              and the buttons; both put them on the line the reader is working —
              the debt is what that line is for, and a press lands on it. Up
              beside the chip they sit with the other thing that describes the
              account rather than acts on it, at the end of the title row: in
              Arabic the top left corner, in English the top right. The line
              below is then one figure and one set of controls, which is as much
              as a working row should hold.

              **Why they are drawn at all rather than just stated.** As plain text
              beside a display-size number they read as a caption on it. A pair of
              matched tiles says something the type sizes alone could not: that
              these are two of a kind, of equal standing, and that the figure
              beside them is neither of them.

              **A tile, not a `Card`.** `Card` is the record's own surface — the
              thing this panel *is* — and nesting one inside another says a
              section has begun. What these need is the shallowest surface the
              system has: the sunken grey `bg-muted/40` behind the divider border,
              one step in from the card it sits on. The same tile the planner
              draws its own read-only figures on.

              **A glyph on each, and the two that are already the clinic's words
              for these.** `recordCharge` — the banknote with the arrow going up —
              is what Add a bill wears, and `recordPayment` is the wallet on
              Record a payment. So the tile showing what has been charged carries
              the mark of the button that charges, and the one showing what has
              come in carries the mark of the button that takes it. A picture
              invented for a summary tile would be a third thing to learn; these
              are ones the reader has already pressed.

              Decorative, so no `label` — the `<dt>` beside each is the name of
              the figure, and an icon that repeated it would have a screen reader
              say the row twice.

              **Centred, all three parts together**, and the label and figure on
              one line: each tile is one statement — "Total price 300" — read in a
              glance. `whitespace-nowrap` on the whole entry, because on one line
              the only break available falls between a label and its own number,
              which is the one place it must not.

              **Built to the chip's own measurements, because they sit beside
              it.** `rounded-full`, `px-2.5 py-0.5`, `text-label` and a `size-3`
              glyph — the same numbers `badgeVariants` uses, restated here
              rather than borrowed by rendering a `Badge`: a badge is a *state*,
              one word the system colours, and these are a name with a figure
              after it. Same shape, different thing, so they match by
              construction and not by inheritance.

              ⚠ Those four values are the ones to change together. If the badge
              is ever resized, this row grows a step it does not take, and the
              three marks stop reading as one set.

              Each is as wide as what is in it and no wider — they were `flex-1`
              for a while, sharing a row's slack, which drew two long boxes with
              their contents marooned in the middle. Below the wrap point they
              stack, which is the right shape on a phone.
            */}
            <dl className="flex flex-wrap items-center justify-center gap-2 text-label">
              <div className="flex items-center gap-1 whitespace-nowrap rounded-full border border-border bg-muted/40 px-2.5 py-0.5">
                <Icon name="recordCharge" className="size-3 text-muted-foreground" />
                <dt className="text-muted-foreground">{t('fields.totalPrice')}</dt>
                <dd dir="ltr" className="font-medium tabular-nums">
                  {formatAmountCompact(locale, totals.chargedMinor)}
                </dd>
              </div>
              <div className="flex items-center gap-1 whitespace-nowrap rounded-full border border-border bg-muted/40 px-2.5 py-0.5">
                <Icon name="recordPayment" className="size-3 text-muted-foreground" />
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
            <Badge variant={STATUS_VARIANTS[status]}>{t(`status.${status}`)}</Badge>
          </div>
        </div>

        {/*
          The working line: what is owed, and what you can do about it. The two
          figures behind the debt are up in the title row with the status chip —
          see the note there for why.

          **Reading edge first, actions at the far edge.** The debt starts where
          the eye already is — the same edge the title above it starts on — and
          the controls sit at the opposite end of the line, which in Arabic puts
          them on the left and in English on the right. The same place either
          way: as far from the figure as the card is wide, so a press lands
          nowhere near the thing being read.

          They were stacked before, figures then buttons, and the row is worth
          the change on this card in particular: it is the header of a panel
          that has a bill list under it, and two stacked bands pushed that list
          down for no reading gained. Side by side, the answer and the actions
          fit on one line and the ledger starts higher.

          It wraps rather than squeezing: below the header's own breakpoint the
          buttons drop under the figures, which is the stack this replaced and
          the right shape at that width.

          `items-end` sits the buttons on the bottom of the row rather than the
          top. A display-size figure and a row of controls are two different
          heights, and hung from the top edge the buttons line up with the
          number's cap where nothing else does. On the bottom they share the
          baseline the line ends on.
        */}
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          {/*
            The answer, at the reading edge and alone on its line. `remaining`
            is what somebody opens this panel to find out, so it is the figure
            at display size and the two it is derived from are a row away, up
            with the chip — hierarchy by size and by distance, not by colour,
            which is doing other work here.

            Label and figure on one line, baseline-aligned: the debt is a
            two-word label and a short number, and stacking them left the label
            stranded over a figure half its width. Baseline rather than centre
            so the small label sits on the same line the display-size number
            stands on.
          */}
          <div className="flex items-baseline gap-3">
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

          {/*
            The same two dialogs the Bills screen opens, given the same
            subscriber. Labelled here and icon-only there — a register row has
            no width for words, a panel does, and a control that has to be
            pressed to find out what it does is one nobody presses first.

            One primary action. Money coming in is what happens at a counter,
            so the wallet is filled and Add a bill beside it is outlined. The
            two that produce a document rather than a ledger entry are behind
            the menu at the end — see `ExpensesActionsMenu` for why they are no
            longer peers of these two.
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
              triggerClassName={PANEL_ACTION_CLASS}
            />
            {/*
              Next to Add a bill, and after it in the flow — so it sits on that
              button's left in Arabic and on its right in English, which is the
              same place either way: the end of the row, furthest from the
              primary action.

              Both items keep the `ghost`/`sm` menu shape rather than the panel's
              outlined one. Inside a popover the outline is a box drawn around a
              list row, and two of them read as two more buttons rather than as a
              menu.
            */}
            <ExpensesActionsMenu label={t('rowMenu.more')}>
              <PrintBillButton
                href={`/${locale}/app/clients/bills/${clientId}/print`}
                label={t('print.statementFor', { name: clientName })}
                hint={t('print.statement')}
                text={t('print.exportBills')}
                className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), MENU_ITEM_CLASS)}
                iconClassName="size-4"
              />
              {/*
                The same statement, sent instead of printed — every bill on the
                account in one document, which is what makes it the twin of Export
                bills rather than a bulk send of many messages. One document is
                also one thing for the subscriber to keep and one thing for
                WhatsApp to carry; a message per bill would be a notification
                storm on the phone of somebody who has been coming for a year.

                The pair being twins is most of why they share a menu: what is
                behind this mark is one document and the two ways out of the
                clinic with it.

                "Send all bills" rather than "Send by WhatsApp": inside a menu
                of two items, what the reader is choosing between is *what goes
                out*, not which app carries it. It also names the scope, which
                is the thing worth being sure of before pressing something that
                cannot be unsent — and it pairs with Export bills above it,
                where the two now differ in the one word that actually differs.
              */}
              <SendBillButton
                locale={locale}
                clientId={clientId}
                phone={phone}
                text
                className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), MENU_ITEM_CLASS)}
                iconClassName="size-4"
                labels={{
                  action: t('sendBill.sendAll'),
                  confirmTitle: t('sendBill.confirmAllTitle'),
                  confirmBody: t('sendBill.confirmAllBody', {
                    name: clientName,
                  }),
                  sent: t('sendBill.sent'),
                }}
              />
            </ExpensesActionsMenu>
          </div>
        </div>
      </CardHeader>

      {/*
        The card genuinely has two parts, so it is ruled into two: above the
        line, where the account stands and what can be done about it — the
        totals, the debt and the controls, one block; below it, the operations
        that produced them. Without the rule those run together as one long
        header, and the ledger reads as more of the summary rather than as the
        second thing on the card.

        `CardDivider` rather than a `border-b` on the header: an inset hairline
        parts two sections of one surface, where a full-bleed rule cuts the card
        in half and reads as two cards that happen to touch.
      */}
      <CardDivider />

      {/*
        `min-h-0` so the list can be shorter than its content asks for instead
        of pushing the card past the column, and **no `overflow`** — the card
        never scrolls.

        That is a decision with a cost, and it is the intended one: seven rows
        fit the record shell at ordinary window heights, and on a window short
        enough that they do not, the last bill is clipped rather than reachable
        by scrolling. The pager is what keeps the list short enough for this to
        hold; dropping the page size is the lever if a clinic screen turns out
        to be shorter than seven rows.
      */}
      <CardContent className="lg:min-h-0 lg:flex-1">
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
          /*
            The rows are built here — on the server, with `describeEntry` and
            the server's own translations — and handed over finished. The list
            below only decides which seven of them are on screen. See
            `ExpensesBillList` for why the page is state rather than a `?page=`.
          */
          <ExpensesBillList
            rows={entries.map((entry) => {
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
                      /*
                        A charge is tinted by *what was sold*, from the same
                        list the charge card colours its options with — see
                        `serviceTone`. A subscription recorded from a blue
                        option would otherwise arrive here as a red row: the
                        same fact drawn two ways on two screens a dietitian
                        moves between.

                        Which side of the ledger a row is on is carried by the
                        glyph, which was always the half doing that work — a
                        charge and a payment are different marks, not one mark
                        in two colours.

                        A payment is tinted the same way, by how the money
                        came in — cash green, card amber, from the very list
                        the wallet card offers them from.

                        A freehand charge keeps the old red and a `transfer`
                        or `other` payment keeps the settled green: neither
                        names something the cards still offer, so there is no
                        colour to agree with and the fallback is the row’s own
                        side of the ledger.
                      */
                      charge
                        ? (serviceTone(entry.service) ??
                            'bg-status-medical-bg text-status-medical-fg')
                        : (methodTone(entry.method) ??
                            'bg-status-on-track-bg text-status-on-track-fg'),
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
                    label={t('print.billNumbered', {
                      number: billNumber(entry),
                    })}
                    hint={t('print.bill')}
                    iconClassName="size-4"
                  />

                  {/* And the same bill on WhatsApp. `size-4` so the pair are
                      the same weight in a dense list. */}
                  <SendBillButton
                    locale={locale}
                    clientId={clientId}
                    entryId={entry.id}
                    phone={phone}
                    iconClassName="size-4"
                    labels={{
                      action: t('sendBill.bill'),
                      confirmTitle: t('sendBill.confirmOneTitle'),
                      confirmBody: t('sendBill.confirmOneBody', {
                        name: clientName,
                        number: billNumber(entry),
                      }),
                      sent: t('sendBill.sentBill'),
                    }}
                  />
                </li>
              );
            })}
          />
        )}
      </CardContent>
    </Card>
  );
}
