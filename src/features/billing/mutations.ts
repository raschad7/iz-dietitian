import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { clientCharges, clientPayments, clients, clinicServicePrices } from '@/db/schema';

import type { RecordChargeInput, RecordPaymentInput } from './schema';

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
 * Records money received from a subscriber.
 *
 * ## The clinic check is not redundant
 *
 * `clinicId` comes from `requireStaffClinic`, but `clientId` comes from **the
 * submitted form** — so without the lookup below, a staff member at clinic A
 * could post a payment onto clinic B's subscriber by editing one hidden field.
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
 */
export async function recordCharge(
  clinicId: string,
  input: RecordChargeInput,
  recordedBy: string | null = null,
): Promise<{ id: string }> {
  await assertClientInClinic(clinicId, input.clientId);

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
