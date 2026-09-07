import { z } from 'zod';

import { addDays } from '@/features/booking/date';

import { MAX_AMOUNT_MINOR, parseAmount } from './money';
import { MAX_TERM_MONTHS, SERVICE_KINDS } from './services';

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
export const isoDateSchema = z
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
   * Which service, for the rules that need to know — the free first one, the
   * term a subscription runs for, and any counting done later. Optional, because
   * the column is nullable and a charge that names no service is a real charge:
   * what a subscriber is billed for is `description`, and always was.
   *
   * **Shape only.** It used to be checked against the code's own list, which
   * stopped existing the day the list became the clinic's — see
   * `clinic_services`. Whether this key is one of *this clinic's* services is a
   * question only a caller holding the clinic id can ask, so `recordChargeAction`
   * asks it against the rows it has already loaded, and an unknown key is
   * refused there rather than stored.
   */
  service: z
    .string()
    .trim()
    .max(60, 'invalidService')
    .optional()
    .transform((value) => (value ? value : null)),

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
 * A price, as a form posts one: a decimal string, or nothing at all.
 *
 * Shared by every service field that takes money, and `null` is a real answer
 * rather than a parse failure — an empty box means the clinic has not decided
 * what to charge, which is not the same as charging nothing. Zero stays a price,
 * for a service a clinic gives away.
 */
const priceSchema = z
  .string()
  .trim()
  .optional()
  .transform((value, ctx) => {
    if (!value) return null;

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
  });

/** A settings switch, as its hidden input posts it. See the note at its use. */
const switchSchema = z
  .string()
  .optional()
  .transform((value) => value === 'on' || value === 'true');

/**
 * A service the clinic is adding or editing.
 *
 * **A name in one language is enough.** The clinic works in Arabic; asking for
 * an English name before a service can exist would be asking a dietitian to
 * translate her own price list to use the app. `createService` copies whichever
 * one was given into the empty side, so a bill always has words on it.
 *
 * The term is required on a subscription and refused on a visit, which is the
 * database's own check (`clinic_services_term_matches_kind`) said in the place
 * that can produce a message about it. A visit posting a term is not corrected
 * silently — a form that sends one is a form whose "kind" and "months" disagree,
 * and quietly picking one of them is how a two-month visit becomes a two-month
 * subscription.
 */
export const serviceSchema = z
  .object({
    nameAr: z.string().trim().max(80, 'nameTooLong'),
    nameEn: z.string().trim().max(80, 'nameTooLong'),
    kind: z.enum(SERVICE_KINDS),
    durationMonths: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value ? Number(value) : null)),
    priceMinor: priceSchema,
    /*
      A switch posts the string its hidden input carries — `on` or `off`, the
      pattern the clinic's working-week table already uses. Absent means off,
      which is what an unchecked native checkbox would have sent.
    */
    firstFree: switchSchema,
    active: switchSchema,
  })
  .superRefine((input, ctx) => {
    if (!input.nameAr && !input.nameEn) {
      ctx.addIssue({ code: 'custom', path: ['nameAr'], message: 'nameRequired' });
    }

    if (input.kind !== 'subscription') return;

    const months = input.durationMonths;

    if (months === null || !Number.isInteger(months) || months < 1 || months > MAX_TERM_MONTHS) {
      ctx.addIssue({ code: 'custom', path: ['durationMonths'], message: 'invalidTerm' });
    }
  });

export type ServiceInput = z.infer<typeof serviceSchema>;

/**
 * A subscription being paused.
 *
 * `days` rather than an end date, because "تجميد ٩ أيام" is what the clinic
 * agrees with the subscriber and an end date is the arithmetic on it — done here
 * once, rather than by a dietitian counting on a calendar. Nine days from the
 * 10th ends on the 18th: the first day is one of the nine, so the last is
 * `start + days − 1`.
 *
 * Leaving `days` empty opens the freeze instead. That is not a missing value —
 * it is the honest one for the common case where nobody yet knows how long
 * somebody will be away, and it is closed with the Resume button when they come
 * back.
 */
export const freezeSubscriptionSchema = z
  .object({
    clientId: z.uuid('invalidClient'),
    startsOn: isoDateSchema,
    days: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value ? Number(value) : null)),
    reason: z
      .string()
      .trim()
      .max(200, 'reasonTooLong')
      .optional()
      .transform((value) => (value ? value : null)),
  })
  .superRefine((input, ctx) => {
    const days = input.days;

    if (days === null) return;

    if (!Number.isInteger(days) || days < 1 || days > MAX_FREEZE_DAYS) {
      ctx.addIssue({ code: 'custom', path: ['days'], message: 'invalidFreezeDays' });
    }
  })
  .transform((input) => ({
    clientId: input.clientId,
    startsOn: input.startsOn,
    /* The last day covered, inclusive — see the note above. Null keeps it open. */
    endsOn: input.days === null ? null : addDays(input.startsOn, input.days - 1),
    reason: input.reason,
  }));

export type FreezeSubscriptionInput = z.infer<typeof freezeSubscriptionSchema>;

/**
 * The longest single pause a form will take, in days.
 *
 * A year. Past that the subscriber has stopped rather than paused, and the term
 * they are holding is worth selling again rather than extending into 2028.
 */
export const MAX_FREEZE_DAYS = 365;
