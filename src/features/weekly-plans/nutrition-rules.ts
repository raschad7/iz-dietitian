import { z } from 'zod';

import { type ClinicalCondition } from '@/features/clients/nutrition';
import { type ClientActivityLevel, type ClientGoal } from '@/features/clients/schema';

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

/**
 * The kinds of client that get their own protein rate, beyond the ordinary one.
 *
 * ## Why these keys and not others
 *
 * A rate could in principle be set for any goal, any activity level and any of
 * the nineteen clinical conditions — thirty rows in a settings dialog, most of
 * them blank, to express a practice that has four numbers in it. So the storage
 * is a general map, and this is the short list of decisions somebody has
 * actually made.
 *
 * ⚠ **The athlete rate hangs off the activity level, not off the goal, and that
 * was a correction.** It was `sports` — the goal — which is what a client
 * *wants*. Training is what they *do*, and the two come apart constantly: a
 * woman who lifts four times a week and wants to lose eight kilos has the goal
 * `weight_loss`, and she is exactly the client the higher rate exists for. She
 * would have been dosed at 0.8 like somebody sedentary.
 *
 * `active` and `very_active` are separate rows holding the same 1.7 by default
 * — the single figure the dietitian asked for. Two rows rather than one because
 * her own description of the case is a range ("١ ل٢٫٥ حسب اللعب والأيام
 * والوقت"), and splitting it is then an edit rather than a schema change.
 *
 * Each key is a `ClientActivityLevel` or a `ClinicalCondition`; a `ClientGoal`
 * is still permitted by the type so a goal-based rate needs no migration if one
 * is ever wanted. The compile-time check below is what keeps a typo out.
 */
export const PROTEIN_RATE_CASES = [
  'active',
  'very_active',
  'kidney_disease',
  'dialysis',
] as const;

export type ProteinRateCase = (typeof PROTEIN_RATE_CASES)[number];

/** Compile-time proof that every case names a real goal, level or condition. */
const _casesAreReal: readonly (
  | ClientGoal
  | ClientActivityLevel
  | ClinicalCondition
)[] = PROTEIN_RATE_CASES;
void _casesAreReal;

/**
 * What a condition's rate *does* — and why this is code rather than a setting.
 *
 * ⚠ **A ceiling and a target read as the same number and mean opposite things.**
 * 0.6 g/kg for a non-dialysis renal client is the most they should eat; 1.0 for
 * a dialysis client is the least. Anything judging a plan against the figure —
 * the board, the second pass — has to know which it is looking at.
 *
 * That direction is a clinical property of the condition, not a clinic's
 * preference: a renal restriction is a ceiling in every clinic in the world. So
 * the clinic edits the *number* and the code owns the *direction*, and no
 * settings screen can turn a kidney's ceiling into a target by accident.
 *
 * ⚠ **This replaced a comparison, and the comparison was a latent bug.**
 * "Restricted" used to mean "this rate is below the clinic's default", which
 * worked only while the default was 1.6. The moment it became 0.8 — her actual
 * practice — dialysis at 1.0 would have stopped counting, and a dialysis
 * client's raised requirement would have been silently discarded by the `min()`
 * that applied it.
 */
export const CONDITION_RATE_KINDS = {
  kidney_disease: 'ceiling',
  dialysis: 'target',
} as const satisfies Partial<Record<ClinicalCondition, 'ceiling' | 'target'>>;

/** A rate per case. Absent means "no special rate" — the base rate applies. */
export type ProteinRates = Partial<Record<ProteinRateCase, number>>;

export type NutritionRules = {
  /** The ordinary client's rate — الشخص العادي. Every case below overrides it. */
  proteinPerKg: number;
  proteinBasis: ProteinBasis;
  /** Rates for the cases that are not ordinary. See {@link PROTEIN_RATE_CASES}. */
  proteinRates: ProteinRates;
  bmrSource: BmrSource;
};

/**
 * What a clinic gets before it has opened the dialog: the practice this app is
 * built for, written down.
 *
 * ⚠ **These are no longer the old hard-coded constants**, and that was a
 * deliberate change of policy. The first version of this file defaulted to
 * 1.6 g/kg on the adjusted weight because that was exactly what the code did
 * when the rate was a constant, so shipping the setting could not move anybody's
 * target. But the constant was never anyone's practice — it is an upper-band
 * sports figure — and the dietitian using this app overrode the suggestion by
 * hand on every single record, which is the whole reason the setting exists.
 *
 * Her system, in her words: an ordinary client is `weight × 0.8`, an athlete
 * 1–2.5 by sport (she asked for a single 1.7, and it is keyed on how the client
 * trains rather than on what they want), a renal client 0.6, and a dialysis
 * client 0.8–1.0. **The weight is the one on the scale** — not an
 * adjusted weight and not lean mass — which is why `proteinBasis` is `actual`
 * here and was `adjusted` before. On a 72.2 kg client the two differ by 50%:
 * 58 g against 88 g.
 *
 * `dialysis` takes 1.0, the top of the range she gave. It is the figure that
 * keeps a dialysis client above an ordinary one, which is the entire reason the
 * two cases are separate — and it is the direction published guidance argues
 * for, since dialysis removes amino acids. One field on the settings screen
 * changes it.
 *
 * `bmrSource` is `device` because that was the request: the printed figure is
 * the one to use. A client with no report falls back to the formula, the
 * Nutrition tab names which one produced the target, and `formula` here puts
 * Mifflin-St Jeor back for the whole clinic.
 */
export const DEFAULT_NUTRITION_RULES: NutritionRules = {
  proteinPerKg: 0.8,
  proteinBasis: 'actual',
  proteinRates: {
    active: 1.7,
    very_active: 1.7,
    kidney_disease: 0.6,
    dialysis: 1,
  },
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

/**
 * One rate, bounded exactly as the base rate's column is.
 *
 * The same bounds for a case rate as for the ordinary one: 0.3 is below any
 * published restriction and 3.0 above any published requirement, so the range
 * refuses a slipped decimal without having an opinion about practice.
 */
const perKgSchema = z.coerce
  .number()
  .min(PROTEIN_PER_KG_MIN)
  .max(PROTEIN_PER_KG_MAX)
  /* Matches the step the input offers, so a pasted 1.6499 is corrected rather
     than stored and silently redisplayed as 1.6. */
  .transform((value) => Math.round(value * 10) / 10);

/**
 * The per-case rates.
 *
 * Every case optional, and an absent one is not a gap: it means this clinic has
 * no special rate for that kind of client and the ordinary rate applies. A blank
 * box in the dialog therefore clears the case rather than failing, which is how
 * a clinic stops treating athletes differently.
 *
 * `.catch({})` on the whole map rather than throwing: this is read on the way
 * *out* of the database too, and a jsonb column somebody hand-edited must not be
 * able to take a record page down. An unreadable map degrades to "no special
 * rates", which is the safe direction — it can only ever move a target back
 * towards the clinic's own base figure.
 */
const proteinRatesSchema = z
  .object(
    Object.fromEntries(
      PROTEIN_RATE_CASES.map((key) => [key, perKgSchema.optional()]),
    ) as Record<ProteinRateCase, z.ZodOptional<typeof perKgSchema>>,
  )
  .catch({});

export const nutritionRulesSchema = z.object({
  proteinPerKg: perKgSchema,
  proteinBasis: z.enum(PROTEIN_BASES),
  proteinRates: proteinRatesSchema,
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
  proteinRates: unknown;
  bmrSource: string | null;
} | null | undefined): NutritionRules {
  if (!row) return DEFAULT_NUTRITION_RULES;

  const parsed = nutritionRulesSchema.safeParse({
    proteinPerKg: row.proteinPerKg ?? DEFAULT_NUTRITION_RULES.proteinPerKg,
    proteinBasis: row.proteinBasis ?? DEFAULT_NUTRITION_RULES.proteinBasis,
    /*
      `null` and `{}` are the same answer — no special rates — and neither falls
      back to the shipped defaults. That matters: a clinic that deliberately
      cleared its athlete rate must not have 1.7 handed back to it on the next
      read. Only a wholly absent *row* gets the defaults.
    */
    proteinRates: row.proteinRates ?? {},
    bmrSource: row.bmrSource ?? DEFAULT_NUTRITION_RULES.bmrSource,
  });

  return parsed.success ? parsed.data : DEFAULT_NUTRITION_RULES;
}
