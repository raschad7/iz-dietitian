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

export type AttentionReason = 'noUpcomingAppointment' | 'noWeeklyPlan' | 'neverSignedIn';

/**
 * One row of the feed.
 *
 * A discriminated union rather than a flattened `{ title, body }`: the two
 * sources carry genuinely different facts, and the renderer needs the raw
 * values to format a time in the reader's locale and to link to the right
 * place. Neither variant carries an href — routes are the route layer's
 * business, not the data layer's.
 */
export type StaffRequestNotification = {
  kind: 'request';
  id: string;
  clientId: string;
  clientName: string;
  requestKind: RequestKind;
  preferredDate: string | null;
  preferredStartMinute: number | null;
  note: string | null;
  createdAt: Date;
};

export type StaffAttentionNotification = {
  kind: 'attention';
  id: string;
  clientId: string;
  clientName: string;
  reason: AttentionReason;
};

export type StaffNotification = StaffRequestNotification | StaffAttentionNotification;

/**
 * The feed, as two lists rather than one.
 *
 * The two kinds are not the same job, however similar they looked stacked in a
 * popover. A request has a person waiting at the other end and is answered on
 * `/app/requests`; an attention flag is the system noticing that a client has
 * drifted, and it is answered — if at all — inside that client's record. Merged
 * into one array they were told apart only by the tint of a 32px disc, and the
 * reader had to re-decide what sort of row they were looking at on every line.
 *
 * Merging them also cost the ordering: requests were sorted by age and
 * attention rows by category, so one list ran on two different clocks.
 */
export type NotificationsData = {
  requests: StaffRequestNotification[];
  attention: StaffAttentionNotification[];
  /** Every pending request, not just the loaded ones — the count must not lie. */
  pendingRequestCount: number;
  /** The instant every relative timestamp in the feed is measured against. */
  now: Date;
};
