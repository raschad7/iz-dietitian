import { z } from 'zod';

/**
 * The clinic's dosing rules, as plain values.
 *
 * Pure: no database, no React. `targets.ts` takes these as arguments, so the
 * effect of changing a rate can be checked in a test rather than by generating
 * a week and reading the result. Same discipline as `targets.ts` itself.
 *
 * The storage and the reasoning for each field are in
 * `src/db/schema/clinic-nutrition-rules.ts`.
 */

/**
 * Which weight a gram-per-kilo protein rate multiplies.
 *
 * ⚠ **The rate means nothing without this.** For a 78 kg client at 30% body
 * fat, "1 g per kg" is 78 g, 59 g or 55 g depending on which of these is meant
 * — a 40% spread on the single figure a plan is judged against. The two are
 * stored, read and edited as a pair for that reason, and no function here takes
 * one without the other.
 */
export const PROTEIN_BASES = ['actual', 'adjusted', 'lean'] as const;
export type ProteinBasis = (typeof PROTEIN_BASES)[number];

/** Whose BMR the calorie suggestion is built on. */
export const BMR_SOURCES = ['device', 'formula'] as const;
export type BmrSource = (typeof BMR_SOURCES)[number];

export type NutritionRules = {
  proteinPerKg: number;
  proteinBasis: ProteinBasis;
  bmrSource: BmrSource;
};

/**
 * What a clinic gets before it has opened the dialog.
 *
 * ⚠ **The protein pair reproduces the old hard-coded behaviour and the BMR one
 * does not**, and the asymmetry is deliberate. 1.6 g/kg on the adjusted weight
 * is exactly what `suggestProteinGrams` did when the rate was a constant, so
 * this migration cannot move a number anybody is already eating to — the clinic
 * changes it when it decides to, on a screen that shows what the change does.
 *
 * `bmrSource` is `device` because that was the request: the printed figure is
 * the one to use. It is still not a silent swap — a client with no report falls
 * back to the formula, the Nutrition tab names which one produced the target,
 * and `formula` here puts the old behaviour back for the whole clinic.
 */
export const DEFAULT_NUTRITION_RULES: NutritionRules = {
  proteinPerKg: 1.6,
  proteinBasis: 'adjusted',
  bmrSource: 'device',
};

/**
 * The bounds the column's own check constraint enforces — see
 * `clinic_nutrition_rules_protein_per_kg_range`.
 *
 * Exported so the dialog can put them on the input and say them in its hint,
 * rather than letting the reader discover them by being rejected.
 */
export const PROTEIN_PER_KG_MIN = 0.3;
export const PROTEIN_PER_KG_MAX = 3;

/**
 * One decimal place, because that is the resolution the decision has. Nobody
 * doses at 1.63 g/kg, and a stored 1.6499999 renders as a different number
 * from the one that was typed.
 */
export const PROTEIN_PER_KG_STEP = 0.1;

export const nutritionRulesSchema = z.object({
  proteinPerKg: z.coerce
    .number()
    .min(PROTEIN_PER_KG_MIN)
    .max(PROTEIN_PER_KG_MAX)
    /* Matches the step the input offers, so a pasted 1.6499 is corrected rather
       than stored and silently redisplayed as 1.6. */
    .transform((value) => Math.round(value * 10) / 10),
  proteinBasis: z.enum(PROTEIN_BASES),
  bmrSource: z.enum(BMR_SOURCES),
});

export type NutritionRulesInput = z.infer<typeof nutritionRulesSchema>;

/**
 * Read a row — or a hand-edited one, or none at all — as usable rules.
 *
 * Validated on the way *out* of the database and not only on the way in,
 * following `client_nutrition_profiles.meal_schedule`: a value that decides a
 * client's protein target must not reach a component because a column happened
 * to hold a string. Anything unrecognised falls back to the field's default
 * rather than throwing, so one bad column cannot take a record page down.
 */
export function readNutritionRules(row: {
  proteinPerKg: number | null;
  proteinBasis: string | null;
  bmrSource: string | null;
} | null | undefined): NutritionRules {
  if (!row) return DEFAULT_NUTRITION_RULES;

  const parsed = nutritionRulesSchema.safeParse({
    proteinPerKg: row.proteinPerKg ?? DEFAULT_NUTRITION_RULES.proteinPerKg,
    proteinBasis: row.proteinBasis ?? DEFAULT_NUTRITION_RULES.proteinBasis,
    bmrSource: row.bmrSource ?? DEFAULT_NUTRITION_RULES.bmrSource,
  });

  return parsed.success ? parsed.data : DEFAULT_NUTRITION_RULES;
}
