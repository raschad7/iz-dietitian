import type { IconName } from '@/components/ui/icon';

import type { PaymentMethod } from './schema';

/**
 * The ways a clinic takes money at the counter, and what each is drawn in.
 *
 * `client_payments.method` still accepts `transfer` and `other` — historic rows
 * carry them, and the ledger reads them back by name — but the picker offers
 * the two the clinic actually uses. Adding one back is a line here, not a
 * migration.
 *
 * The colours are the app's own status tints, not decoration: cash is the
 * settled green the whole app uses for "on track", and card takes amber, which
 * marks the thing with a step still outstanding — the machine has to settle.
 * Neither is a traffic light; see the note at the top of `badge.tsx`.
 *
 * **It lives here rather than in the dialog that offers it** so the ledger can
 * read the same list. A payment recorded from the amber card option used to
 * arrive on the record's Expenses tab as a green row, because the row knew only
 * that money had come in and not how — the same fact drawn two ways on two
 * screens a dietitian moves between. `BILLING_SERVICES` is split out for
 * exactly the same reason; see `serviceTone`.
 */
export const PAYMENT_METHODS: { value: PaymentMethod; icon: IconName; className: string }[] = [
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

/**
 * The tint a payment method is drawn in, or `null` for one the picker no longer
 * offers.
 *
 * `transfer` and `other` answer `null` on purpose. They are real rows that
 * exist in the ledger and cannot be re-recorded, but they have no option to
 * match on the card, so there is no colour to agree with — the caller keeps its
 * own fallback rather than this inventing a fifth meaning for a tint. The same
 * shape as `serviceTone`, and for the same reason.
 */
export function methodTone(method: string | null | undefined): string | null {
  return PAYMENT_METHODS.find((entry) => entry.value === method)?.className ?? null;
}
