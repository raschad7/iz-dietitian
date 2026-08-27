'use client';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { TableCell } from '@/components/ui/table';
import { patientToneStyle } from '@/features/booking/patient-color';
import type { BillTranslator } from '@/features/billing/bill';
import { formatAmountCompact, type PaymentStatus, type SubscriberTotals } from '@/features/billing/money';
import { subscriptionCountdown, type Subscription } from '@/features/billing/subscription';
import type { ClientListItem } from '@/features/clients/queries';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import type { BillsColumnKey } from './bills-columns';
import { STATUS_VARIANTS, SUBSCRIPTION_VARIANTS } from './bills-status';

/**
 * One cell of a Bills row, by column.
 *
 * The columns can be dragged into any order, so a row cannot be a fixed run of
 * cells — it is the reader's order mapped through this. Keeping each column's
 * formatting here means a column carries its own rules wherever it lands: the
 * phone number stays LTR when it is first, Remaining keeps its emphasis when it
 * is last.
 */
export function BillsCell({
  column,
  client,
  money,
  status,
  subscription,
  today,
  locale,
  t,
}: {
  column: BillsColumnKey;
  client: ClientListItem;
  money: SubscriberTotals;
  status: PaymentStatus;
  /** Where this subscriber's term stands today — see `subscriptionStanding`. */
  subscription: Subscription;
  /** The clinic's own today, which is what the countdown counts from. */
  today: string;
  locale: Locale;
  t: BillTranslator;
}) {
  switch (column) {
    case 'name':
      /*
      The one column that is **not** centred, and the exception is the
      point of it: a centred name is centred *as a pair with its disc*, so
      two rows whose names run to different lengths start their discs at
      different places and their names at different places. A column of
      names is read by running down its edge — centring takes that edge
      away and leaves every row landing somewhere slightly different.

      The figures are centred because a figure is a block the eye compares
      with the block above it. A name is a run of words the eye tracks down
      the front of. `text-start` puts that front on the right in Arabic
      and the left in English, which is the side each script starts from,
      so the discs line up in one column in both.
      */
      return (
        <TableCell>
          <div className="flex items-center gap-3">
            {/*
              The subscriber's calendar colour — the same disc their record
              header, the booking picker and every appointment block draw them
              in. `.patient-tone` builds the ramp from the one hue
              `patientToneStyle` sets; `contents` keeps the wrapper out of the
              flex row's layout.
            */}
            <span className="patient-tone contents" style={patientToneStyle(client.seq)}>
              <Avatar name={client.fullName} color="var(--tone-mark)" />
            </span>

            {/*
              `after:absolute after:inset-0` stretches this link over the whole
              row — see `linked` on `TableRow`. It works from wherever the name
              column has been dragged to, because the overlay is positioned
              against the row and not against this cell. The focus ring stays on
              the words rather than the stretched `::after`, so a keyboard
              reader can see which name they are on.

              It points at the subscriber's record and not at their ledger,
              which is not somewhere you go: the chevron at the end of the row
              opens it in place, so the name is free to lead where a name should
              — to the person.
            */}
            <Link
              href={`/app/clients/${client.id}?tab=expenses&from=bills`}
              className={cn(
                /* `truncate` because the column no longer grows to fit: the
                   table is fixed to even shares, so a long name has to end in
                   an ellipsis rather than push the figures beside it out of
                   line. The whole name is still on the record the link opens. */
                'min-w-0 truncate rounded-sm font-medium underline-offset-4 after:absolute after:inset-0 after:content-[""]',
                'focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2',
              )}
            >
              {client.fullName}
            </Link>
          </div>
        </TableCell>
      );

    /*
      Subscription — how long this person has left on their term, or how long
      they have been off it.

      **A countdown, not a date.** This column is scanned for one thing: who
      needs asking about a renewal, and how soon. "20 days" is that answer;
      `09/09/2026` is the raw material a reader would have to do the arithmetic
      on, once per row, against a today they also have to remember. The exact
      days a term covers are still on the printed statement, where a document
      has to be precise rather than quick to read.

      **Short, because it is a chip in a column of figures.** A number and the
      word "days" — not a sentence: this is read at a glance down a page, and a
      phrase that has to be *read* costs more than the day it saves looking up.
      "Left" and "remaining" are gone from the chip because the heading over it
      already says so, and the state word with them: the chip's own colour is
      what tells a running term from a finished one, and "Expired" in front of
      "Ended 3 days" would be one fact twice.

      No `numeric`: this is a sentence with a number in it, so it follows the
      page's direction like the name does. Someone who has never been on a
      subscription draws the register's em-dash — a chip saying "none" on every
      consultation-only row would be a column of noise.
    */
    case 'subscription': {
      if (subscription.state === 'none') {
        return (
          <TableCell className="text-center">
            <Missing />
          </TableCell>
        );
      }

      const countdown = subscriptionCountdown(subscription, today);

      return (
        <TableCell className="text-center">
          <Badge variant={SUBSCRIPTION_VARIANTS[subscription.state]} className="whitespace-nowrap">
            {t(`subscription.${countdown.kind}`, { days: countdown.days })}
          </Badge>
        </TableCell>
      );
    }

    /* Total price — everything this subscriber has been billed. */
    case 'totalPrice':
      return (
        <TableCell numeric className="text-center">
          {formatAmountCompact(locale, money.chargedMinor)}
        </TableCell>
      );

    /*
      Remaining — what there is left to collect, never negative, and the only
      money column that says what is owed now that Balance is gone.

      Red while anything is outstanding, plain once there is nothing to collect.
      Asked for directly, and worth recording that the design system argues the
      other way: most rows in a working register owe something, so this colours
      most of a column, and `destructive` normally means *wrong* rather than
      *unpaid* — an unpaid bill is an ordinary state of a clinic that is
      trading. The tokens are the semantic ones either way, so both stay legible
      in dark mode and neither is a raw colour.

      Zero is `text-foreground` and not green, which is the rule this and Total
      payment share: a colour marks something worth acting on, and there is
      nothing to act on in a zero. It is also what keeps `text-foreground`
      meaning "black in light, white in dark" instead of a literal black nobody
      could read on a dark screen.

      A subscriber in credit shows nothing to collect and so reads plain — that
      they are in credit is said by the status chip, and the figure is on the
      printed statement.
    */
    case 'remaining':
      return (
        <TableCell
         
          numeric
          /* No weight of its own — the colour is what marks this column, and a
             figure that is both red and bold shouts twice for one fact. */
          className={cn('text-center', money.remainingMinor > 0 ? 'text-destructive' : 'text-foreground')}
        >
          {formatAmountCompact(locale, money.remainingMinor)}
        </TableCell>
      );

    /*
      Total payment — everything received, refunds netted off. Green wherever
      money has actually come in: unlike Remaining it does not grade with the
      figure, because any payment at all is the good news on this screen.

      A subscriber who has paid nothing reads a plain ₪0 rather than a green
      one, the same rule Remaining follows above — green here would congratulate
      an account nobody has paid a shekel on.

      A refund large enough to outrun the payments leaves this negative, and
      that reads plain too: it is money that went back out, which is not what
      the green is for.
    */
    case 'totalPayment':
      return (
        <TableCell
         
          numeric
          className={cn('text-center', money.paidMinor > 0 ? 'text-status-on-track-fg' : 'text-foreground')}
        >
          {formatAmountCompact(locale, money.paidMinor)}
        </TableCell>
      );

    /*
      Payment status — the row's summary, and the one column that says something
      the figures beside it cannot: `partial` separates a subscriber who is
      paying from one who has not started, and both show the same positive
      balance.

      No `numeric`: this is a word, not a figure, so it follows the page's
      direction like the name does.
    */
    case 'status':
      return (
        <TableCell className="text-center">
          <Badge variant={STATUS_VARIANTS[status]}>{t(`status.${status}`)}</Badge>
        </TableCell>
      );
  }
}

/** An em-dash for a value the record does not have. Matches the register's. */
function Missing() {
  return (
    <span aria-hidden className="text-muted-foreground/60">
      —
    </span>
  );
}
