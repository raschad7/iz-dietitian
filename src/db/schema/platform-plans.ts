import { check, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * What the platform sells: the packages, their prices, and what each is sold
 * with.
 *
 * ## This used to be a constant, deliberately, and the reason expired
 *
 * `src/features/admin/plans.ts` held these four tiers as a frozen array, and
 * argued the case at length: what a *clinic* charges its patients is the
 * clinic's to change, and what the *platform* charges its clinics is decided by
 * whoever runs the deployment — who is also the person who ships a release. So
 * adding a tier was a line of code plus two strings in the message catalogue,
 * and never a migration.
 *
 * That held while those two people were the same person. They are not: the
 * operator of this deployment does not ship releases, and "raise the Pro price"
 * or "add a package for a two-clinic group" turned into a support request with
 * a deploy attached. A price list nobody can change is not a price list, it is
 * a build artefact.
 *
 * **What does not change is `clinics.plan`.** It still stores {@link key} as
 * text and still survives a key it does not recognise, for the reason it always
 * did — a platform screen that 500s because one clinic holds a stale string is
 * worse than one that shows it and lets the operator fix it. The tiers moved;
 * the tolerance stayed.
 *
 * ## Rows are archived, never deleted
 *
 * A clinic can be sitting on a package when the operator retires it, and the
 * two honest answers to that are "you cannot retire this" and "the package
 * stops being sellable and keeps existing". The second is the one that does not
 * strand a customer, so {@link archivedAt} is the retirement and there is no
 * delete path. An archived package still prices the clinics on it, still shows
 * on the revenue screen, and no longer appears in the picker.
 *
 * ## Nothing here is enforced
 *
 * {@link seats} and {@link aiPlansPerMonth} are what a package is *sold* with,
 * not a gate. A clinic over its seat count keeps working and shows on the
 * platform screen as over its limit. Enforcement is a product decision with a
 * refund policy and a dunning email attached, and inventing it inside an admin
 * panel would mean a practice losing access to its patients' records because a
 * number in this table was typed wrong.
 */
export const platformPlans = pgTable(
  'platform_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * The stable identifier, and the value `clinics.plan` holds.
     *
     * Written once, at creation, and never editable afterwards — every clinic
     * on the package references it by this string, and there is no foreign key
     * to cascade a rename through. The display name is what the operator
     * changes when they want it called something else; that is exactly why the
     * name lives in its own two columns rather than being derived from here.
     */
    key: text('key').notNull(),

    /**
     * What it is called, in each language the app serves.
     *
     * Two columns rather than a message key, because a package invented at
     * runtime cannot have a translation shipped for it — the old tiers read
     * their names out of `admin.plans.tier.*`, which only works for a list that
     * is fixed at build time. See the note at the top of this file.
     */
    nameEn: text('name_en').notNull(),
    nameAr: text('name_ar').notNull(),

    /** List price per month in minor units — agorot, like every amount in the app. */
    monthlyPriceMinor: integer('monthly_price_minor').notNull().default(0),

    /** Staff accounts the package is sold with. Null means uncounted. */
    seats: integer('seats'),

    /** AI plan generations a calendar month the package is sold with. Null means uncounted. */
    aiPlansPerMonth: integer('ai_plans_per_month'),

    /**
     * How many days a clinic starting on this package gets before its trial
     * runs out. Null on a package that is not a trial.
     *
     * **This is what finally makes the trial column mean something.** Sign-up
     * created a clinic with `plan` defaulted to `trial` and `trial_ends_at`
     * left null, so no clinic that ever signed up had a deadline: the platform
     * screen's whole trial pipeline was reporting on a column only a human had
     * ever written to. The value here is what sign-up now counts forward from.
     */
    trialDays: integer('trial_days'),

    /** Ordered cheapest first, for the picker and for the ramp the charts colour by. */
    rank: integer('rank').notNull().default(0),

    /** Retired: still prices the clinics on it, no longer offered. See the note above. */
    archivedAt: timestamp('archived_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('platform_plans_key_idx').on(table.key),

    /*
      Money is never negative here. A discount is a lower price on the clinic
      (`clinics.plan_price_minor`), not a negative list price, and letting one
      through would put a package into the MRR total as a subtraction.
    */
    check('platform_plans_price', sql`${table.monthlyPriceMinor} >= 0`),

    // Null is "uncounted". Zero seats or zero AI plans is a package nobody can
    // use, which is a typo rather than an offer.
    check('platform_plans_seats', sql`${table.seats} is null or ${table.seats} > 0`),
    check('platform_plans_ai', sql`${table.aiPlansPerMonth} is null or ${table.aiPlansPerMonth} >= 0`),
    check('platform_plans_trial_days', sql`${table.trialDays} is null or ${table.trialDays} > 0`),
  ],
);

export type PlatformPlanRow = typeof platformPlans.$inferSelect;
export type NewPlatformPlanRow = typeof platformPlans.$inferInsert;
