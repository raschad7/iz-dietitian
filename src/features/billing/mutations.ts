import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { addDays, type IsoDate } from '@/features/booking/date';
import {
  clientCharges,
  clientPayments,
  clientSubscriptionFreezes,
  clients,
  clinicServices,
} from '@/db/schema';

import { clinicServices as readClinicServices, subscriberTotalsByClient } from './queries';
import type {
  FreezeSubscriptionInput,
  RecordChargeInput,
  RecordPaymentInput,
  ServiceInput,
} from './schema';
import { DEFAULT_SERVICES, serviceKeyFrom } from './services';
import { subscriptionCovering, subscriptionService, type SubscriptionTerm } from './subscription';

/**
 * Writes for the billing feature.
 *
 * Like the queries beside them, these import nothing from Next.js, so a test or
 * a script can call them directly.
 */

/** Thrown when the subscriber a payment names is not this clinic's to bill. */
export class ClientNotInClinicError extends Error {
  constructor(readonly clientId: string) {
    super(`client ${clientId} does not belong to this clinic`);
    this.name = 'ClientNotInClinicError';
  }
}

/**
 * Thrown when a payment is larger than what the subscriber still owes.
 *
 * Carries what is left, so the caller can say how much would have been
 * accepted rather than only that this was too much.
 */
export class PaymentExceedsBalanceError extends Error {
  constructor(readonly remainingMinor: number) {
    super(`payment exceeds the ${remainingMinor} still outstanding`);
    this.name = 'PaymentExceedsBalanceError';
  }
}

/**
 * Records money received from a subscriber.
 *
 * ## The clinic check is not redundant
 *
 * `clinicId` comes from `requireStaffClinic`, but `clientId` comes from **the
 * submitted form** — so without the lookup below, a staff member at clinic A
 * could post a payment onto clinic B's subscriber by editing one hidden field.
 *
 * ## Nobody pays more than they owe
 *
 * A payment cannot take an account past settled: a subscriber billed ₪1,000
 * cannot be recorded as paying ₪1,200, and one who has already paid ₪400 of
 * that ₪1,000 cannot be recorded as paying more than the ₪600 left. What is
 * outstanding is `remainingMinor` — charges less payments, floored at zero —
 * so the two questions are one question.
 *
 * **A consequence worth naming: nothing can be received against an account with
 * nothing billed on it.** A deposit taken before the service is recorded has to
 * wait for the charge, which is the rule as asked for; recording the charge
 * first is the way to take one.
 *
 * Refunds are untouched. A negative payment is money going back out — it can
 * only ever move the account away from settled, never past it — so the cap has
 * nothing to say about one.
 *
 * The check is here rather than only on the card for the reason the
 * subscription rule gives: a form posts what it likes, and two people
 * recording the same payment would both have been looking at a card that said
 * it was allowed. The card still shows what is left before anybody types.
 * Stamping the row with the caller's own `clinicId` would not save it: the row
 * would then claim to belong to clinic A while pointing at a client row owned
 * by clinic B, which is worse than the leak — it is a ledger that disagrees
 * with itself and that no later query can untangle.
 *
 * So the client is read under both ids first, and the write is refused if that
 * pair does not exist.
 *
 * ## No transaction
 *
 * One insert, and nothing derived is stored — totals are summed on read, so
 * there is no second row to keep in step with this one. A transaction here
 * would be ceremony around a single statement. That changes the day a charge
 * and a payment are ever written together.
 */
export async function recordPayment(
  clinicId: string,
  input: RecordPaymentInput,
  recordedBy: string | null = null,
): Promise<{ id: string }> {
  await assertClientInClinic(clinicId, input.clientId);

  if (input.amountMinor > 0) {
    const totals = await subscriberTotalsByClient(clinicId, [input.clientId]);
    const remainingMinor = totals.get(input.clientId)?.remainingMinor ?? 0;

    if (input.amountMinor > remainingMinor) throw new PaymentExceedsBalanceError(remainingMinor);
  }

  const [row] = await db
    .insert(clientPayments)
    .values({
      clinicId,
      clientId: input.clientId,
      amountMinor: input.amountMinor,
      method: input.method,
      paidOn: input.paidOn,
      note: input.note,
      recordedBy,
    })
    .returning({ id: clientPayments.id });

  /*
    `returning` on an insert of one row always yields one row; the throw is
    here so the return type is honestly non-optional rather than asserted with
    a `!` that hides a driver change.
  */
  if (!row) throw new Error('payment insert returned no row');

  return row;
}

/**
 * Thrown when a subscription is charged over one that is still running.
 *
 * Carries the term in the way, so the caller can say when it ends rather than
 * only that something is wrong.
 */
export class SubscriptionActiveError extends Error {
  constructor(readonly term: SubscriptionTerm) {
    super(`a ${term.service.key} subscription already covers ${term.startedOn} to ${term.endsOn}`);
    this.name = 'SubscriptionActiveError';
  }
}

/**
 * Adds a charge to a subscriber's account — the other half of the ledger.
 *
 * The same shape as {@link recordPayment}, and the same tenant check for the
 * same reason: `clientId` arrives from a form, so it is proved against the
 * clinic before anything is written.
 *
 * Nothing here nets the charge against what has been paid. Totals are summed on
 * read (`subscriberTotalsByClient`), so adding a charge is one insert and the
 * balance, the remaining figure and the payment-status chip all move on the
 * next render without a second write to keep in step.
 *
 * ## One subscription at a time
 *
 * A subscriber inside a term cannot be sold another one. Somebody on a month
 * has already paid for those days, and charging a second subscription across
 * them would take money for time the clinic has been paid for twice over — and
 * leave the register holding two overlapping terms with no way to say which one
 * a later renewal renews. The next term can be recorded the day the current one
 * ends plus one, and no earlier.
 *
 * **The check is here and not only on the card.** The dialog greys the
 * subscription options out and says why, which is where a person meets the
 * rule; this is where it is true. A form posts what it likes — the service is a
 * hidden field — and two dietitians recording a renewal in the same minute
 * would both have been looking at a card that said it was allowed. Consultations
 * are untouched: a visit is not a term, and somebody mid-subscription can still
 * be charged for one.
 *
 * The question is asked of the charge's own day rather than of today, so
 * back-dating a subscription into a covered week is refused for the same reason
 * recording one now is. See `subscriptionCovering`.
 */
export async function recordCharge(
  clinicId: string,
  input: RecordChargeInput,
  recordedBy: string | null = null,
): Promise<{ id: string }> {
  await assertClientInClinic(clinicId, input.clientId);

  const services = await readClinicServices(clinicId);

  if (subscriptionService(services, input.service)) {
    /*
      Two columns for the rows that could collide, not the whole ledger: the
      question is which days are already covered, and a description or an amount
      answers none of it. The freezes come with them, because a paused term ends
      later than its dates say and selling the next one over those days would be
      the very overlap this rule exists to refuse.
    */
    const [sold, freezes] = await Promise.all([
      db
        .select({ service: clientCharges.service, occurredOn: clientCharges.chargedOn })
        .from(clientCharges)
        .where(
          and(eq(clientCharges.clinicId, clinicId), eq(clientCharges.clientId, input.clientId)),
        ),
      db
        .select({
          startsOn: clientSubscriptionFreezes.startsOn,
          endsOn: clientSubscriptionFreezes.endsOn,
        })
        .from(clientSubscriptionFreezes)
        .where(
          and(
            eq(clientSubscriptionFreezes.clinicId, clinicId),
            eq(clientSubscriptionFreezes.clientId, input.clientId),
          ),
        ),
    ]);

    const covering = subscriptionCovering(sold, services, input.chargedOn, freezes, input.chargedOn);

    if (covering) throw new SubscriptionActiveError(covering);
  }

  const [row] = await db
    .insert(clientCharges)
    .values({
      clinicId,
      clientId: input.clientId,
      description: input.description,
      service: input.service,
      amountMinor: input.amountMinor,
      chargedOn: input.chargedOn,
      note: input.note,
      recordedBy,
    })
    .returning({ id: clientCharges.id });

  if (!row) throw new Error('charge insert returned no row');

  return row;
}

/**
 * Proves the subscriber is this clinic's before anything is written about them.
 *
 * Shared by both writers rather than repeated, so the two can never disagree
 * about what the boundary is — the failure mode being that one of them is
 * tightened and the other quietly is not.
 */
async function assertClientInClinic(clinicId: string, clientId: string): Promise<void> {
  const [owned] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.clinicId, clinicId)))
    .limit(1);

  if (!owned) throw new ClientNotInClinicError(clientId);
}

/**
 * Gives a new clinic the services it starts with.
 *
 * Called once, when the clinic row is created. `onConflictDoNothing` on the
 * (clinic, key) index makes it safe to call twice — a clinic that has already
 * been seeded and has since renamed "استشارة" must not have its own words
 * written back over.
 *
 * A clinic is deliberately *not* seeded lazily on first read. A list that
 * appears when somebody happens to open Settings is a list that reappears after
 * a clinic empties it, and "I deleted these and they came back" is a worse bug
 * than an empty screen.
 */
export async function seedDefaultServices(clinicId: string): Promise<void> {
  await db
    .insert(clinicServices)
    .values(DEFAULT_SERVICES.map((service) => ({ ...service, clinicId })))
    .onConflictDoNothing({ target: [clinicServices.clinicId, clinicServices.key] });
}

/**
 * Adds a service to a clinic's list.
 *
 * The key is generated here rather than typed: it is the handle the ledger
 * records, it must be unique within the clinic and stable for the life of the
 * service, and none of that is something to ask a dietitian about. See
 * {@link serviceKeyFrom}.
 *
 * A name given in only one language is copied into the other. A clinic working
 * in Arabic should not have to write English to add a service, and a bill with a
 * blank line on it is worse than one with an untranslated name.
 */
export async function createService(
  clinicId: string,
  input: ServiceInput,
): Promise<{ id: string }> {
  const existing = await db
    .select({ key: clinicServices.key, sortOrder: clinicServices.sortOrder })
    .from(clinicServices)
    .where(eq(clinicServices.clinicId, clinicId))
    .orderBy(desc(clinicServices.sortOrder));

  const names = bothNames(input);
  const key = serviceKeyFrom(names, existing.map((row) => row.key));

  const [row] = await db
    .insert(clinicServices)
    .values({
      clinicId,
      key,
      ...names,
      kind: input.kind,
      durationMonths: input.kind === 'subscription' ? input.durationMonths : null,
      priceMinor: input.priceMinor,
      firstFree: input.firstFree,
      active: input.active,
      sortOrder: (existing[0]?.sortOrder ?? -1) + 1,
    })
    .returning({ id: clinicServices.id });

  if (!row) throw new Error('service insert returned no row');

  return row;
}

/**
 * Edits one service.
 *
 * **The key never changes**, so every charge that already names this service
 * keeps naming it. Renaming is exactly what the two name columns are for; the
 * ledger is keyed on something a clinic cannot type.
 *
 * Changing a subscription's term does move the renewal date of every term ever
 * sold under it, because a term end is derived rather than stored — see
 * `subscriptionEnd`. That is the same property that lets a correction fix every
 * row at once, and it is why the settings screen says so beside the field rather
 * than hiding it.
 */
export async function updateService(
  clinicId: string,
  serviceId: string,
  input: ServiceInput,
): Promise<void> {
  await db
    .update(clinicServices)
    .set({
      ...bothNames(input),
      kind: input.kind,
      durationMonths: input.kind === 'subscription' ? input.durationMonths : null,
      priceMinor: input.priceMinor,
      firstFree: input.firstFree,
      active: input.active,
      updatedAt: new Date(),
    })
    .where(and(eq(clinicServices.clinicId, clinicId), eq(clinicServices.id, serviceId)));
}

/** Thrown when a service that a charge already names is asked to be deleted. */
export class ServiceInUseError extends Error {
  constructor(readonly serviceId: string) {
    super(`service ${serviceId} is named by at least one charge`);
    this.name = 'ServiceInUseError';
  }
}

/**
 * Deletes a service — only one nothing has ever been charged under.
 *
 * **Retiring is the ordinary answer** and this is the narrow one: a service a
 * clinic added by mistake, five minutes ago, with no ledger behind it. Once a
 * charge names the key, deleting the row would leave that charge naming nothing
 * — the term could not be dated, the ledger row could not be tinted, and the
 * Bills column would quietly report the subscriber as never having been on a
 * subscription. `active = false` says "stop offering this" without any of that.
 */
export async function deleteService(clinicId: string, serviceId: string): Promise<void> {
  const [service] = await db
    .select({ key: clinicServices.key })
    .from(clinicServices)
    .where(and(eq(clinicServices.clinicId, clinicId), eq(clinicServices.id, serviceId)))
    .limit(1);

  if (!service) return;

  const [used] = await db
    .select({ id: clientCharges.id })
    .from(clientCharges)
    .where(and(eq(clientCharges.clinicId, clinicId), eq(clientCharges.service, service.key)))
    .limit(1);

  if (used) throw new ServiceInUseError(serviceId);

  await db
    .delete(clinicServices)
    .where(and(eq(clinicServices.clinicId, clinicId), eq(clinicServices.id, serviceId)));
}

/** Both names, with an empty one filled from the other. See {@link createService}. */
function bothNames(input: ServiceInput): { nameAr: string; nameEn: string } {
  return {
    nameAr: input.nameAr || input.nameEn,
    nameEn: input.nameEn || input.nameAr,
  };
}

/** Thrown when a freeze would overlap one the subscriber already has. */
export class FreezeOverlapError extends Error {
  constructor(readonly startsOn: string) {
    super(`a freeze already covers ${startsOn}`);
    this.name = 'FreezeOverlapError';
  }
}

/**
 * Pauses a subscriber's subscription from `startsOn`.
 *
 * `endsOn` is optional and null is a real answer — "frozen until they come
 * back", which is what the clinic usually knows on the day. `resumeFreeze`
 * closes it later; until then the term end moves out a day at a time.
 *
 * **Overlaps are refused.** Two freezes over the same fortnight would give the
 * days back twice if the arithmetic ever counted them separately, and reading
 * two rows for one pause is nobody's idea of a record. `frozenDaysWithin` also
 * merges overlapping ranges, so the two agree even if a row is edited into place
 * some other way — a rule worth having in both places, since the arithmetic must
 * not depend on a check made in a different module.
 *
 * Nothing here requires an active subscription. A freeze recorded over days no
 * term covers simply adds nothing to anything, which is the honest outcome: the
 * clinic wrote down that somebody paused, and there was nothing running to
 * pause.
 */
export async function recordFreeze(
  clinicId: string,
  input: FreezeSubscriptionInput,
  recordedBy: string | null = null,
): Promise<{ id: string }> {
  await assertClientInClinic(clinicId, input.clientId);

  const existing = await db
    .select({
      startsOn: clientSubscriptionFreezes.startsOn,
      endsOn: clientSubscriptionFreezes.endsOn,
    })
    .from(clientSubscriptionFreezes)
    .where(
      and(
        eq(clientSubscriptionFreezes.clinicId, clinicId),
        eq(clientSubscriptionFreezes.clientId, input.clientId),
      ),
    );

  const end = input.endsOn;

  for (const freeze of existing) {
    const overlaps =
      (end === null || freeze.startsOn <= end) &&
      (freeze.endsOn === null || input.startsOn <= freeze.endsOn);

    if (overlaps) throw new FreezeOverlapError(freeze.startsOn);
  }

  const [row] = await db
    .insert(clientSubscriptionFreezes)
    .values({
      clinicId,
      clientId: input.clientId,
      startsOn: input.startsOn,
      endsOn: end,
      reason: input.reason,
      recordedBy,
    })
    .returning({ id: clientSubscriptionFreezes.id });

  if (!row) throw new Error('freeze insert returned no row');

  return row;
}

/**
 * Ends a running freeze because the subscriber is back — the Resume button.
 *
 * ## It ends yesterday, so that today counts again
 *
 * "Resume" is pressed on the day somebody walks back in, and what the dietitian
 * means by it is *this person is running again, now*. A freeze ending **today**
 * would still cover today, so the record would go on saying frozen, the chip
 * would go on reading مجمّد, and the button would sit there looking as though
 * pressing it had done nothing — which is exactly how it read before this. The
 * last frozen day is therefore the day before, and the freeze is closed at it.
 *
 * A pause recorded and ended on the same day gave back no days at all, so there
 * is nothing to record and the row is removed. Clamping it to a single frozen
 * day instead would leave the subscriber reading as frozen for the rest of the
 * day they came back on, which is the failure this function exists to avoid.
 *
 * ## Any running freeze, not only an open one
 *
 * This used to touch open freezes alone — a freeze with an agreed end had
 * "already been resumed", and moving that end was held to be an edit rather
 * than a resume. That reasoning does not survive contact with the clinic. An
 * agreed nine days is agreed *in advance*, and somebody who comes back on the
 * fourth day is the ordinary case, not a correction. Worse, the screen offered
 * Resume on those freezes anyway: the update matched no rows, the action
 * reported success, and the dietitian pressed a button that silently did
 * nothing.
 *
 * Returns whether a freeze was actually found. `false` means the row is gone —
 * removed in another tab — and the caller says so rather than reporting a
 * resume that never happened.
 */
export async function resumeFreeze(
  clinicId: string,
  freezeId: string,
  today: string,
): Promise<boolean> {
  const scope = and(
    eq(clientSubscriptionFreezes.clinicId, clinicId),
    eq(clientSubscriptionFreezes.id, freezeId),
  );

  const [freeze] = await db
    .select({ startsOn: clientSubscriptionFreezes.startsOn })
    .from(clientSubscriptionFreezes)
    .where(scope)
    .limit(1);

  if (!freeze) return false;

  // Nothing was ever frozen: see the note above.
  if (freeze.startsOn >= today) {
    await db.delete(clientSubscriptionFreezes).where(scope);
    return true;
  }

  await db
    .update(clientSubscriptionFreezes)
    .set({ endsOn: addDays(today as IsoDate, -1), updatedAt: new Date() })
    .where(scope);

  return true;
}

/**
 * Removes a freeze entirely — a pause recorded by mistake.
 *
 * Returns whether a row was there to remove, for the same reason
 * {@link resumeFreeze} does: a button that reports success for a write that
 * matched nothing is worse than one that reports the failure.
 */
export async function deleteFreeze(clinicId: string, freezeId: string): Promise<boolean> {
  const removed = await db
    .delete(clientSubscriptionFreezes)
    .where(
      and(
        eq(clientSubscriptionFreezes.clinicId, clinicId),
        eq(clientSubscriptionFreezes.id, freezeId),
      ),
    )
    .returning({ id: clientSubscriptionFreezes.id });

  return removed.length > 0;
}
