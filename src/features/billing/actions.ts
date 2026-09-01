'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { locales } from '@/i18n/routing';
import { requireStaffClinic } from '@/lib/session';
import { getClient } from '@/features/clients/queries';
import { clinicMessageBody } from '@/features/forms/queries';
import { getSettings } from '@/features/whatsapp/queries';
import { formatAmount } from '@/features/billing/money';
import { subscriberTotalsByClient } from '@/features/billing/queries';
import { renderBill } from '@/features/billing/pdf/render';
import { manualDedupeKey, sendWhatsappMessage } from '@/features/whatsapp/send';
import type { SendResult } from '@/features/whatsapp/types';
import { PATIENT_MESSAGE_LOCALE, renderWhatsappMessage } from '@/features/whatsapp/templates';
import { billingClinicHeader } from '@/features/billing/pdf/clinic';

import { type BillingErrorKey, type BillingFormState } from './form-state';
import {
  ClientNotInClinicError,
  PaymentExceedsBalanceError,
  recordCharge,
  recordPayment,
  setServicePrices,
  SubscriptionActiveError,
} from './mutations';
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

  /* Deliberately *not* revalidated here — see `revalidateLedgerAction`. */
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

  /* Deliberately *not* revalidated here — see `revalidateLedgerAction`. */
  return { status: 'success' };
}

/**
 * Rebuilds the two screens that read the ledger, as a call of its own.
 *
 * ## Why this is not a line at the end of the two writes above
 *
 * It was, and it is what made recording a payment feel broken on the deployed
 * server: the card sat on "Recording…" for seconds after the money had already
 * been written, sometimes long enough that the reader reloaded the page to find
 * the payment was there all along.
 *
 * A server action that revalidates does not answer when the write is done. Next
 * re-renders the route the caller is standing on and streams *that* back in the
 * same response — so the reply to "record ₪10" was the whole Bills register, or
 * the whole subscriber record, rebuilt from the database first. On a laptop
 * pointed at a local database nobody notices; over a network round trip per
 * query it is the difference between a card that closes and a card that hangs.
 * `useActionState` reports `pending` for all of it, because all of it is one
 * response.
 *
 * So the write answers with nothing but its own outcome, and the rebuild is a
 * second call the card makes *after* it has closed and said so. The same work
 * happens, on the same two paths; what changed is that nobody is waiting on it.
 * The register catches up a moment later, which is the moment it was always
 * going to catch up in — the card no longer stands still for it.
 *
 * ⚠ **Every caller of `recordPaymentAction` or `recordChargeAction` has to call
 * this on success.** A write that lands and is never followed by this leaves
 * both screens on whatever the client router cached, for as long as
 * `staleTimes.dynamic` in `next.config.ts` says.
 */
export async function revalidateLedgerAction(locale: string, clientId: string): Promise<void> {
  const parsed = localeSchema.parse(locale);
  /* A server action is a public endpoint even when all it does is drop a cache
     entry: the guard is what keeps this from being a way to ask whether an
     arbitrary id is a path worth revalidating. */
  await requireStaffClinic(parsed);

  revalidateLedger(parsed, clientId);
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
 * Three refusals are named: the tenant boundary, a subscription sold over a
 * running one, and a payment larger than the account owes — all three are
 * things the person at the keyboard can act on. Anything else — a dropped connection, a
 * check constraint the schema and the database disagree about — is a fault
 * rather than something the person at the keyboard can fix, so it reads as the
 * generic message and is left to the server log.
 */
function failure(error: unknown, what: string): BillingFormState {
  if (error instanceof ClientNotInClinicError) {
    return { status: 'error', messageKey: 'invalidClient' };
  }

  /*
    Without the date. The state carries a key and no values — see
    `BillingFormState` — and the card already prints the day the term ends under
    the greyed-out option, which is where somebody reads it before submitting
    rather than after being refused.
  */
  if (error instanceof SubscriptionActiveError) {
    return { status: 'error', messageKey: 'subscriptionActive' };
  }

  /* Without the figure, for the reason above: the card prints what is left
     under the keypad, where it is read before the button rather than after. */
  if (error instanceof PaymentExceedsBalanceError) {
    return { status: 'error', messageKey: 'paymentExceedsBalance' };
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

/**
 * Sends a subscriber their own statement on WhatsApp — the same PDF the row's
 * printer produces, as a document they keep.
 *
 * **The same bytes, not a second rendering of the same idea.** `renderBill` is
 * what the print route calls, so what arrives on the subscriber's phone is the
 * document the dietitian would have handed them across the desk. A separate
 * "WhatsApp version" would be a second bill to keep in step with the first, and
 * the two would disagree the week somebody changed one of them.
 *
 * **It goes through the ordinary funnel.** `sendWhatsappMessage` owns the
 * rules that make an outgoing message safe — the row written before the network
 * call, the connection checked once, the number checked against WhatsApp, the
 * failure recorded rather than thrown — and a bill is not special enough to
 * deserve its own copy of any of them. See `send.ts`.
 *
 * **A random dedupe key, like any other hand-pressed send.** Sending a statement
 * twice is a legitimate thing to want: the first one arrived while the
 * subscriber was mid-conversation about it, or they asked for it again a month
 * later. Deduping would silently swallow the second press and leave the
 * dietitian looking at a button that did nothing.
 *
 * The caption is Arabic whatever language the dietitian is working in — see
 * `PATIENT_MESSAGE_LOCALE`; the message is read by the patient, not by the
 * person who pressed the button.
 */
export async function sendBillWhatsappAction(
  _previous: BillingFormState,
  formData: FormData,
): Promise<BillingFormState> {
  const locale = localeSchema.safeParse(formData.get('locale'));
  if (!locale.success) return { status: 'error', messageKey: 'genericError' };

  const { clinicId } = await requireStaffClinic(locale.data);

  const clientId = String(formData.get('clientId') ?? '');

  /* The clinic's own subscriber or nobody's. `getClient` is scoped to the
     clinic `requireStaffClinic` returned, so an id typed into the form cannot
     reach another clinic's record — the same guard the print route relies on. */
  const [client, clinic] = await Promise.all([
    getClient(clinicId, clientId),
    billingClinicHeader(clinicId),
  ]);

  if (!client || !clinic) return { status: 'error', messageKey: 'invalidClient' };

  /*
    One operation, or the whole account. `entryId` is what the Expenses tab's
    per-bill mark posts; the Bills row posts nothing and gets the statement.
    Empty string is treated as absent — a hidden input with no value is how a
    form says "the statement", not a request for a bill with no id.
  */
  const entryId = String(formData.get('entryId') ?? '') || undefined;

  /*
    The Bills row asks for the last bill without knowing which one that is.
    It holds a subscriber and nothing else, and reading one account’s history
    per row just to name an entry id is a query a row cannot afford — so the
    scope travels instead, and `renderBill` picks from the ledger it is
    already reading.
  */
  const latest = formData.get('scope') === 'latest';

  const bill = await renderBill({ clinicId, clientId, entryId, latest, locale: locale.data });
  if (!bill) return { status: 'error', messageKey: 'genericError' };

  const result = await sendWhatsappMessage({
    clinicId,
    clientId,
    kind: 'manual',
    phone: client.phone,
    /* The caption names which document is attached — one bill, or the account.
       `renderBill` has already refused an entry that is not on this
       subscriber's ledger, so by here the two cases are only wording. */
    body: renderWhatsappMessage(entryId || latest ? 'billDocument' : 'billStatement', PATIENT_MESSAGE_LOCALE, {
      clientName: client.fullName,
      clinicName: clinic.name,
    }),
    document: {
      /* `renderBill` hands back a `Uint8Array`; base64 is how the gateway takes
         bytes. `Buffer.from` wraps the same memory rather than copying it. */
      base64: Buffer.from(bill.body).toString('base64'),
      /* The readable one, not the header reference — see `sentBillFileName`.
         This is a file that lands in a chat and is kept. */
      fileName: bill.sentFileName,
      mimeType: 'application/pdf',
    },
    dedupeKey: manualDedupeKey(),
  });

  /* Named rather than collapsed — see `sendFailureKey`. */
  if (result.status !== 'sent') return { status: 'error', messageKey: sendFailureKey(result) };

  return { status: 'success' };
}

/**
 * Why a WhatsApp send did not happen, as something the dialog can say.
 *
 * The send funnel never throws — it reports (see `sendWhatsappMessage`) — and
 * the reasons it reports are operational: a gateway nobody connected, a record
 * with no number, a number nobody uses for WhatsApp. Each of those is a
 * different thing for the person at the desk to do next, which is why they are
 * not one key any more: "it did not send" left a dietitian pressing the button
 * again on a clinic whose WhatsApp had never been paired.
 *
 * `duplicate` and `empty_body` fall to the generic key deliberately. Neither
 * can happen from these buttons — the dedupe key is random and the body comes
 * from a template — so a message explaining them would be copy nobody ever
 * reads, kept in two languages.
 */
function sendFailureKey(result: SendResult): BillingErrorKey {
  if (result.status === 'skipped') {
    switch (result.reason) {
      case 'not_configured':
      case 'not_connected':
        return 'whatsappNotConnected';
      case 'no_phone':
        return 'clientHasNoPhone';
      case 'not_on_whatsapp':
        return 'clientNotOnWhatsapp';
      default:
        return 'billNotSent';
    }
  }

  return 'billNotSent';
}

/**
 * Nudges a subscriber about what they still owe, on WhatsApp.
 *
 * **The figure is read here, not posted.** The row that opened the menu already
 * knows what is outstanding and could have sent it along, and it must not: a
 * form carries whatever somebody puts in it, and an amount a client supplied is
 * an amount a client chose. The message says what the ledger says, summed on
 * the server from the same query the Bills column draws.
 *
 * That read is also the guard. A subscriber who owes nothing is not reminded
 * even if the button somehow reached this — the menu greys the item out, and
 * this is where that is true. Chasing somebody for a balance they settled this
 * morning is the one failure this feature has that a person cannot undo.
 *
 * No document. What is owed is a single number, and a PDF to open before you
 * can read it is a worse way to say it — see the `paymentReminder` template.
 * The statement is one press away in the same menu when they ask for detail.
 */
export async function sendPaymentReminderAction(
  _previous: BillingFormState,
  formData: FormData,
): Promise<BillingFormState> {
  const locale = localeSchema.safeParse(formData.get('locale'));
  if (!locale.success) return { status: 'error', messageKey: 'genericError' };

  const { clinicId } = await requireStaffClinic(locale.data);

  const clientId = String(formData.get('clientId') ?? '');

  const [client, clinic] = await Promise.all([
    getClient(clinicId, clientId),
    billingClinicHeader(clinicId),
  ]);

  if (!client || !clinic) return { status: 'error', messageKey: 'invalidClient' };

  /* The clinic's own switch for this message — see `payment_reminders_enabled`.
     Checked here and not only in the menu, because an action is reachable
     without one. */
  const settings = await getSettings(clinicId);
  if (settings && !settings.paymentRemindersEnabled) {
    return { status: 'error', messageKey: 'paymentRemindersOff' };
  }

  const override = await clinicMessageBody(clinicId, 'paymentReminder');

  const totals = await subscriberTotalsByClient(clinicId, [clientId]);
  const remainingMinor = totals.get(clientId)?.remainingMinor ?? 0;

  /* Nothing owed, nothing to chase. Its own key, because this is not a failure
     to send — it is a message that should not exist. */
  if (remainingMinor <= 0) return { status: 'error', messageKey: 'nothingOutstanding' };

  const result = await sendWhatsappMessage({
    clinicId,
    clientId,
    kind: 'manual',
    phone: client.phone,
    body: renderWhatsappMessage(
      'paymentReminder',
      PATIENT_MESSAGE_LOCALE,
      {
        clientName: client.fullName,
        clinicName: clinic.name,
        /* Formatted in the language the message is written in, not the one the
           dietitian is reading the screen in. */
        amount: formatAmount(PATIENT_MESSAGE_LOCALE, remainingMinor),
      },
      /* This clinic's own wording, if it has written one on the Forms tab.
         Read here rather than inside `sendWhatsappMessage` because this path
         hands that function a finished body — it is the one message the app
         composes outside `sendWhatsappTemplate`, which does its own lookup. */
      override,
    ),
    dedupeKey: manualDedupeKey(),
  });

  if (result.status !== 'sent') return { status: 'error', messageKey: sendFailureKey(result) };

  return { status: 'success' };
}
