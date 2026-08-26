import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { clientCharges, clientPayments, clients, clinicServicePrices } from '@/db/schema';

import { subscriberTotalsByClient } from './queries';
import type { RecordChargeInput, RecordPaymentInput } from './schema';
import { isSubscriptionService, subscriptionCovering, type SubscriptionTerm } from './subscription';

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
    super(`a ${term.service} subscription already covers ${term.startedOn} to ${term.endsOn}`);
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

  if (isSubscriptionService(input.service)) {
    /*
      Two columns for the rows that could collide, not the whole ledger: the
      question is which days are already covered, and a description or an amount
      answers none of it.
    */
    const sold = await db
      .select({ service: clientCharges.service, occurredOn: clientCharges.chargedOn })
      .from(clientCharges)
      .where(and(eq(clientCharges.clinicId, clinicId), eq(clientCharges.clientId, input.clientId)));

    const covering = subscriptionCovering(sold, input.chargedOn);

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
 * Writes a clinic's price list — every service in one go.
 *
 * One transaction, because the list is read as a whole and a half-applied one
 * is a screen that disagrees with itself. A `null` amount deletes the row: a
 * price can be taken back off a service, which is not the same as pricing it at
 * zero — see `clinic_service_prices`.
 */
export async function setServicePrices(
  clinicId: string,
  prices: readonly { service: string; amountMinor: number | null }[],
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const { service, amountMinor } of prices) {
      if (amountMinor === null) {
        await tx
          .delete(clinicServicePrices)
          .where(
            and(eq(clinicServicePrices.clinicId, clinicId), eq(clinicServicePrices.service, service)),
          );
        continue;
      }

      await tx
        .insert(clinicServicePrices)
        .values({ clinicId, service, amountMinor })
        .onConflictDoUpdate({
          target: [clinicServicePrices.clinicId, clinicServicePrices.service],
          set: { amountMinor, updatedAt: new Date() },
        });
    }
  });
}
