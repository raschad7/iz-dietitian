import { check, date, index, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { user } from './auth';
import { clients } from './clients';
import { clinics } from './clinics';

/**
 * Money tracking: what a subscriber was billed, and what they paid.
 *
 * **This is a ledger, not a payment gateway.** No card is ever taken here and
 * no bank is ever contacted — the clinic collects cash or a transfer in the
 * room and types the number in afterwards. Every row in both tables is
 * something a person entered about something that already happened, which is
 * why each carries `recorded_by` and a plain `*_on` date rather than an
 * authorisation reference and a settlement timestamp.
 *
 * A subscriber's totals are **not stored**. Total billed, total paid and the
 * balance between them are summed on read in `src/features/billing/queries.ts`.
 * A stored total is a second source of truth for a number these two tables
 * already answer, and the only way it can ever be wrong is silently.
 *
 * ## Amounts are integer minor units
 *
 * Every amount column is an `integer` count of the smallest unit — agorot, so
 * `27000` is ₪ 270.00 — and never a `numeric` or a float. Reading a shekel
 * figure as a JavaScript number is how a ledger acquires a third of an agora,
 * and `numeric` comes back from postgres.js as a string every call site would
 * then have to remember to parse. Integers add, subtract and compare exactly,
 * in the database and in JavaScript alike. See `src/features/billing/money.ts`.
 *
 * The currency is the clinic's, and there is exactly one — `DEFAULT_CURRENCY`
 * in `src/lib/format.ts`. No column records it: a per-clinic currency is a
 * migration away, and inventing the column before a second currency exists
 * would mean every read carrying a value it can only ever find one answer for.
 */

/**
 * One thing a subscriber was billed for.
 *
 * `description` is captured on the row rather than joined from a price list.
 * A charge is a historical fact, and renaming "Follow-up visit" or raising its
 * price next year must not rewrite what a subscriber was told they owed last
 * March.
 */
export const clientCharges = pgTable(
  'client_charges',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** The tenant boundary. Every read in the billing feature filters on this. */
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),

    /**
     * `cascade`: a deleted client takes their ledger with them. Clients are
     * archived rather than deleted in normal use — see `clients.status` — so
     * this only fires when a record is genuinely erased.
     */
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),

    /**
     * What the subscriber is being billed for, in the language it was typed in.
     *
     * Not nullable: a line on a bill that says nothing is a line nobody can
     * defend when it is questioned.
     */
    description: text('description').notNull(),

    /**
     * Which service this charge was for — `monthly`, `quarterly`,
     * `consultation` — or `null` for a charge recorded before the card offered
     * a list, and for anything that is not one of them.
     *
     * **The description above is still what the bill says.** This is not a
     * foreign key and not a label: it answers "has this subscriber had a
     * consultation before", which the free-first rule needs and no amount of
     * reading `description` can give. That column holds words in whichever
     * language the row was entered in, and is deliberately frozen at the moment
     * of entry.
     *
     * `text` validated in the feature rather than a `pgEnum`, following
     * `client_payments.method`: the list of services grows, and growing it
     * should not be a migration.
     */
    service: text('service'),

    /** Minor units. Money owed, so never negative. See the file header. */
    amountMinor: integer('amount_minor').notNull(),

    /**
     * The day the service was given, not the day someone got around to typing
     * it in. A `date` and not a timestamp: a visit happened on a day, and an
     * instant would let a late-evening entry land on the wrong one after a
     * time-zone conversion.
     */
    chargedOn: date('charged_on', { mode: 'string' }).notNull(),

    note: text('note'),

    /** Who entered it. `set null` keeps the charge when a staff account goes. */
    recordedBy: text('recorded_by').references(() => user.id, { onDelete: 'set null' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /*
      The bills screen sums one clinic's charges grouped by client, and that is
      the only shape this table is ever read in. Clinic first, because it is the
      filter every read shares.
    */
    index('client_charges_clinic_id_client_id_idx').on(table.clinicId, table.clientId),
    /*
      A charge is money owed. Zero is allowed — a waived visit worth recording —
      but negative is not: that is a refund, and it belongs in `client_payments`
      where it can be seen for what it is.
    */
    check('client_charges_amount_non_negative', sql`${table.amountMinor} >= 0`),
  ],
);

/**
 * Money received from a subscriber.
 *
 * `amount_minor` may be **negative**, and this is the one place in the feature
 * where a negative number is meaningful: a refund is money moving the other
 * way, and recording it as a negative payment keeps the balance arithmetic a
 * single subtraction instead of a third table and a sign convention nobody
 * remembers. A refund then shows up in the ledger as what it is.
 */
export const clientPayments = pgTable(
  'client_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),

    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),

    /** Minor units. Negative for a refund — see the doc comment above. */
    amountMinor: integer('amount_minor').notNull(),

    /**
     * cash | transfer | card | other.
     *
     * `text` validated by Zod rather than a `pgEnum`, following `clients.goal`
     * and `users.role`: this is exactly the column a clinic will want to extend
     * — a cheque, a specific wallet — and a Zod change is not a migration.
     *
     * "card" means a card machine the clinic already owns and reconciles
     * itself. It does not make this app a payment processor.
     */
    method: text('method').notNull().default('cash'),

    /** The day the money changed hands. A `date`, for the reason a charge is. */
    paidOn: date('paid_on', { mode: 'string' }).notNull(),

    note: text('note'),

    recordedBy: text('recorded_by').references(() => user.id, { onDelete: 'set null' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('client_payments_clinic_id_client_id_idx').on(table.clinicId, table.clientId),
    /*
      No sign check: a refund is a negative payment. Zero is rejected instead —
      a payment of nothing is a mis-keyed row, never a fact worth storing.
    */
    check('client_payments_amount_non_zero', sql`${table.amountMinor} <> 0`),
  ],
);

export type ClientCharge = typeof clientCharges.$inferSelect;
export type NewClientCharge = typeof clientCharges.$inferInsert;
export type ClientPayment = typeof clientPayments.$inferSelect;
export type NewClientPayment = typeof clientPayments.$inferInsert;

/**
 * What a clinic charges for each of the services it offers.
 *
 * ## Why this is not a column on `clinics`
 *
 * Three prices could have been three columns, and the fourth service would then
 * be a migration — for a list that already lives in code and is meant to be
 * edited there. Keyed rows make adding a service the pair of strings and the
 * line in `BILLING_SERVICES` it already needs, and nothing else.
 *
 * ## Why a charge does not point at one of these
 *
 * A charge stores its own `description` and its own amount, copied from here at
 * the moment it is recorded. That is the same reasoning as `client_charges`'
 * own comment: raising the price of a follow-up next year must not rewrite what
 * a subscriber was told they owed last March. This table is the *current* price
 * list — what to fill a new charge in with — and never a foreign key the ledger
 * reads back through.
 *
 * A service with no row here has no price set yet. That is a real state, not a
 * zero: a clinic that has not decided is not a clinic that charges nothing, and
 * the settings screen says so in as many words.
 */
export const clinicServicePrices = pgTable(
  'clinic_service_prices',
  {
    /** The tenant boundary, and half the key: one price list per clinic. */
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),

    /**
     * Which service — `monthly`, `quarterly`, `consultation`.
     *
     * `text` validated in the feature rather than a `pgEnum`, following
     * `client_payments.method`: the list of services a clinic offers is exactly
     * the thing that grows, and growing it should not be a migration.
     */
    service: text('service').notNull(),

    /** Minor units, like every amount in this file. Zero is a free service. */
    amountMinor: integer('amount_minor').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.clinicId, table.service] }),
    /* A price is what is asked for, and nothing is asked for below zero — a
       credit is a payment, on the other table. */
    check('clinic_service_prices_amount_non_negative', sql`${table.amountMinor} >= 0`),
  ],
);

export type ClinicServicePrice = typeof clinicServicePrices.$inferSelect;
export type NewClinicServicePrice = typeof clinicServicePrices.$inferInsert;
