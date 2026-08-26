'use client';

import { useTranslations } from 'next-intl';

import type { IconName } from '@/components/ui/icon';
import { recordPaymentAction } from '@/features/billing/actions';
import { BillingKeypadDialog } from '@/features/billing/components/billing-keypad-dialog';
import { formatAmountCompact } from '@/features/billing/money';
import type { PaymentMethod } from '@/features/billing/schema';
import type { Locale } from '@/i18n/routing';

/**
 * "Record a payment" — the wallet on every Bills row.
 *
 * Money the clinic has already received, written down after the fact. Nothing
 * here contacts a bank and no card details are asked for or accepted; see the
 * header of `src/db/schema/billing.ts`. The wording follows: "Record a payment",
 * never "Pay".
 *
 * The card itself is `BillingKeypadDialog`, which the charge beside it uses too.
 * What belongs to payments specifically is this file: the ways money is taken,
 * the field they post under, and the words.
 *
 * ## Never more than the account owes
 *
 * The card carries what is still outstanding — under the keypad while a figure
 * is being typed, and in place of that line once the figure is past it — and
 * the button will not commit one that is. A subscriber billed ₪1,000 cannot be
 * recorded as paying ₪1,200, and one who has paid ₪400 of it cannot be recorded
 * as paying more than the ₪600 left.
 *
 * `recordPayment` refuses the same write, which is what covers a form posted
 * without this card and two people recording one payment at once. A refund — a
 * negative figure — is capped by neither: it moves the account away from
 * settled, never past it.
 */

/**
 * The two ways money is taken, and how each is dressed.
 *
 * `client_payments.method` still accepts `transfer` and `other` — historic rows
 * carry them, and the ledger reads them back by name — but the picker offers
 * the two the clinic actually uses at the counter. Adding one back is a line
 * here, not a migration.
 *
 * The colours are the app's own status tints, not decoration: cash is the
 * settled green the whole app uses for "on track", and card takes amber, which
 * marks the thing with a step still outstanding — the machine has to settle.
 * Neither is a traffic light; see the note at the top of `badge.tsx`.
 */
const METHODS: { value: PaymentMethod; icon: IconName; className: string }[] = [
  {
    value: 'cash',
    icon: 'paymentCash',
    className: 'bg-status-on-track-bg text-status-on-track-fg',
  },
  {
    value: 'card',
    icon: 'paymentCard',
    className: 'bg-status-attention-bg text-status-attention-fg',
  },
];

export function RecordPaymentDialog({
  locale,
  clientId,
  clientName,
  /** Today, in the clinic's zone, resolved on the server. See the Bills page. */
  today,
  /** `button` for a panel with room for words; `icon` for a register row. */
  trigger,
  /** `primary` fills the button; the rest of a row should not. */
  emphasis,
  /** What this subscriber still owes, in minor units — the ceiling on the card. */
  remainingMinor,
}: {
  locale: Locale;
  clientId: string;
  clientName: string;
  today: string;
  trigger?: 'icon' | 'button';
  emphasis?: 'primary' | 'secondary';
  remainingMinor: number;
}) {
  const t = useTranslations('billing');

  return (
    <BillingKeypadDialog
      locale={locale}
      clientId={clientId}
      today={today}
      trigger={trigger}
      emphasis={emphasis}
      icon="recordPayment"
      action={recordPaymentAction}
      options={METHODS.map((method) => ({ ...method, label: t(`methods.${method.value}`) }))}
      optionName="method"
      dateName="paidOn"
      maxMinor={remainingMinor}
      labels={{
        title: t('recordPayment.title'),
        open: t('recordPayment.open'),
        openFor: t('recordPayment.openFor', { name: clientName }),
        close: t('recordPayment.close'),
        amount: t('recordPayment.amount'),
        amountHint: t('recordPayment.amountHint'),
        /* The figure, formatted here rather than in the shared card: the card
           takes words, and what is owed is this screen's own fact. */
        owed: t('recordPayment.owed', { amount: formatAmountCompact(locale, remainingMinor) }),
        overMax: t('recordPayment.overOwed', {
          amount: formatAmountCompact(locale, remainingMinor),
        }),
        option: t('recordPayment.method'),
        answer: t('recordPayment.addedBalance'),
        date: t('recordPayment.paidOn'),
        datePlaceholder: t('recordPayment.datePlaceholder'),
        openDatePicker: t('recordPayment.openDatePicker'),
        submit: t('recordPayment.submit'),
        saving: t('recordPayment.saving'),
        saved: t('recordPayment.saved'),
      }}
    />
  );
}
