import type { ComponentProps } from 'react';

import type { Badge } from '@/components/ui/badge';
import type { PaymentStatus } from '@/features/billing/money';

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
