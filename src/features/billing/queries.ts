import { and, asc, eq, inArray, sum } from 'drizzle-orm';

import { db } from '@/db';
import {
  clientCharges,
  clientPayments,
  clientSubscriptionFreezes,
  clients,
  clinicServices as clinicServicesTable,
} from '@/db/schema';

import { compareEntries, type BillEntry } from './bill';
import { paymentStatus, subscriberTotals, type PaymentStatus, type SubscriberTotals } from './money';
import {
  subscriptionStanding,
  type FreezeRange,
  type SubscriptionState,
} from './subscription';
import { isServiceKind, type ClinicServiceView } from './services';

/**
 * Reads for the bills screen.
 *
 * Like `src/features/clients/queries.ts`, this imports nothing from Next.js, so
 * the functions can be called from a test or a script as easily as from a page.
 *
 * `clinicId` is a required first argument on everything, so forgetting the
 * tenant scope is a type error rather than a silent cross-clinic leak. Both
 * queries below filter on it **as well as** on the client ids they were handed:
 * the ids already came from a clinic-scoped read, but a ledger query that
 * trusts its argument is one refactor away from being the hole.
 */

/**
 * What each of these subscribers has been billed and has paid.
 *
 * Returned as a `Map` keyed by client id rather than as rows, because the
 * caller has a page of clients in a fixed order and needs to look each one up —
 * and because a subscriber with no ledger at all has no row here, which a map
 * turns into an ordinary `undefined` instead of a join that drops them off the
 * screen. `emptyTotals` is what the table draws for them.
 *
 * ## Why two queries and not one
 *
 * Charges and payments are independent sets over the same clients. Summing both
 * in one statement means a full outer join between two aggregates — or a pair
 * of correlated subqueries — to keep a subscriber who has paid but not yet been
 * billed, or been billed and never paid. Two grouped reads and a merge in
 * JavaScript say the same thing in a form that is obvious on inspection, and
 * both are index-covered by `(clinic_id, client_id)`.
 *
 * ## Why `sum()` comes back as a string
 *
 * PostgreSQL widens `sum(integer)` to `bigint`, and postgres.js hands a
 * `bigint` back as a string so it cannot silently lose precision on the way
 * into a JavaScript number. `Number(...)` here is safe and deliberate: the
 * operands are agorot bounded by `MAX_AMOUNT_MINOR` per row, so a clinic would
 * need more than four million maximal charges against one subscriber before the
 * total left the safe-integer range.
 */
export async function subscriberTotalsByClient(
  clinicId: string,
  clientIds: readonly string[],
): Promise<Map<string, SubscriberTotals>> {
  const totals = new Map<string, SubscriberTotals>();

  /*
    `inArray` with an empty list compiles to `in ()`, which is a syntax error in
    PostgreSQL. An empty page — a search that matched nobody — is an ordinary
    state of this screen, not an edge case, so it returns before it can build
    one.
  */
  if (clientIds.length === 0) return totals;

  const ids = [...clientIds];

  const [charged, paid] = await Promise.all([
    db
      .select({ clientId: clientCharges.clientId, total: sum(clientCharges.amountMinor) })
      .from(clientCharges)
      .where(and(eq(clientCharges.clinicId, clinicId), inArray(clientCharges.clientId, ids)))
      .groupBy(clientCharges.clientId),
    db
      .select({ clientId: clientPayments.clientId, total: sum(clientPayments.amountMinor) })
      .from(clientPayments)
      .where(and(eq(clientPayments.clinicId, clinicId), inArray(clientPayments.clientId, ids)))
      .groupBy(clientPayments.clientId),
  ]);

  const chargedByClient = new Map(charged.map((row) => [row.clientId, Number(row.total ?? 0)]));
  const paidByClient = new Map(paid.map((row) => [row.clientId, Number(row.total ?? 0)]));

  /*
    Keyed off the ids that were asked for, not off the rows that came back, so
    every subscriber on the page gets an entry and the table never has to guess
    whether a missing key means "nothing billed" or "query did not cover them".
  */
  for (const id of ids) {
    totals.set(id, subscriberTotals(chargedByClient.get(id) ?? 0, paidByClient.get(id) ?? 0));
  }

  return totals;
}

/** A subscriber with no ledger at all — every figure zero, nothing outstanding. */
export const emptyTotals: SubscriberTotals = subscriberTotals(0, 0);

/**
 * Every printable operation on one page of subscribers, keyed by client id.
 *
 * The bills table draws a menu of a subscriber's own bills under each row, so
 * it needs the rows themselves and not only the sums — and it needs them for
 * the whole page at once. Two grouped reads and a merge, exactly like
 * {@link subscriberTotalsByClient} above and for the same reasons: charges and
 * payments are independent sets, and a subscriber with only one kind must not
 * be dropped by a join.
 *
 * **Why the whole page rather than one row on demand.** The alternative is
 * fetching a subscriber's ledger when their menu opens, which is a request, a
 * spinner and an error state per row on a screen that is otherwise entirely
 * server-rendered. A page is at most one pager's worth of subscribers, the rows
 * are four small columns wide, and this is one round trip for all of them.
 */
export async function ledgerByClient(
  clinicId: string,
  clientIds: readonly string[],
): Promise<Map<string, BillEntry[]>> {
  const ledgers = new Map<string, BillEntry[]>();

  /* `in ()` is a syntax error — see the note in `subscriberTotalsByClient`. */
  if (clientIds.length === 0) return ledgers;

  const ids = [...clientIds];

  for (const id of ids) ledgers.set(id, []);

  const [charges, payments] = await Promise.all([
    db
      .select({
        id: clientCharges.id,
        clientId: clientCharges.clientId,
        occurredOn: clientCharges.chargedOn,
        amountMinor: clientCharges.amountMinor,
        description: clientCharges.description,
        service: clientCharges.service,
        note: clientCharges.note,
        createdAt: clientCharges.createdAt,
      })
      .from(clientCharges)
      .where(and(eq(clientCharges.clinicId, clinicId), inArray(clientCharges.clientId, ids))),
    db
      .select({
        id: clientPayments.id,
        clientId: clientPayments.clientId,
        occurredOn: clientPayments.paidOn,
        amountMinor: clientPayments.amountMinor,
        method: clientPayments.method,
        note: clientPayments.note,
        createdAt: clientPayments.createdAt,
      })
      .from(clientPayments)
      .where(and(eq(clientPayments.clinicId, clinicId), inArray(clientPayments.clientId, ids))),
  ]);

  for (const row of charges) {
    ledgers.get(row.clientId)?.push({
      id: row.id,
      kind: 'charge',
      occurredOn: row.occurredOn,
      amountMinor: row.amountMinor,
      description: row.description,
      method: null,
      service: row.service,
      note: row.note,
      createdAt: row.createdAt,
    });
  }

  for (const row of payments) {
    ledgers.get(row.clientId)?.push({
      id: row.id,
      kind: 'payment',
      occurredOn: row.occurredOn,
      amountMinor: row.amountMinor,
      description: null,
      method: row.method,
      service: null,
      note: row.note,
      createdAt: row.createdAt,
    });
  }

  /*
    Sorted here rather than in the two `ORDER BY`s, because the order that
    matters is over the merged list and neither query can see the other's rows.
  */
  for (const entries of ledgers.values()) entries.sort(compareEntries);

  return ledgers;
}

/**
 * One subscriber's ledger, with enough of them to head a bill.
 *
 * What the PDF routes read. Returns `null` when the subscriber is not this
 * clinic's — the same boundary `assertClientInClinic` enforces on the write
 * side, expressed as an absence so the route can answer 404 rather than leak
 * the existence of another clinic's record through a 403.
 */
export async function clientBillingRecord(
  clinicId: string,
  clientId: string,
): Promise<{ client: { id: string; fullName: string; phone: string | null }; entries: BillEntry[] } | null> {
  const [client] = await db
    .select({ id: clients.id, fullName: clients.fullName, phone: clients.phone })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.clinicId, clinicId)))
    .limit(1);

  if (!client) return null;

  const ledgers = await ledgerByClient(clinicId, [clientId]);

  return { client, entries: ledgers.get(clientId) ?? [] };
}

/**
 * A clinic's own list of services, in the order it put them in.
 *
 * Every service, retired ones included. A retired service is still what old
 * charges say they were, so the ledger row and the printed bill need it to
 * resolve — `sellableServices` is what drops it from the card a new charge is
 * recorded on. Filtering here would make a retired service's charges
 * unreadable, which is the one thing retiring must not do.
 *
 * A clinic with no rows at all gets an empty list rather than the defaults.
 * `DEFAULT_SERVICES` is seeded when the clinic is created and by the migration
 * that made this a table; substituting them on read would mean a clinic that
 * deliberately retired everything sees its services reappear.
 */
export async function clinicServices(clinicId: string): Promise<ClinicServiceView[]> {
  const rows = await db
    .select({
      id: clinicServicesTable.id,
      key: clinicServicesTable.key,
      nameAr: clinicServicesTable.nameAr,
      nameEn: clinicServicesTable.nameEn,
      kind: clinicServicesTable.kind,
      durationMonths: clinicServicesTable.durationMonths,
      priceMinor: clinicServicesTable.priceMinor,
      firstFree: clinicServicesTable.firstFree,
      active: clinicServicesTable.active,
      sortOrder: clinicServicesTable.sortOrder,
    })
    .from(clinicServicesTable)
    .where(eq(clinicServicesTable.clinicId, clinicId))
    .orderBy(asc(clinicServicesTable.sortOrder), asc(clinicServicesTable.key));

  /*
    `kind` is `text` in the database — the same reasoning as every other open
    vocabulary in the schema — so a row is dropped rather than cast if it holds
    something this code cannot reason about. That is unreachable through the
    settings screen and would otherwise be a service with no term rules at all.
  */
  return rows.filter((row): row is ClinicServiceView => isServiceKind(row.kind));
}

/**
 * Which of these subscribers have already been charged for a first-free service.
 *
 * A clinic may mark any service "first one free" — the consultation is the one
 * that always was — so the card has to know, per subscriber and per service,
 * whether one is already on the ledger. A count is not needed and is not taken:
 * the question is "has there been one", and the answer is a set.
 *
 * Read from `client_charges.service` rather than from the description. A row
 * says "Consultation" or "استشارة" depending on the language it was entered in,
 * and a rule that matched on those words would give a subscriber a second free
 * visit by switching the interface to the other one.
 *
 * **Rows recorded before that column existed carry `null` and count as
 * nothing.** A clinic upgrading mid-life gives one more free consultation to
 * subscribers whose earlier ones cannot be identified — which errs towards the
 * subscriber, and is the only direction an unknowable past can be resolved in
 * without inventing history.
 */
export async function firstFreeUsed(
  clinicId: string,
  clientIds: readonly string[],
  services: readonly ClinicServiceView[],
): Promise<Map<string, Set<string>>> {
  const keys = services.filter((service) => service.firstFree).map((service) => service.key);

  if (clientIds.length === 0 || keys.length === 0) return new Map();

  const rows = await db
    .selectDistinct({ clientId: clientCharges.clientId, service: clientCharges.service })
    .from(clientCharges)
    .where(
      and(
        eq(clientCharges.clinicId, clinicId),
        inArray(clientCharges.clientId, [...clientIds]),
        inArray(clientCharges.service, keys),
      ),
    );

  const used = new Map<string, Set<string>>();

  for (const row of rows) {
    if (!row.service) continue;

    const held = used.get(row.clientId) ?? new Set<string>();
    held.add(row.service);
    used.set(row.clientId, held);
  }

  return used;
}

/**
 * Every freeze these subscribers have had, newest first.
 *
 * Read for the page rather than per row, like the ledger beside it: the Bills
 * screen needs a freeze list for each subscriber it draws — the term arithmetic
 * consumes it, and the row's own menu acts on the open one — and a query per
 * subscriber would be a round trip to find rows most of them do not have.
 *
 * A subscriber who has never been frozen is absent from the map, which the
 * caller reads as the empty list. That is the ordinary case and it costs
 * nothing.
 */
export async function freezesByClient(
  clinicId: string,
  clientIds: readonly string[],
): Promise<Map<string, ClientFreeze[]>> {
  const freezes = new Map<string, ClientFreeze[]>();

  if (clientIds.length === 0) return freezes;

  const rows = await db
    .select({
      id: clientSubscriptionFreezes.id,
      clientId: clientSubscriptionFreezes.clientId,
      startsOn: clientSubscriptionFreezes.startsOn,
      endsOn: clientSubscriptionFreezes.endsOn,
      reason: clientSubscriptionFreezes.reason,
    })
    .from(clientSubscriptionFreezes)
    .where(
      and(
        eq(clientSubscriptionFreezes.clinicId, clinicId),
        inArray(clientSubscriptionFreezes.clientId, [...clientIds]),
      ),
    )
    .orderBy(asc(clientSubscriptionFreezes.startsOn));

  for (const row of rows) {
    const held = freezes.get(row.clientId) ?? [];
    held.push(row);
    freezes.set(row.clientId, held);
  }

  return freezes;
}

/** One freeze, as a screen reads it: the range, why, and the id to resume by. */
export type ClientFreeze = FreezeRange & {
  id: string;
  clientId: string;
  reason: string | null;
};

/**
 * Every freeze in the clinic, grouped by subscriber.
 *
 * The filter's counterpart to {@link freezesByClient}, without an id list, for
 * the same reason `paymentStatusByClient` has no id list: a filter decides which
 * subscribers are on the page, so it cannot be computed from the page it is
 * choosing.
 *
 * The whole history rather than only the open ones, because a term's end depends
 * on every day that did not count — a subscriber who was paused for a fortnight
 * in March is on a different renewal date today, and a query that read only
 * running freezes would report them as expired a fortnight early.
 */
export async function clinicFreezesByClient(clinicId: string): Promise<Map<string, FreezeRange[]>> {
  const rows = await db
    .select({
      clientId: clientSubscriptionFreezes.clientId,
      startsOn: clientSubscriptionFreezes.startsOn,
      endsOn: clientSubscriptionFreezes.endsOn,
    })
    .from(clientSubscriptionFreezes)
    .where(eq(clientSubscriptionFreezes.clinicId, clinicId))
    .orderBy(asc(clientSubscriptionFreezes.startsOn));

  const freezes = new Map<string, FreezeRange[]>();

  for (const row of rows) {
    const held = freezes.get(row.clientId) ?? [];
    held.push({ startsOn: row.startsOn, endsOn: row.endsOn });
    freezes.set(row.clientId, held);
  }

  return freezes;
}

/**
 * Every subscriber in the clinic whose ledger says something, and what it says.
 *
 * The Bills filter's `paymentStatus` column, answered for the whole clinic in
 * one pair of reads — the same shape as {@link subscriberTotalsByClient} above,
 * without the id list. It has to be the whole clinic rather than the page:
 * a filter decides *which* subscribers are on the page, so it cannot be
 * computed from the page it is choosing.
 *
 * ⚠ **A subscriber with no ledger at all is absent from the map**, and that is
 * the point rather than an omission: `paymentStatus` calls that state `none`,
 * and "nothing has happened yet" is exactly "no rows". The caller filtering for
 * `none` selects the complement of these keys — see `billingCondition` in the
 * clients queries — which is one fewer read than materialising every client id
 * to say the same thing.
 */
export async function paymentStatusByClient(clinicId: string): Promise<Map<string, PaymentStatus>> {
  const [charged, paid] = await Promise.all([
    db
      .select({ clientId: clientCharges.clientId, total: sum(clientCharges.amountMinor) })
      .from(clientCharges)
      .where(eq(clientCharges.clinicId, clinicId))
      .groupBy(clientCharges.clientId),
    db
      .select({ clientId: clientPayments.clientId, total: sum(clientPayments.amountMinor) })
      .from(clientPayments)
      .where(eq(clientPayments.clinicId, clinicId))
      .groupBy(clientPayments.clientId),
  ]);

  const chargedByClient = new Map(charged.map((row) => [row.clientId, Number(row.total ?? 0)]));
  const paidByClient = new Map(paid.map((row) => [row.clientId, Number(row.total ?? 0)]));

  const statuses = new Map<string, PaymentStatus>();

  for (const id of new Set([...chargedByClient.keys(), ...paidByClient.keys()])) {
    statuses.set(
      id,
      paymentStatus(subscriberTotals(chargedByClient.get(id) ?? 0, paidByClient.get(id) ?? 0)),
    );
  }

  return statuses;
}

/**
 * Where every subscriber in the clinic stands on their newest term.
 *
 * The Bills filter's `subscription` column. Only the subscription charges are
 * read — whichever of the clinic's services run for a term — and only the four
 * fields the standing is decided from, so this is a narrow read over the one
 * table even on a clinic with years of ledger behind it.
 *
 * The verdict itself is {@link subscriptionStanding}'s, given the same shape of
 * entry the Bills row hands it, so a filter can never disagree with the chip it
 * is filtering on. `none` — never on a subscription — is again the complement
 * of these keys rather than an entry, for the reason given above.
 */
export async function subscriptionStateByClient(
  clinicId: string,
  today: string,
): Promise<Map<string, Exclude<SubscriptionState, 'none'>>> {
  const services = await clinicServices(clinicId);
  const terms = services.filter((service) => service.kind === 'subscription').map((s) => s.key);

  /* A clinic selling nothing that runs for a term has nobody on one. */
  if (terms.length === 0) return new Map();

  const [rows, freezes] = await Promise.all([
    db
      .select({
        clientId: clientCharges.clientId,
        service: clientCharges.service,
        occurredOn: clientCharges.chargedOn,
        createdAt: clientCharges.createdAt,
      })
      .from(clientCharges)
      .where(and(eq(clientCharges.clinicId, clinicId), inArray(clientCharges.service, terms))),
    clinicFreezesByClient(clinicId),
  ]);

  const byClient = new Map<string, BillEntry[]>();

  for (const row of rows) {
    const entries = byClient.get(row.clientId) ?? [];

    /*
      `subscriptionStanding` reads a ledger entry, and only four of its fields
      matter to it: the kind, the service, the day and the row's own age. The
      rest are filled with the empty values a charge with nothing recorded on it
      would carry, rather than being selected and thrown away.
    */
    entries.push({
      id: '',
      kind: 'charge',
      occurredOn: row.occurredOn,
      amountMinor: 0,
      description: null,
      method: null,
      service: row.service,
      note: null,
      createdAt: row.createdAt,
    });

    byClient.set(row.clientId, entries);
  }

  const states = new Map<string, Exclude<SubscriptionState, 'none'>>();

  for (const [clientId, entries] of byClient) {
    const standing = subscriptionStanding(entries, services, today, freezes.get(clientId) ?? []);
    if (standing.state !== 'none') states.set(clientId, standing.state);
  }

  return states;
}
