import { z } from 'zod';

import { MAX_AMOUNT_MINOR, parseAmount } from './money';
import { isBillingService } from './services';

/**
 * Input validation for the billing feature.
 *
 * The amount is the only interesting field here, and it is interesting because
 * **what a person types is not what the database stores**. The form posts a
 * decimal string in whichever digits their keyboard produces; the column holds
 * an integer count of agorot. `parseAmount` is the one place that conversion
 * happens (see `money.ts`), so this schema calls it rather than writing a
 * second, subtly different number parser next to the first.
 */

/**
 * How the money arrived.
 *
 * A Zod enum over a `text` column rather than a `pgEnum`, matching
 * `clients.goal` and `users.role`: this is exactly the list a clinic will want
 * to extend — a cheque, a particular wallet — and extending it here is a
 * deployment, not a migration.
 */
export const PAYMENT_METHODS = ['cash', 'transfer', 'card', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const paymentMethodSchema = z.enum(PAYMENT_METHODS);

/** `YYYY-MM-DD`, and a real day — `2026-02-31` is rejected, not shifted. */
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'invalidDate')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'invalidDate');

/**
 * A payment being recorded against a subscriber.
 *
 * `amount` arrives as the string the field held and leaves as `amountMinor`,
 * already an integer. A caller therefore cannot forget to convert it, and
 * cannot convert it twice.
 *
 * **Zero is rejected; a negative amount is not.** A payment of nothing is a
 * mis-keyed row rather than a fact worth storing — the same rule the
 * `client_payments_amount_non_zero` check enforces in the database — while a
 * negative one is how a refund is recorded, so the two disagreeing here would
 * make refunds unenterable through the only form that writes payments.
 */
export const recordPaymentSchema = z.object({
  /* `z.uuid()`, matching `clientIdSchema` in the clients feature — the v3
     `z.string().uuid()` spelling is deprecated in Zod 4. */
  clientId: z.uuid('invalidClient'),

  amountMinor: z
    .string()
    .trim()
    .min(1, 'amountRequired')
    .transform((value, ctx) => {
      const minor = parseAmount(value);

      if (minor === null) {
        ctx.addIssue({ code: 'custom', message: 'invalidAmount' });
        return z.NEVER;
      }

      if (minor === 0) {
        ctx.addIssue({ code: 'custom', message: 'amountZero' });
        return z.NEVER;
      }

      if (Math.abs(minor) > MAX_AMOUNT_MINOR) {
        ctx.addIssue({ code: 'custom', message: 'amountTooLarge' });
        return z.NEVER;
      }

      return minor;
    }),

  method: paymentMethodSchema,
  paidOn: isoDateSchema,

  /*
    Trimmed, and an empty note becomes `null` rather than `''`. The column is
    nullable and "no note" is one state, not two — a row holding an empty string
    reads as a note somebody deleted the text out of.
  */
  note: z
    .string()
    .trim()
    .max(500, 'noteTooLong')
    .optional()
    .transform((value) => (value ? value : null)),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

/**
 * A charge being added to a subscriber's account.
 *
 * The mirror of {@link recordPaymentSchema}, and it differs in exactly two
 * places, both of which follow the database's own checks:
 *
 *  - **A negative amount is refused.** Money owed cannot be negative; the thing
 *    someone reaching for a minus sign here actually wants is a payment, which
 *    is where refunds live. `client_charges_amount_non_negative` says the same
 *    in SQL, and a schema that let one through would turn a data-entry slip
 *    into a 500 instead of a message.
 *  - **Zero is allowed.** A waived visit is worth recording — it says the
 *    appointment happened and was not billed, which is different from it never
 *    having been entered.
 *
 * `description` is required for the reason the column is `not null`: a line on
 * a bill that says nothing is a line nobody can defend when it is questioned.
 */
export const recordChargeSchema = z.object({
  clientId: z.uuid('invalidClient'),

  /**
   * Which service, for the rules that need to know — the free first
   * consultation, and any counting done later. Optional, because the column is
   * nullable and a charge that is not one of the listed services is a real
   * charge: what a subscriber is billed for is `description`, and always was.
   */
  service: z
    .string()
    .optional()
    .transform((value) => (value && isBillingService(value) ? value : null)),

  description: z
    .string()
    .trim()
    .min(1, 'descriptionRequired')
    .max(200, 'descriptionTooLong'),

  amountMinor: z
    .string()
    .trim()
    .min(1, 'amountRequired')
    .transform((value, ctx) => {
      const minor = parseAmount(value);

      if (minor === null) {
        ctx.addIssue({ code: 'custom', message: 'invalidAmount' });
        return z.NEVER;
      }

      if (minor < 0) {
        ctx.addIssue({ code: 'custom', message: 'amountNegative' });
        return z.NEVER;
      }

      if (minor > MAX_AMOUNT_MINOR) {
        ctx.addIssue({ code: 'custom', message: 'amountTooLarge' });
        return z.NEVER;
      }

      return minor;
    }),

  chargedOn: isoDateSchema,

  note: z
    .string()
    .trim()
    .max(500, 'noteTooLong')
    .optional()
    .transform((value) => (value ? value : null)),
});

export type RecordChargeInput = z.infer<typeof recordChargeSchema>;

/**
 * A price being set for one of the clinic's services.
 *
 * The same amount parsing every other figure in this feature goes through, with
 * the charge's bounds: no negative — a price below zero is a credit, and a
 * credit is a payment — and zero allowed, because a service a clinic gives away
 * is a decision worth recording rather than a blank.
 *
 * `service` is checked against the code's own list rather than accepted as any
 * string. The column is deliberately `text` so a new service needs no
 * migration, and this is the gate that keeps that from meaning a price can be
 * filed under a key nothing will ever read back.
 */
export const servicePriceSchema = z.object({
  service: z.string().refine(isBillingService, 'invalidService'),

  amountMinor: z
    .string()
    .trim()
    .min(1, 'amountRequired')
    .transform((value, ctx) => {
      const minor = parseAmount(value);

      if (minor === null) {
        ctx.addIssue({ code: 'custom', message: 'invalidAmount' });
        return z.NEVER;
      }

      if (minor < 0) {
        ctx.addIssue({ code: 'custom', message: 'amountNegative' });
        return z.NEVER;
      }

      if (minor > MAX_AMOUNT_MINOR) {
        ctx.addIssue({ code: 'custom', message: 'amountTooLarge' });
        return z.NEVER;
      }

      return minor;
    }),
});

export type ServicePriceInput = z.infer<typeof servicePriceSchema>;
