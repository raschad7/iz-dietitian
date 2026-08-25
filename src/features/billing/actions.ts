'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { locales } from '@/i18n/routing';
import { requireStaffClinic } from '@/lib/session';

import { type BillingErrorKey, type BillingFormState } from './form-state';
import { ClientNotInClinicError, recordCharge, recordPayment, setServicePrices } from './mutations';
import { recordChargeSchema, recordPaymentSchema, servicePriceSchema } from './schema';
import { BILLING_SERVICES } from './services';

/**
 * Server actions for the billing feature.
 *
 * Route files under `src/app/` compose screens; the decisions live here and in
 * `mutations.ts`. This layer does three things and no more: prove who is
 * asking, validate what they sent, and turn a thrown error into a message key
 * the dialog can render in either language.
 */

const localeSchema = z.enum(locales);

/** Records money received from a subscriber. Shaped for `useActionState`. */
export async function recordPaymentAction(
  _previous: BillingFormState,
  formData: FormData,
): Promise<BillingFormState> {
  const locale = localeSchema.parse(formData.get('locale'));

  // The authoritative tenant boundary. Everything below is scoped by this.
  const { clinicId, session } = await requireStaffClinic(locale);

  const parsed = recordPaymentSchema.safeParse({
    clientId: formData.get('clientId'),
    amountMinor: formData.get('amount'),
    method: formData.get('method'),
    paidOn: formData.get('paidOn'),
    note: formData.get('note') ?? undefined,
  });

  if (!parsed.success) return { status: 'error', messageKey: messageKeyFor(parsed.error) };

  try {
    await recordPayment(clinicId, parsed.data, session.user.id);
  } catch (error) {
    return failure(error, 'recording a payment');
  }

  revalidateLedger(locale, parsed.data.clientId);
  return { status: 'success' };
}

/** Adds a charge to a subscriber's account. The other half of the ledger. */
export async function recordChargeAction(
  _previous: BillingFormState,
  formData: FormData,
): Promise<BillingFormState> {
  const locale = localeSchema.parse(formData.get('locale'));
  const { clinicId, session } = await requireStaffClinic(locale);

  const parsed = recordChargeSchema.safeParse({
    clientId: formData.get('clientId'),
    description: formData.get('description'),
    service: formData.get('service') ?? undefined,
    amountMinor: formData.get('amount'),
    chargedOn: formData.get('chargedOn'),
    note: formData.get('note') ?? undefined,
  });

  if (!parsed.success) return { status: 'error', messageKey: messageKeyFor(parsed.error) };

  try {
    await recordCharge(clinicId, parsed.data, session.user.id);
  } catch (error) {
    return failure(error, 'recording a charge');
  }

  revalidateLedger(locale, parsed.data.clientId);
  return { status: 'success' };
}

/**
 * The two screens that read the ledger.
 *
 * Bills draws the totals and the status chip; the subscriber's own record sits
 * behind the name in every row. `'page'` leaves the layouts — and so the rail —
 * alone.
 *
 * The locale prefix is on the path because `routing.localePrefix` is `'always'`;
 * revalidating an unprefixed path would match nothing.
 */
function revalidateLedger(locale: string, clientId: string): void {
  revalidatePath(`/${locale}/app/clients/bills`, 'page');
  revalidatePath(`/${locale}/app/clients/${clientId}`, 'page');
}

/**
 * One thrown error, as something the dialog can say.
 *
 * Only the tenant refusal is named. Anything else — a dropped connection, a
 * check constraint the schema and the database disagree about — is a fault
 * rather than something the person at the keyboard can fix, so it reads as the
 * generic message and is left to the server log.
 */
function failure(error: unknown, what: string): BillingFormState {
  if (error instanceof ClientNotInClinicError) {
    return { status: 'error', messageKey: 'invalidClient' };
  }

  console.error(`[billing] ${what} failed`, error);
  return { status: 'error', messageKey: 'genericError' };
}

/**
 * The first issue's message, when it is one the dialogs know how to say.
 *
 * Zod reports a list of issues against field paths; the dialog shows one line.
 * The schemas set every message to exactly a `BillingErrorKey`, so this reads
 * the first and falls back to `genericError` if a schema change ever introduces
 * a key the state type does not know. That fallback is a real message rather
 * than a crash — and also the case the union exists to make loud in review.
 */
const KNOWN_KEYS = [
  'amountRequired',
  'invalidAmount',
  'amountZero',
  'amountNegative',
  'amountTooLarge',
  'invalidDate',
  'noteTooLong',
  'descriptionRequired',
  'descriptionTooLong',
  'invalidClient',
  'invalidService',
] as const satisfies readonly BillingErrorKey[];

function messageKeyFor(error: z.ZodError): BillingErrorKey {
  const first = error.issues[0]?.message;
  return KNOWN_KEYS.find((key) => key === first) ?? 'genericError';
}

/**
 * Writes every service price the settings section is showing.
 *
 * One submission for the whole list, because that is what the section's one
 * button means: the reader edited what they came to edit and pressed Save
 * changes once. Prices that did not move are re-sent and re-written to the same
 * value, which costs a statement and buys the guarantee that what is stored is
 * exactly what was on screen.
 *
 * **A blank field is "no price", not zero.** Clearing one removes the row — the
 * state the section draws as unpriced. Zero stays a real answer: a service the
 * clinic gives away.
 *
 * The first field that does not parse stops the write, and nothing is stored.
 * Saving the two that were valid and refusing the third would leave the screen
 * disagreeing with itself about which prices took.
 */
export async function saveServicePricesAction(
  _previous: BillingFormState,
  formData: FormData,
): Promise<BillingFormState> {
  const locale = localeSchema.parse(formData.get('locale'));
  const { clinicId } = await requireStaffClinic(locale);

  const writes: { service: string; amountMinor: number | null }[] = [];

  for (const service of BILLING_SERVICES) {
    const raw = String(formData.get(`price-${service.value}`) ?? '').trim();

    if (!raw) {
      writes.push({ service: service.value, amountMinor: null });
      continue;
    }

    const parsed = servicePriceSchema.safeParse({ service: service.value, amountMinor: raw });
    if (!parsed.success) return { status: 'error', messageKey: messageKeyFor(parsed.error) };

    writes.push({ service: service.value, amountMinor: parsed.data.amountMinor });
  }

  try {
    await setServicePrices(clinicId, writes);
  } catch (error) {
    return failure(error, 'setting service prices');
  }

  revalidatePath(`/${locale}/app/settings`);
  return { status: 'success' };
}
