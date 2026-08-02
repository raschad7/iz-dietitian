import { type RequestKind } from '@/features/portal/types';

/**
 * Plain data shapes for the staff notifications feed.
 *
 * This module imports nothing but other type-only modules. That matters:
 * `verbatimModuleSyntax` is on, so `import { type X } from './queries'` in a
 * client component still emits a real `import {} from './queries'`, which would
 * drag `@/db` and the Postgres driver into the browser bundle. Same reasoning
 * as `src/features/booking/types.ts`.
 */

export type AttentionReason = 'noUpcomingAppointment' | 'noMealPlan' | 'neverSignedIn';

/**
 * One row of the feed.
 *
 * A discriminated union rather than a flattened `{ title, body }`: the two
 * sources carry genuinely different facts, and the renderer needs the raw
 * values to format a time in the reader's locale and to link to the right
 * place. Neither variant carries an href — routes are the route layer's
 * business, not the data layer's.
 */
export type StaffNotification =
  | {
      kind: 'request';
      id: string;
      clientId: string;
      clientName: string;
      requestKind: RequestKind;
      preferredDate: string | null;
      preferredStartMinute: number | null;
      note: string | null;
      createdAt: Date;
    }
  | {
      kind: 'attention';
      id: string;
      clientId: string;
      clientName: string;
      reason: AttentionReason;
    };

export type NotificationsData = {
  items: StaffNotification[];
  /** Every pending request, not just the previewed ones — the badge must not lie. */
  pendingRequestCount: number;
  /** The instant every relative timestamp in the feed is measured against. */
  now: Date;
};
