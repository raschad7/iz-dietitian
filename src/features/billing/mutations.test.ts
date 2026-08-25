import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { clientCharges, clientPayments } from '@/db/schema';

import { createTestClient, createTestClinic, resetDatabase } from '../../../tests/helpers';
import { ClientNotInClinicError, recordCharge, recordPayment } from './mutations';
import { subscriberTotalsByClient } from './queries';
import { recordChargeSchema, recordPaymentSchema } from './schema';

let clinicId: string;
let clientId: string;

beforeEach(async () => {
  await resetDatabase();
  clinicId = await createTestClinic();
  clientId = await createTestClient(clinicId, 'هبة عوض');
});

/** The shape the action hands the mutation, already validated. */
function payment(overrides: Partial<{ amount: string; method: string; paidOn: string; note: string }> = {}) {
  return recordPaymentSchema.parse({
    clientId,
    amountMinor: overrides.amount ?? '270.50',
    method: overrides.method ?? 'cash',
    paidOn: overrides.paidOn ?? '2026-08-12',
    note: overrides.note,
  });
}

describe('recordPayment', () => {
  test('stores the amount in agorot, not shekels', async () => {
    const { id } = await recordPayment(clinicId, payment({ amount: '270.50' }));
    const [row] = await db.select().from(clientPayments).where(eq(clientPayments.id, id));

    expect(row?.amountMinor).toBe(27050);
    expect(row?.clinicId).toBe(clinicId);
    expect(row?.clientId).toBe(clientId);
    expect(row?.paidOn).toBe('2026-08-12');
  });

  test('records who entered it, and leaves it null when nobody is named', async () => {
    const { id } = await recordPayment(clinicId, payment());
    const [row] = await db.select().from(clientPayments).where(eq(clientPayments.id, id));

    expect(row?.recordedBy).toBeNull();
  });

  test('an empty note is stored as null rather than an empty string', async () => {
    const { id } = await recordPayment(clinicId, payment({ note: '   ' }));
    const [row] = await db.select().from(clientPayments).where(eq(clientPayments.id, id));

    expect(row?.note).toBeNull();
  });

  /*
    The reason the mutation re-reads the client rather than trusting the id it
    was handed: `clientId` arrives from a submitted form, so without this a
    staff member at one clinic could post a payment onto another clinic's
    subscriber by editing a hidden field.
  */
  test('refuses a subscriber belonging to another clinic', async () => {
    const otherClinicId = await createTestClinic('Other Clinic');
    const outsiderId = await createTestClient(otherClinicId, 'Someone Else');

    const input = recordPaymentSchema.parse({
      clientId: outsiderId,
      amountMinor: '100',
      method: 'cash',
      paidOn: '2026-08-12',
    });

    expect(recordPayment(clinicId, input)).rejects.toThrow(ClientNotInClinicError);

    const rows = await db.select().from(clientPayments);
    expect(rows).toHaveLength(0);
  });

  /* A refund is a negative payment — see the schema note and the table's check. */
  test('accepts a negative amount as a refund', async () => {
    const { id } = await recordPayment(clinicId, payment({ amount: '-150' }));
    const [row] = await db.select().from(clientPayments).where(eq(clientPayments.id, id));

    expect(row?.amountMinor).toBe(-15000);
  });

  test('the database rejects a zero payment even if one got past validation', async () => {
    expect(
      db.insert(clientPayments).values({
        clinicId,
        clientId,
        amountMinor: 0,
        method: 'cash',
        paidOn: '2026-08-12',
      }),
    ).rejects.toThrow();
  });
});

describe('recordPayment, read back through the bills query', () => {
  test('moves a subscriber from unpaid to partly paid to settled', async () => {
    await db.insert(clientCharges).values({
      clinicId,
      clientId,
      description: 'اشتراك شهري',
      amountMinor: 60000,
      chargedOn: '2026-08-01',
    });

    const read = async () => (await subscriberTotalsByClient(clinicId, [clientId])).get(clientId);

    expect(await read()).toMatchObject({ chargedMinor: 60000, paidMinor: 0, remainingMinor: 60000 });

    await recordPayment(clinicId, payment({ amount: '250' }));
    expect(await read()).toMatchObject({ paidMinor: 25000, remainingMinor: 35000, balanceMinor: 35000 });

    await recordPayment(clinicId, payment({ amount: '350' }));
    expect(await read()).toMatchObject({ paidMinor: 60000, remainingMinor: 0, balanceMinor: 0 });
  });

  /*
    Two payments that each land exactly on an agora boundary. Summed as
    integers this is exact; summed as shekel floats it is not.
  */
  test('sums payments without losing an agora', async () => {
    await recordPayment(clinicId, payment({ amount: '19.99' }));
    await recordPayment(clinicId, payment({ amount: '0.01' }));

    const totals = (await subscriberTotalsByClient(clinicId, [clientId])).get(clientId);
    expect(totals?.paidMinor).toBe(2000);
  });

  test('does not count another clinics payments', async () => {
    const otherClinicId = await createTestClinic('Other Clinic');
    const outsiderId = await createTestClient(otherClinicId, 'Someone Else');

    await recordPayment(
      otherClinicId,
      recordPaymentSchema.parse({
        clientId: outsiderId,
        amountMinor: '500',
        method: 'cash',
        paidOn: '2026-08-12',
      }),
    );

    const totals = await subscriberTotalsByClient(clinicId, [clientId, outsiderId]);
    expect(totals.get(clientId)?.paidMinor).toBe(0);
    // Asked for, but not this clinic's — so it reads as an empty ledger.
    expect(totals.get(outsiderId)?.paidMinor).toBe(0);
  });
});

describe('recordCharge', () => {
  function charge(overrides: Partial<{ amount: string; description: string; chargedOn: string }> = {}) {
    return recordChargeSchema.parse({
      clientId,
      description: overrides.description ?? 'اشتراك شهري',
      amountMinor: overrides.amount ?? '600',
      chargedOn: overrides.chargedOn ?? '2026-08-01',
    });
  }

  test('stores the charge in agorot with its description', async () => {
    const { id } = await recordCharge(clinicId, charge({ amount: '600' }));
    const [row] = await db.select().from(clientCharges).where(eq(clientCharges.id, id));

    expect(row?.amountMinor).toBe(60000);
    expect(row?.description).toBe('اشتراك شهري');
    expect(row?.clinicId).toBe(clinicId);
  });

  /* A waived visit is worth recording: it happened and was not billed. */
  test('allows a zero charge', async () => {
    const { id } = await recordCharge(clinicId, charge({ amount: '0' }));
    const [row] = await db.select().from(clientCharges).where(eq(clientCharges.id, id));

    expect(row?.amountMinor).toBe(0);
  });

  /*
    Money owed has no negative. Somebody reaching for a minus sign wants a
    refund, which is a payment — so validation refuses it before the database's
    own check has to.
  */
  test('refuses a negative charge at validation, naming the payment route', () => {
    const result = recordChargeSchema.safeParse({
      clientId,
      description: 'خصم',
      amountMinor: '-100',
      chargedOn: '2026-08-01',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('amountNegative');
  });

  test('requires a description, because a nameless bill line cannot be defended', () => {
    const result = recordChargeSchema.safeParse({
      clientId,
      description: '   ',
      amountMinor: '100',
      chargedOn: '2026-08-01',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('descriptionRequired');
  });

  test('rejects a date that is not a real day', () => {
    const result = recordChargeSchema.safeParse({
      clientId,
      description: 'زيارة',
      amountMinor: '100',
      chargedOn: '2026-02-31',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('invalidDate');
  });

  test('refuses a subscriber belonging to another clinic', async () => {
    const otherClinicId = await createTestClinic('Other Clinic');
    const outsiderId = await createTestClient(otherClinicId, 'Someone Else');

    const input = recordChargeSchema.parse({
      clientId: outsiderId,
      description: 'زيارة',
      amountMinor: '100',
      chargedOn: '2026-08-01',
    });

    expect(recordCharge(clinicId, input)).rejects.toThrow(ClientNotInClinicError);
    expect(await db.select().from(clientCharges)).toHaveLength(0);
  });
});

describe('a charge and a payment together', () => {
  test('drive the totals the bills table draws', async () => {
    await recordCharge(
      clinicId,
      recordChargeSchema.parse({
        clientId,
        description: 'اشتراك شهري',
        amountMinor: '600',
        chargedOn: '2026-08-01',
      }),
    );
    await recordPayment(clinicId, payment({ amount: '250' }));

    const totals = (await subscriberTotalsByClient(clinicId, [clientId])).get(clientId);

    expect(totals).toEqual({
      chargedMinor: 60000,
      paidMinor: 25000,
      balanceMinor: 35000,
      remainingMinor: 35000,
    });
  });
});
