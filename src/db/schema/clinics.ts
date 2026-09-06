import { check, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * A clinic — the tenant boundary.
 *
 * Every staff sign-up creates one, and every client belongs to exactly one. All
 * reads and writes in `src/features/clients/` are scoped by `clinic_id`, so two
 * dietitians who sign up independently never see each other's clients.
 *
 * A clinic is its own table rather than the owning user's id so that adding a
 * second practitioner to an existing clinic later is a UI change, not a
 * migration that has to rewrite every foreign key.
 */
export const clinics = pgTable(
  'clinics',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** Seeded from the first staff member's name; there is no rename UI yet. */
    name: text('name').notNull(),

    /**
     * How a client reaches the clinic, and where it is. Nullable until the
     * required onboarding flow is completed — a clinic is created by a staff
     * sign-up that asks for neither, so null is the state every existing row
     * starts in, not an anomaly.
     *
     * Both are also shown to the client on their profile screen: the phone
     * backs a real `tel:` and WhatsApp link there, so an unset one means that
     * screen offers no way to call rather than offering a dead button.
     *
     * `address` is free text rather than a structured address: this is a line
     * a person reads on a phone and types into a map, not something the app
     * geocodes.
     */
    phone: text('phone'),
    contactEmail: text('contact_email'),
    address: text('address'),
    onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),

    /**
     * The clinic's mark, shown wherever the clinic identifies itself to a
     * client — the portal header, and eventually a printed plan.
     *
     * **It holds a `data:` URI, not a link to a bucket.** This stack has no
     * object storage: `DATABASE_URL` is the only backing service, so a column
     * is the one place an image can live without introducing a second one. The
     * upload control resizes to 256×256 and re-encodes to WebP before it ever
     * reaches a server action, which caps a row at roughly 40 KB — small enough
     * that Postgres storing it inline is unremarkable, and `LOGO_MAX_BYTES` in
     * `validation.ts` rejects anything that slips past the client.
     *
     * The name is `logo_url` rather than `logo_data` deliberately: the day this
     * moves to a bucket, the column holds an ordinary URL and every read stays
     * exactly as written. Only the writer changes.
     *
     * ⚠ It is deliberately **not** selected by `getClinicProfile`'s sibling
     * queries — see `queries.ts`. A 40 KB string on a row joined into every
     * client list would be paid for on screens that never draw it.
     */
    logoUrl: text('logo_url'),

    /**
     * When the clinic is open. The booking validator reads these three columns
     * and nothing else, so opening hours are per-clinic data — not a constant
     * someone has to redeploy to change.
     *
     * Weekday numbers match `Date.prototype.getDay()`: 0 = Sunday … 6 = Saturday.
     * The default is Sunday–Thursday, the working week in Asia/Hebron, which is
     * also the clinic time zone in `src/lib/format.ts`.
     */
    workingDays: integer('working_days').array().notNull().default([0, 1, 2, 3, 4]),

    /** Minutes from local midnight. 08:00 and 18:00 by default. */
    openMinute: integer('open_minute').notNull().default(8 * 60),
    closeMinute: integer('close_minute').notNull().default(18 * 60),

    /**
     * When the platform turned this clinic off, or null while it is running.
     *
     * **A timestamp rather than a boolean**, for the same reason
     * `onboarding_completed_at` is one: "is it suspended" and "since when" are
     * the same question asked twice, and a boolean can only answer the first.
     *
     * Read by `requireStaffSession`, which is what makes it bite: without that
     * check the switch on the platform screen would change a column and nothing
     * else, and a suspended clinic would carry on working. Staff are turned away
     * at the guard; the clinic's CLIENTS are deliberately not — see the note on
     * that function. Set only from the platform area, never by a clinic itself.
     */
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),

    /**
     * Which subscription the practice is on — `trial`, `starter`, `pro`,
     * `clinic`. The list itself lives in `src/features/admin/plans.ts`.
     *
     * `text` validated in the feature rather than a `pgEnum`, following
     * `client_payments.method` and `clients.goal`: a price list is exactly the
     * thing that grows, and adding a tier should not be a migration.
     *
     * Not nullable, and defaulted: every clinic is on some plan from the moment
     * it exists, and `null` here would be a fourth state meaning "we do not
     * know what they pay", which is never a fact worth storing about a customer.
     */
    plan: text('plan').notNull().default('trial'),

    /**
     * When the current plan started. Null on a clinic that has never been moved
     * off the default, which is the same thing as "since it signed up".
     */
    planStartedAt: timestamp('plan_started_at', { withTimezone: true }),

    /**
     * When the trial runs out. Null on a paid plan, and on a trial with no
     * deadline set yet.
     *
     * Nothing enforces this — an expired trial does not lock anyone out. It is
     * a figure the platform screen sorts by so the person who runs the
     * deployment can go and have the conversation. Making it bite is a product
     * decision with a refund policy attached, not a column.
     */
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),

    /**
     * What this clinic actually pays each month, in minor units — agorot, like
     * every amount in `billing.ts`, and for the reasons its header gives.
     *
     * Null means "whatever the tier lists", which is the ordinary case. A value
     * here is a negotiated price, and it is stored on the clinic rather than
     * derived from the tier for the same reason a charge stores its own amount:
     * raising the list price of `pro` next year must not silently rewrite what
     * a clinic on a fixed deal is recorded as paying.
     */
    planPriceMinor: integer('plan_price_minor'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // A clinic that closes before it opens would make every booking invalid and
    // the grid zero pixels tall. Cheaper to forbid than to defend against.
    check(
      'clinics_hours_ordered',
      sql`${table.openMinute} >= 0 AND ${table.closeMinute} <= 1440 AND ${table.openMinute} < ${table.closeMinute}`,
    ),
    /* A negotiated price of zero is a real arrangement — a pilot, a favour.
       A negative one is a typo that would subtract from platform revenue. */
    check('clinics_plan_price_non_negative', sql`${table.planPriceMinor} >= 0`),
  ],
);

export type Clinic = typeof clinics.$inferSelect;
