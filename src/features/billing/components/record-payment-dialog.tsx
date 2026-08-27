'use client';

import { useTranslations } from 'next-intl';

import { recordPaymentAction } from '@/features/billing/actions';
import { BillingKeypadDialog } from '@/features/billing/components/billing-keypad-dialog';
import { formatAmountCompact } from '@/features/billing/money';
import { PAYMENT_METHODS } from '@/features/billing/payment-methods';
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
 * What belongs to payments specifically is this file: the field they post
 * under, the ceiling on the figure, and the words.
 *
 * The ways money is taken, and the tint each is drawn in, are in
 * `payment-methods.ts`, where the record’s ledger reads them too — a payment
 * recorded from the amber card option should not arrive on the Expenses tab
 * as a green row.
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
      options={PAYMENT_METHODS.map((method) => ({ ...method, label: t(`methods.${method.value}`) }))}
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
