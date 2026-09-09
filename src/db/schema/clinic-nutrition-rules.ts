import { sql } from 'drizzle-orm';
import { check, jsonb, pgTable, real, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { clinics } from './clinics';

/**
 * The clinic's own answers to two questions the app used to answer for it: how
 * much protein a client should be dosed, and whose BMR the calorie target is
 * built on.
 *
 * ## Why these are settings and not constants
 *
 * Both were hard-coded, and both were wrong for the clinic using them. The
 * protein rate sat at 1.6 g/kg — an upper-band figure from sports practice —
 * against a dietitian who doses at roughly 1 g/kg, so every target the app
 * suggested was high enough that she overrode it by hand. A number a
 * practitioner corrects on every record is not a default, it is a setting that
 * has not been written yet.
 *
 * The rate is only half of it. **A gram-per-kilo rate is meaningless without
 * saying which kilos**, and the three answers differ by fifty percent for the
 * same client: 78 kg on the scale, 58.8 kg adjusted, 54.6 kg of lean mass. Two
 * dietitians both saying "one gram per kilo" can mean 78 g and 55 g. So the
 * basis is stored beside the rate, never assumed.
 *
 * ## One row per clinic, and reads do not need it
 *
 * `readNutritionRules` returns {@link DEFAULT_NUTRITION_RULES} when there is no
 * row, so nothing has to create one lazily and no join can drop a client out of
 * a query. A row appears the first time the settings dialog saves.
 *
 * A table rather than more columns on `clinics`, following the argument
 * `client_nutrition_profiles` makes one level down: these are fields only plan
 * generation reads, and the clinics module has no business owning them.
 */
export const clinicNutritionRules = pgTable(
  'clinic_nutrition_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),

    /**
     * Grams of protein per kilogram of whichever weight `protein_basis` names.
     *
     * Defaults to the 1.6 that was hard-coded, so installing this migration
     * changes nobody's target. The clinic moves it the first time it opens the
     * dialog.
     */
    proteinPerKg: real('protein_per_kg').notNull().default(0.8),

    /**
     * Which weight the rate above multiplies — `actual`, `adjusted` or `lean`.
     *
     * `adjusted` is the default because it is what the app already did, and it
     * is the one most clinical references are written against: ideal body
     * weight plus a quarter of the excess, so a client carrying thirty kilos of
     * fat is not charged protein for tissue that does not use any.
     *
     * `lean` is the accurate one and needs a body composition report — it doses
     * against the fat-free mass the analyser actually measured, rather than an
     * estimate of it from height. It falls back to `adjusted` for a client with
     * no report, which is the whole reason the fallback exists rather than a
     * blank target.
     */
    proteinBasis: text('protein_basis').notNull().default('actual'),

    /**
     * Whose basal metabolic rate the calorie suggestion is built on — `device`
     * or `formula`.
     *
     * **`device` is the default, and that is a change of behaviour.** The app
     * used to build every target on Mifflin-St Jeor and merely *show* the
     * analyser's figure beside it; the clinic asked for the printed number to
     * be the one in use. It is still a choice rather than a rewrite, because
     * the two genuinely disagree — 1,321 against 1,446 on a real report — and
     * an analyser's BMR is its own proprietary equation run over an estimated
     * fat-free mass, not a measurement of metabolism. `formula` puts
     * Mifflin-St Jeor back.
     *
     * Either way the value only decides the *suggestion*.
     * `client_nutrition_profiles.daily_kcal_target` still overrides it per
     * client, and a client with no report falls back to the formula whatever
     * this says.
     */
    /**
     * A protein rate for the kinds of client that are not ordinary, keyed by
     * goal or by condition — `{"sports": 1.7, "kidney_disease": 0.6}`.
     *
     * ## Why a map and not three more columns
     *
     * The set is going to grow. Pregnancy, lactation, sarcopenia and recovery
     * from surgery all move a protein requirement, and every one of them would
     * otherwise be a migration to add a number a dietitian could have typed. A
     * key here is a `ProteinRateCase` — see `nutrition-rules.ts`, which owns the
     * list and validates against it both on write and on read.
     *
     * ## What is deliberately NOT in here
     *
     * **Whether a rate is a ceiling or a target.** 0.6 g/kg for a renal client
     * is the most they may eat and 1.0 for a dialysis client is the least, and
     * the two read as the same kind of number. That direction is a property of
     * the condition rather than of a clinic's preference — a renal restriction
     * is a ceiling everywhere — so it lives in `CONDITION_RATE_KINDS` in code,
     * where no settings screen can invert it by accident.
     *
     * Defaults to `{}`, not to the shipped rates: an empty map means this clinic
     * has no special cases and `protein_per_kg` applies to everybody, which is a
     * real answer and the one a clinic reaches by clearing the boxes. Only a
     * clinic with no row at all gets `DEFAULT_NUTRITION_RULES`.
     */
    proteinRates: jsonb('protein_rates').$type<Record<string, number>>().notNull().default({}),

    bmrSource: text('bmr_source').notNull().default('device'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('clinic_nutrition_rules_clinic_id_idx').on(table.clinicId),

    /*
      The vocabularies are checked here and not only in Zod, following
      `clients_color_hex`: these two columns are read straight into a switch
      that decides a client's protein target, and a hand-edited row must not be
      able to reach it.
    */
    check(
      'clinic_nutrition_rules_protein_basis',
      sql`${table.proteinBasis} IN ('actual', 'adjusted', 'lean')`,
    ),
    check('clinic_nutrition_rules_bmr_source', sql`${table.bmrSource} IN ('device', 'formula')`),

    /*
      A floor and a ceiling on the rate, because this one is typed by a person.
      0.3 is below any published recommendation and 3.0 is above what an
      athlete is dosed at, so anything outside the pair is a typo — a slipped
      decimal point, most likely, which is exactly the error that would
      otherwise reach a client's plan looking like a decision.
    */
    check(
      'clinic_nutrition_rules_protein_per_kg_range',
      sql`${table.proteinPerKg} >= 0.3 AND ${table.proteinPerKg} <= 3.0`,
    ),
  ],
);

export type ClinicNutritionRules = typeof clinicNutritionRules.$inferSelect;
export type NewClinicNutritionRules = typeof clinicNutritionRules.$inferInsert;
