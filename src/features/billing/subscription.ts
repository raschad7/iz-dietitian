import { addDays, addMonths, toUtcInstant, type IsoDate } from '@/features/booking/date';

import type { BillEntry } from './bill';
import { serviceByKey, type ClinicServiceView } from './services';

/**
 * Where a subscriber stands: which term they are inside, when it runs out, and
 * which days did not count.
 *
 * **A term is derived, never stored.** A charge already records what was sold
 * and the day it was sold; a freeze records days the clinic agreed not to count;
 * when the term runs out is arithmetic over those two, and a stored `ends_on`
 * would be a second copy that a back-dated correction could leave disagreeing
 * with the rows it came from. This is the same argument the schema makes for
 * storing no totals and `bill.ts` makes for storing no bills.
 *
 * **How long a term runs is the clinic's answer, not this file's.** It was
 * `SUBSCRIPTION_TERMS = { monthly: 1, quarterly: 3 }` — a constant, which is why
 * a clinic selling two months had to wait for a deploy. Every function here now
 * takes the clinic's own `clinic_services` rows and reads the term off the
 * service the charge names.
 */

/** One freeze, as every function here needs to read one. */
export type FreezeRange = {
  /** First day not counted, inclusive — `YYYY-MM-DD`. */
  startsOn: string;
  /** Last day not counted, inclusive. Null while the freeze is still open. */
  endsOn: string | null;
};

/** Whether a subscriber is inside a term, paused inside one, past one, or has never had one. */
export type SubscriptionState = 'none' | 'active' | 'frozen' | 'expired';

/**
 * Where a subscriber stands, as the Bills column reads it.
 *
 * `none` carries no dates because there is nothing to date: a subscriber who has
 * only ever been charged for a consultation has not been on a subscription,
 * which is a different statement from one whose subscription has run out.
 *
 * `frozen` is a state of an otherwise active term rather than a fourth thing a
 * subscriber can be. `endsOn` on a frozen term is where it will end *if the
 * freeze ends today* — it moves out by a day for every further day paused, which
 * is what a pause means, and the column says "مجمّد" rather than counting down
 * to a date that is still moving.
 */
export type Subscription =
  | { state: 'none' }
  | {
      state: 'active' | 'frozen' | 'expired';
      /** The service sold, resolved against the clinic's own list. */
      service: ClinicServiceView;
      /** The day the term was charged for — `YYYY-MM-DD`. */
      startedOn: string;
      /** The last day it covers, inclusive — `YYYY-MM-DD`. */
      endsOn: string;
      /** Days added to the term so far by freezes. Zero on a term never paused. */
      frozenDays: number;
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
  service: ClinicServiceView;
  /** The day the term was charged for — `YYYY-MM-DD`. */
  startedOn: string;
  /** The last day it covers, inclusive — `YYYY-MM-DD`. */
  endsOn: string;
};

/**
 * A charge, as this module needs to read one.
 *
 * `BillEntry` satisfies it, and so does a two-column row read straight from
 * `client_charges` — which is what lets the write path enforce the rule without
 * loading whole ledgers to do it.
 */
export type SubscriptionCharge = {
  service: string | null;
  /** `YYYY-MM-DD`, the day the service was given. */
  occurredOn: string;
};

/**
 * The service a charge names, when it is one that runs for a term.
 *
 * Returns `undefined` for a visit, for a charge that names no service, and for a
 * key the clinic's list no longer holds. The last of those is why services are
 * retired rather than deleted, and why `deleteService` refuses once a charge
 * names one: a term nobody can look up is a term nobody can date.
 */
export function subscriptionService(
  services: readonly ClinicServiceView[],
  key: string | null | undefined,
): ClinicServiceView | undefined {
  const service = serviceByKey(services, key);

  return service?.kind === 'subscription' && service.durationMonths !== null ? service : undefined;
}

/**
 * The last day a term covers, counted inclusively, with paused days added on.
 *
 * A month bought on the 10th runs to the 9th of the next month, not to the 10th:
 * the anniversary is the day the *next* month would start, and a term that
 * covered both ends would give thirteen months a year to anyone renewing on
 * time. `addMonths` handles the short ones — a month bought on 31 January ends
 * on 27 February, because 31 February resolves to the 28th and the day before it
 * is the 27th.
 *
 * ## Freezes push the end out, and the arithmetic has to settle
 *
 * A paused day is a day the subscriber did not get, so the term gains one. That
 * is circular in the obvious way: adding days can pull a later freeze inside the
 * term, which adds more days, which can pull in another. So it is iterated to a
 * fixed point rather than computed in one pass — and the loop is bounded by the
 * number of freezes, because each turn can only bring in one more of them.
 *
 * `asOf` is what an **open** freeze runs to. A subscriber still paused today has
 * a term that ends one day later tomorrow, which is exactly what a pause means
 * and the reason this takes a date at all.
 */
export function subscriptionEnd(
  months: number,
  startedOn: string,
  freezes: readonly FreezeRange[] = [],
  asOf: string = startedOn,
): string {
  const base = addDays(addMonths(startedOn, months), -1);

  let end = base;

  for (let turn = 0; turn <= freezes.length; turn += 1) {
    const next = addDays(base, frozenDaysWithin(freezes, startedOn, end, asOf));

    if (next === end) break;

    end = next;
  }

  return end;
}

/**
 * How many days between `from` and `to` — inclusive of both — any freeze covers.
 *
 * Overlapping freezes are counted once. They should not overlap in the first
 * place (`recordFreeze` refuses one that does), but a day cannot be given back
 * twice and the arithmetic should not depend on a rule enforced somewhere else.
 */
export function frozenDaysWithin(
  freezes: readonly FreezeRange[],
  from: string,
  to: string,
  asOf: string,
): number {
  const spans = freezes
    .map((freeze) => ({
      /* An open freeze runs to today: it has not ended, so it has not stopped counting. */
      start: freeze.startsOn < from ? from : freeze.startsOn,
      end: min(freeze.endsOn ?? asOf, to),
    }))
    .filter((span) => span.start <= span.end)
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

  let days = 0;
  /** The last day already counted, so an overlap is not counted twice. */
  let counted: string | null = null;

  for (const span of spans) {
    const start = counted !== null && span.start <= counted ? addDays(counted, 1) : span.start;

    if (start > span.end) continue;

    days += daysBetween(start, span.end) + 1;
    counted = span.end;
  }

  return days;
}

/**
 * The term covering `date`, if the subscriber is inside one that day.
 *
 * **This is the rule that stops a subscription being sold twice over.** A
 * subscriber on a month cannot be charged another subscription until that month
 * has run: the clinic would be taking money for days it has already been paid
 * for, and the register would show two overlapping terms with no way to say
 * which one a renewal was renewing.
 *
 * Asked about the *charge's own day* rather than about today, so it holds for an
 * entry being back-dated into a covered week as well as one being made now — and
 * so the next term can be recorded the moment the current one ends, which is the
 * day after `endsOn`.
 *
 * Every term is checked, not only the newest: two entries in the wrong order are
 * still two terms, and a rule that only looked at the latest would let a
 * back-dated one slip underneath it.
 */
export function subscriptionCovering(
  charges: readonly SubscriptionCharge[],
  services: readonly ClinicServiceView[],
  date: string,
  freezes: readonly FreezeRange[] = [],
  asOf: string = date,
): SubscriptionTerm | null {
  for (const charge of charges) {
    const service = subscriptionService(services, charge.service);

    if (!service) continue;

    const endsOn = subscriptionEnd(service.durationMonths!, charge.occurredOn, freezes, asOf);

    if (charge.occurredOn <= date && date <= endsOn) {
      return { service, startedOn: charge.occurredOn, endsOn };
    }
  }

  return null;
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
 * the row was typed in: a term entered late is still the term that was sold, and
 * two terms sold on one day — a renewal recorded beside the month it renews —
 * are told apart by the order they were written down.
 *
 * A term bought ahead of its start reads `active` rather than a fourth state. It
 * is the same answer to the only question this column is asked — is this person
 * on a subscription — and the dates beside the chip say when it runs.
 */
export function subscriptionStanding(
  entries: readonly BillEntry[],
  services: readonly ClinicServiceView[],
  today: string,
  freezes: readonly FreezeRange[] = [],
): Subscription {
  let latest: { service: ClinicServiceView; startedOn: string; createdAt: Date } | null = null;

  for (const entry of entries) {
    if (entry.kind !== 'charge') continue;

    const service = subscriptionService(services, entry.service);

    if (!service) continue;

    if (
      !latest ||
      entry.occurredOn > latest.startedOn ||
      (entry.occurredOn === latest.startedOn && entry.createdAt > latest.createdAt)
    ) {
      latest = { service, startedOn: entry.occurredOn, createdAt: entry.createdAt };
    }
  }

  if (!latest) return { state: 'none' };

  const months = latest.service.durationMonths!;
  const endsOn = subscriptionEnd(months, latest.startedOn, freezes, today);
  const frozenDays = frozenDaysWithin(freezes, latest.startedOn, endsOn, today);

  return {
    state: today > endsOn ? 'expired' : isFrozenOn(freezes, today) ? 'frozen' : 'active',
    service: latest.service,
    startedOn: latest.startedOn,
    endsOn,
    frozenDays,
  };
}

/** Whether a freeze covers `date` — an open one covers every day from its start. */
export function isFrozenOn(freezes: readonly FreezeRange[], date: string): boolean {
  return freezes.some(
    (freeze) => freeze.startsOn <= date && (freeze.endsOn === null || date <= freeze.endsOn),
  );
}

/** The freeze covering `date`, when there is one — the row the Resume button acts on. */
export function activeFreeze<T extends FreezeRange>(
  freezes: readonly T[],
  date: string,
): T | undefined {
  return freezes.find(
    (freeze) => freeze.startsOn <= date && (freeze.endsOn === null || date <= freeze.endsOn),
  );
}

/**
 * How long a term has left, or how long ago it ran out.
 *
 * **Days, not dates.** "20 days" is the answer to the question a register is
 * being scanned for — who needs asking about a renewal, and how soon — and a
 * reader gets there from `09/09/2026` only by doing the arithmetic themselves,
 * once per row. The date is still on the printed statement and in the ledger,
 * where a document needs to say exactly which days were bought.
 *
 * Counted inclusively while the term runs, so its last day reads "1 day left"
 * rather than "0": that day is still covered, and a subscriber cannot be sold
 * the next term until tomorrow. Once it has gone the count is the ordinary one —
 * the day after the term ends is "1 day ago".
 */
export function subscriptionCountdown(
  subscription: Extract<Subscription, { state: 'active' | 'frozen' | 'expired' }>,
  today: string,
): { kind: 'remaining' | 'finished'; days: number } {
  const days = daysBetween(today, subscription.endsOn);

  return days >= 0 ? { kind: 'remaining', days: days + 1 } : { kind: 'finished', days: -days };
}

/** The earlier of two calendar days. */
function min(a: string, b: string): string {
  return a < b ? a : b;
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
