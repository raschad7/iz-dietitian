import { addDays, addMonths, toUtcInstant, type IsoDate } from '@/features/booking/date';

import type { BillEntry } from './bill';

/**
 * How long each subscription runs, in months.
 *
 * The clinic's services are three — see `BILLING_SERVICES` — and two of them
 * are subscriptions: a month and three months. The consultation is a visit, not
 * a term, so it is absent here rather than given a length of zero; that is what
 * makes {@link isSubscriptionService} a real question and not a formality.
 *
 * **A term is derived, never stored.** A charge already records what was sold
 * and the day it was sold; when it runs out is arithmetic on those two, and a
 * stored `ends_on` would be a second copy that a back-dated correction could
 * leave disagreeing with the row it came from. This is the same argument the
 * schema makes for not storing totals and `bill.ts` makes for not storing
 * bills. It also means changing a term here fixes every row at once.
 */
export const SUBSCRIPTION_TERMS = { monthly: 1, quarterly: 3 } as const;

/** A service that runs for a term — `monthly` or `quarterly`. */
export type SubscriptionService = keyof typeof SUBSCRIPTION_TERMS;

/** Whether a subscriber is inside a term, past one, or has never had one. */
export type SubscriptionState = 'none' | 'active' | 'expired';

/**
 * Where a subscriber stands, as the Bills column reads it.
 *
 * `none` carries no dates because there is nothing to date: a subscriber who
 * has only ever been charged for a consultation has not been on a subscription,
 * which is a different statement from one whose subscription has run out.
 */
export type Subscription =
  | { state: 'none' }
  | {
      state: 'active' | 'expired';
      service: SubscriptionService;
      /** The day the term was charged for — `YYYY-MM-DD`. */
      startedOn: string;
      /** The last day it covers, inclusive — `YYYY-MM-DD`. */
      endsOn: string;
    };

/**
 * One term a subscriber has been sold, with the days it covers.
 *
 * Deliberately lighter than {@link Subscription}: that one answers "where does
 * this person stand today" and carries a state; this is a fact about a charge,
 * and the rule that stops a second subscription being sold over a running one
 * needs the fact rather than the verdict.
 */
export type SubscriptionTerm = {
  service: SubscriptionService;
  /** The day the term was charged for — `YYYY-MM-DD`. */
  startedOn: string;
  /** The last day it covers, inclusive — `YYYY-MM-DD`. */
  endsOn: string;
};

/**
 * A charge, as this module needs to read one.
 *
 * `BillEntry` satisfies it, and so does a two-column row read straight from
 * `client_charges` — which is what lets the write path enforce the rule
 * without loading whole ledgers to do it.
 */
export type SubscriptionCharge = {
  service: string | null;
  /** `YYYY-MM-DD`, the day the service was given. */
  occurredOn: string;
};

/** Whether a charge's `service` names a subscription rather than a visit. */
export function isSubscriptionService(value: unknown): value is SubscriptionService {
  return typeof value === 'string' && value in SUBSCRIPTION_TERMS;
}

/**
 * The last day a term covers, counted inclusively.
 *
 * A month bought on the 10th runs to the 9th of the next month, not to the
 * 10th: the anniversary is the day the *next* month would start, and a term
 * that covered both ends would give thirteen months a year to anyone renewing
 * on time. `addMonths` handles the short ones — a month bought on 31 January
 * ends on 27 February, because 31 February resolves to the 28th and the day
 * before it is the 27th.
 */
export function subscriptionEnd(service: SubscriptionService, startedOn: string): string {
  return addDays(addMonths(startedOn, SUBSCRIPTION_TERMS[service]), -1);
}

/**
 * Where a subscriber stands on the day `today`, read from their own ledger.
 *
 * **No query of its own.** The Bills screen already loads every subscriber's
 * bills for the page it is drawing — `ledgerByClient` — so the newest
 * subscription charge is in hand, and asking the database a second question to
 * find a row that is already on the client would be a round trip for nothing.
 *
 * The newest charge wins, by the day the service was given and then by the day
 * the row was typed in: a term entered late is still the term that was sold,
 * and two terms sold on one day — a renewal recorded beside the month it
 * renews — are told apart by the order they were written down.
 *
 * A term bought ahead of its start reads `active` rather than a fourth state.
 * It is the same answer to the only question this column is asked — is this
 * person on a subscription — and the dates beside the chip say when it runs.
 */
/**
 * The term covering `date`, if the subscriber is inside one that day.
 *
 * **This is the rule that stops a subscription being sold twice over.** A
 * subscriber on a month cannot be charged another subscription until that month
 * has run: the clinic would be taking money for days it has already been paid
 * for, and the register would show two overlapping terms with no way to say
 * which one a renewal was renewing.
 *
 * Asked about the *charge's own day* rather than about today, so it holds for
 * an entry being back-dated into a covered week as well as one being made now —
 * and so the next term can be recorded the moment the current one ends, which
 * is the day after `endsOn`.
 *
 * Every term is checked, not only the newest: two entries in the wrong order
 * are still two terms, and a rule that only looked at the latest would let a
 * back-dated one slip underneath it.
 */
export function subscriptionCovering(
  charges: readonly SubscriptionCharge[],
  date: string,
): SubscriptionTerm | null {
  for (const charge of charges) {
    if (!isSubscriptionService(charge.service)) continue;

    const endsOn = subscriptionEnd(charge.service, charge.occurredOn);

    if (charge.occurredOn <= date && date <= endsOn) {
      return { service: charge.service, startedOn: charge.occurredOn, endsOn };
    }
  }

  return null;
}

export function subscriptionStanding(entries: readonly BillEntry[], today: string): Subscription {
  let latest: { service: SubscriptionService; startedOn: string; createdAt: Date } | null = null;

  for (const entry of entries) {
    if (entry.kind !== 'charge') continue;
    if (!isSubscriptionService(entry.service)) continue;

    if (
      !latest ||
      entry.occurredOn > latest.startedOn ||
      (entry.occurredOn === latest.startedOn && entry.createdAt > latest.createdAt)
    ) {
      latest = { service: entry.service, startedOn: entry.occurredOn, createdAt: entry.createdAt };
    }
  }

  if (!latest) return { state: 'none' };

  const endsOn = subscriptionEnd(latest.service, latest.startedOn);

  return {
    state: today <= endsOn ? 'active' : 'expired',
    service: latest.service,
    startedOn: latest.startedOn,
    endsOn,
  };
}

/**
 * How long a term has left, or how long ago it ran out.
 *
 * **Days, not dates.** "20 days" is the answer to the question a register is
 * being scanned for — who needs asking about a renewal, and how soon — and a
 * reader gets there from `09/09/2026` only by doing the arithmetic themselves,
 * once per row. The date is still on the printed statement and in
 * the ledger, where a document needs to say exactly which days were bought.
 *
 * Counted inclusively while the term runs, so its last day reads "1 day left"
 * rather than "0": that day is still covered, and a subscriber cannot be sold
 * the next term until tomorrow. Once it has gone the count is the ordinary one
 * — the day after the term ends is "1 day ago".
 */
export function subscriptionCountdown(
  subscription: Extract<Subscription, { state: 'active' | 'expired' }>,
  today: string,
): { kind: 'remaining' | 'finished'; days: number } {
  const days = daysBetween(today, subscription.endsOn);

  return days >= 0 ? { kind: 'remaining', days: days + 1 } : { kind: 'finished', days: -days };
}

/**
 * Whole days from `from` to `to`, negative when `to` is behind.
 *
 * Both are calendar days rather than instants, so this is a subtraction of two
 * UTC midnights and never a timezone question: a term does not end at an hour.
 */
function daysBetween(from: string, to: string): number {
  const start = toUtcInstant(from as IsoDate).getTime();
  const end = toUtcInstant(to as IsoDate).getTime();

  return Math.round((end - start) / 86_400_000);
}
