import type { ComponentProps } from 'react';

import type { Badge } from '@/components/ui/badge';
import type { PaymentStatus } from '@/features/billing/money';
import type { SubscriptionState } from '@/features/billing/subscription';

/**
 * The chip each payment status wears.
 *
 * Deliberately **not** a traffic light — `badge.tsx` says so at the top, and
 * this is exactly the column that would become one. Only `paid` gets the green:
 * `unpaid` is amber because it is genuinely waiting on someone, `partial` takes
 * the dashed `incomplete` edge because part of it is missing rather than wrong,
 * `credit` is a plain secondary chip because it is unusual but not a problem,
 * and `none` recedes into muted because nothing has happened yet.
 *
 * Red appears nowhere. An unpaid bill is an ordinary state of a working clinic,
 * not a failure, and `destructive` on most of a register would say otherwise.
 *
 * `satisfies` ties this to the union, so adding a status without giving it a
 * chip is a compile error rather than an unstyled badge.
 */
export const STATUS_VARIANTS = {
  none: 'muted',
  unpaid: 'attention',
  partial: 'incomplete',
  paid: 'onTrack',
  credit: 'default',
} as const satisfies Record<PaymentStatus, ComponentProps<typeof Badge>['variant']>;

/**
 * The chip a subscription state wears.
 *
 * Two states and no third colour: `active` takes the green this file gives
 * `paid`, because a term that is running is the same kind of news as a bill
 * that is settled, and `expired` takes amber for the reason `unpaid` does —
 * it is waiting on somebody, not wrong. A subscriber who has never had a
 * subscription gets no chip at all; the cell draws the register's em-dash
 * instead, because `none` here is an absence rather than a state worth a
 * badge on every row of a clinic that sells consultations.
 *
 * Red stays out of this column too. A lapsed subscription is a renewal to ask
 * for, not a failure.
 */
export const SUBSCRIPTION_VARIANTS = {
  active: 'onTrack',
  expired: 'attention',
} as const satisfies Record<
  Exclude<SubscriptionState, 'none'>,
  ComponentProps<typeof Badge>['variant']
>;
