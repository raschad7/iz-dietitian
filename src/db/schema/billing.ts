import { boolean, check, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
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
 * The services a clinic sells — its own list, its own names, its own prices.
 *
 * ## Why this is a table and not a constant any more
 *
 * It was `BILLING_SERVICES` in code: three entries, a pair of translated
 * strings each, and a `clinic_service_prices` row per clinic to price them.
 * That held for exactly as long as every clinic sold the same three things.
 * The first practice to ask for a two-month subscription made the cost visible
 * — a line in a shared file, two strings in two message catalogues, and a
 * deploy, so that **one** clinic could sell a term it had already started
 * selling. A clinic that wants a year, a ten-session package or a second kind
 * of follow-up should not be waiting on a release.
 *
 * So a service is a row, and the code keeps only the list a *new* clinic starts
 * with — `DEFAULT_SERVICES` in `src/features/billing/services.ts`, seeded on
 * sign-up and editable from Settings the moment it exists.
 *
 * ## What a charge stores
 *
 * `client_charges.service` holds this row's **`key`**, not its id, and the
 * charge still copies its own `description` and `amount_minor` at the moment it
 * is recorded. Three consequences, all of them wanted:
 *
 *  - Renaming "استشارة" or raising its price cannot rewrite what a subscriber
 *    was told they owed last March.
 *  - Deleting a service cannot orphan a ledger row, so there is no foreign key
 *    here and deliberately none: the key on an old charge is a historical fact
 *    about what was sold, and it stays readable after the service is retired.
 *  - Every row written before this table existed — `monthly`, `quarterly`,
 *    `consultation` — is still valid, because those are exactly the keys the
 *    migration gave every clinic's seeded services.
 *
 * A retired service is `active = false` rather than deleted, for the same
 * reason: the ledger keeps referring to it.
 *
 * ## Why the term is months
 *
 * `duration_months` is null for a visit and a whole number of months for a
 * subscription, because that is the unit a term is *sold* in — a month, two
 * months, a quarter, a year — and it is what `addMonths` needs to say when the
 * term runs out. A freeze is counted in days on top of it (see
 * `client_subscription_freezes`), which is the unit a pause is actually
 * measured in; the two do not need to be the same unit and never were.
 */
export const clinicServices = pgTable(
  'clinic_services',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** The tenant boundary: one list per clinic, and no shared rows. */
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),

    /**
     * The stable handle a charge records — `monthly`, `consultation`, or a slug
     * generated from the name a clinic typed.
     *
     * Never shown and never edited. A clinic renaming its "شهري" to "الاشتراك
     * الشهري" must not detach every charge that names it, which is what would
     * happen if the ledger keyed on the words.
     */
    key: text('key').notNull(),

    nameAr: text('name_ar').notNull(),
    nameEn: text('name_en').notNull(),

    /**
     * `subscription` — a term with a start and an end — or `visit`, a single
     * appointment that covers no days at all.
     *
     * The distinction is not cosmetic: it decides whether the "one subscription
     * at a time" rule applies, whether the row can be frozen, and whether the
     * Bills column has a countdown to draw.
     */
    kind: text('kind').notNull(),

    /** Whole months. Null on a visit, and required on a subscription. */
    durationMonths: integer('duration_months'),

    /**
     * Minor units — agorot, like every amount in this file. Null means the
     * clinic has not set a price yet, which is not the same as free: zero is a
     * price, and the two are shown differently.
     */
    priceMinor: integer('price_minor'),

    /**
     * Whether a subscriber's **first** one of these is free.
     *
     * The consultation's rule, made a property of the service rather than a
     * constant naming one key. It was `CONSULTATION` in three places; a clinic
     * offering a free first assessment under another name had no way to say so,
     * and a clinic that charges for its first consultation had no way to stop.
     */
    firstFree: boolean('first_free').notNull().default(false),

    /** A retired service: off the card, still readable on old charges. */
    active: boolean('active').notNull().default(true),

    /** Where it sits on the card and in Settings. Ties break on `key`. */
    sortOrder: integer('sort_order').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /* One key per clinic — this is what `client_charges.service` resolves against. */
    uniqueIndex('clinic_services_clinic_id_key_idx').on(table.clinicId, table.key),
    /* A price is what is asked for, and nothing is asked for below zero. */
    check('clinic_services_price_non_negative', sql`${table.priceMinor} >= 0`),
    /*
      A subscription has a term and a visit has none. Both halves are stated,
      because a visit carrying "3 months" would silently become a term in every
      piece of arithmetic that reads this column.
    */
    check(
      'clinic_services_term_matches_kind',
      sql`(${table.kind} = 'subscription' AND ${table.durationMonths} >= 1) OR (${table.kind} = 'visit' AND ${table.durationMonths} IS NULL)`,
    ),
  ],
);

/**
 * Days a subscription was paused — the clinic's freeze.
 *
 * A subscriber travels, is ill, or is told to stop for a fortnight, and the
 * practice does not count those days against the term they paid for. The clinic
 * was doing this on paper: the register was quietly wrong for the whole of every
 * freeze, and a renewal date had to be worked out by hand.
 *
 * **The term end is still derived, never stored.** A charge says what was sold
 * and when; these rows say which days did not count; `subscriptionEnd` adds them
 * up. A stored `ends_on` would be a second copy of that answer, and a freeze
 * corrected after the fact would leave the two disagreeing — the same argument
 * the file header makes for storing no totals.
 *
 * **An open freeze is a real state.** `ends_on` is null while a subscriber is
 * still paused, because "frozen until they come back" is what the clinic
 * actually knows on the day it starts. Arithmetic treats an open freeze as
 * running to today, so the term end moves out by one day for every day it stays
 * open — which is what a pause means — and settles the moment it is resumed.
 *
 * No `charge_id`. A freeze is a range of days, not a property of a row: it lands
 * on whichever term covers it, it survives a back-dated correction to the
 * charge, and a freeze recorded between two terms is simply days on which
 * nothing was running — which costs the subscriber nothing and needs no special
 * case.
 */
export const clientSubscriptionFreezes = pgTable(
  'client_subscription_freezes',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),

    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),

    /** First day not counted, inclusive. A `date`, as every day in this file is. */
    startsOn: date('starts_on', { mode: 'string' }).notNull(),

    /** Last day not counted, inclusive. Null while the freeze is still running. */
    endsOn: date('ends_on', { mode: 'string' }),

    /** Why — "سفر", "مرض". Free text, shown back on the row. */
    reason: text('reason'),

    recordedBy: text('recorded_by').references(() => user.id, { onDelete: 'set null' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('client_subscription_freezes_clinic_id_client_id_idx').on(table.clinicId, table.clientId),
    /* A freeze that ends before it starts is a typo, and it would shorten a term. */
    check(
      'client_subscription_freezes_range_ordered',
      sql`${table.endsOn} IS NULL OR ${table.endsOn} >= ${table.startsOn}`,
    ),
  ],
);

export type ClinicService = typeof clinicServices.$inferSelect;
export type NewClinicService = typeof clinicServices.$inferInsert;
export type ClientSubscriptionFreeze = typeof clientSubscriptionFreezes.$inferSelect;
export type NewClientSubscriptionFreeze = typeof clientSubscriptionFreezes.$inferInsert;
