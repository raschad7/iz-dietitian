/**
 * The numbers a weekly plan is generated against, none of which are stored.
 *
 * Pure functions over plain values: no database, no React, no Next.js — the same
 * discipline as `src/features/weekly-plans/nutrition.ts`, and for the same reason.
 * A calorie target that could only be checked by rendering a page is a calorie
 * target nobody checks.
 *
 * Everything here is a *suggestion*. `client_nutrition_profiles.daily_kcal_target`
 * overrides it when the dietitian sets one, because a formula does not know about
 * the client in front of them.
 */

import type { ClientActivityLevel, ClientGoal } from '@/features/clients/schema';

import { lifeStageKcal } from './clinical';
import {
  DEFAULT_NUTRITION_RULES,
  type BmrSource,
  type ProteinBasis,
} from './nutrition-rules';
import type { ClinicalCondition } from '@/features/clients/nutrition';

/**
 * BMI categories, as the WHO defines them for adults.
 *
 * `severely_obese` is split out from `obese` because the two carry different
 * clinical urgency, and the panel colours them differently.
 */
export const BMI_CATEGORIES = [
  'underweight',
  'normal',
  'overweight',
  'obese',
  'severely_obese',
] as const;

export type BmiCategory = (typeof BMI_CATEGORIES)[number];

/**
 * Body mass index.
 *
 * Returns null rather than NaN for missing or nonsensical input: the UI has to
 * distinguish "not measured yet" from a number, and NaN propagates silently
 * through every subsequent calculation.
 */
export function bmi(weightKg: number | null, heightCm: number | null): number | null {
  if (weightKg === null || heightCm === null) return null;
  if (!(weightKg > 0) || !(heightCm > 0)) return null;

  const metres = heightCm / 100;
  return weightKg / (metres * metres);
}

export function bmiCategory(value: number): BmiCategory {
  if (value < 18.5) return 'underweight';
  if (value < 25) return 'normal';
  if (value < 30) return 'overweight';
  if (value < 35) return 'obese';
  return 'severely_obese';
}

/**
 * Basal metabolic rate by Mifflin-St Jeor — the equation current practice
 * prefers over Harris-Benedict, which overestimates by roughly 5%.
 *
 *   10·kg + 6.25·cm − 5·age + 5   (male)
 *   10·kg + 6.25·cm − 5·age − 161 (female)
 *
 * `sex` is nullable on `clients` and the constant differs by 166 kcal, so a
 * missing value makes this unanswerable rather than approximable.
 */
export function mifflinStJeorBmr({
  weightKg,
  heightCm,
  age,
  sex,
}: {
  weightKg: number | null;
  heightCm: number | null;
  age: number | null;
  sex: string | null;
}): number | null {
  if (weightKg === null || heightCm === null || age === null) return null;
  if (sex !== 'male' && sex !== 'female') return null;
  if (!(weightKg > 0) || !(heightCm > 0) || !(age >= 0)) return null;

  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
}

/**
 * Activity multipliers, keyed to the values `clients.activity_level` already
 * stores. A client with no recorded level is treated as sedentary — the
 * conservative direction, since overstating activity overstates the target.
 */
const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
} as const satisfies Record<ClientActivityLevel, number>;

export function activityFactor(level: string | null): number {
  return ACTIVITY_FACTORS[level as ClientActivityLevel] ?? ACTIVITY_FACTORS.sedentary;
}

/** Total daily energy expenditure — BMR scaled by how much the client moves. */
export function tdee(bmr: number, activityLevel: string | null): number {
  return bmr * activityFactor(activityLevel);
}

/**
 * Energy adjustment per goal, keyed to the values `clients.goal` already stores.
 *
 * −500 kcal/day is the conventional half-kilo-a-week deficit. `medical` and
 * `sports` get no adjustment: both mean "the dietitian decides", and guessing a
 * direction for a clinical case would be worse than leaving it at maintenance.
 */
const GOAL_ADJUSTMENTS = {
  weight_loss: -500,
  weight_gain: 400,
  maintenance: 0,
  medical: 0,
  sports: 0,
} as const satisfies Record<ClientGoal, number>;

/**
 * The lowest target this will ever suggest.
 *
 * Below roughly 1,200 kcal a day an ordinary diet cannot meet micronutrient
 * requirements, so a very small, very sedentary client with a weight-loss goal
 * must not have the arithmetic carry them somewhere unsafe. A dietitian who
 * genuinely wants less can set `daily_kcal_target` by hand; the formula will not
 * propose it.
 */
export const MIN_SUGGESTED_KCAL = 1200;

/**
 * The suggested daily target: TDEE, adjusted for the goal and the life stage,
 * floored.
 *
 * `lifeStage` is the extra energy a pregnancy or a lactation needs — see
 * `LIFE_STAGE_KCAL`. It is added *after* the goal adjustment and before the
 * floor, deliberately: a pregnant woman with a weight-loss goal on the record is
 * a record that needs looking at, and the arithmetic should show her the two
 * pulling against each other rather than resolve it quietly. The floor still
 * binds, because it is a floor on what an ordinary diet can supply.
 */
export function goalKcal(tdeeValue: number, goal: string | null, lifeStage = 0): number {
  const adjustment = GOAL_ADJUSTMENTS[goal as ClientGoal] ?? 0;
  return Math.max(MIN_SUGGESTED_KCAL, Math.round(tdeeValue + adjustment + lifeStage));
}

export type SuggestedTargets = {
  bmi: number | null;
  bmiCategory: BmiCategory | null;
  bmr: number | null;
  /**
   * Which BMR the target above was actually built on — `measured` when the
   * clinic is set to the analyser's figure *and* a report carried one,
   * `estimated` otherwise.
   *
   * Reported rather than inferred, because the fallback is invisible from
   * outside: a clinic set to `device` still gets `estimated` for every client
   * who has never been scanned, and a screen that assumed the setting would
   * label those targets wrongly.
   */
  bmrSource: 'measured' | 'estimated' | null;
  /** Mifflin's answer, whether or not it is the one in use. */
  estimatedBmr: number | null;
  /** What the analyser's own equation said, when a report carried one. */
  deviceBmr: number | null;
  /** `(device − estimate) / estimate`, or null when there is nothing to compare. */
  bmrGap: number | null;
  tdee: number | null;
  /** Null when the profile is too incomplete to compute one. */
  suggestedKcal: number | null;
  /**
   * The extra daily energy a pregnancy or a lactation added, and which
   * condition added it. Zero and null for everybody else.
   *
   * Reported rather than folded silently into `suggestedKcal`, following this
   * module's own rule about the analyser's BMR: a number that moved has to be
   * able to say why. The Nutrition tab prints it under the suggestion.
   */
  lifeStageKcal: number;
  lifeStageFrom: ClinicalCondition | null;
  /** Which inputs are missing, so the UI can name them instead of saying "incomplete". */
  missing: readonly ('weightKg' | 'heightCm' | 'dateOfBirth' | 'sex')[];
};

/**
 * Everything derivable from a client's measurements, in one pass.
 *
 * Reports what is *missing* rather than only failing, because "fill in the
 * weight" is actionable and "cannot compute a target" is not.
 */
export function suggestTargets({
  weightKg,
  heightCm,
  age,
  sex,
  activityLevel,
  goal,
  clinicalTags = [],
  measuredBmrKcal = null,
  bmrSource = 'formula',
}: {
  weightKg: number | null;
  heightCm: number | null;
  age: number | null;
  sex: string | null;
  activityLevel: string | null;
  goal: string | null;
  /**
   * The client's ticked conditions. Only the life-stage ones are read here —
   * a pregnancy and a lactation are the two that change how much energy a
   * person needs, and they are the reason this argument exists.
   */
  clinicalTags?: readonly string[];
  /**
   * The BMR printed on a body composition report, when there is one.
   *
   * Whether it wins is `bmrSource`'s decision, not this argument's — pass the
   * figure whenever a report carries it, even on a clinic set to `formula`, so
   * the Nutrition tab can show what the other answer would have been.
   */
  measuredBmrKcal?: number | null;
  /**
   * Which BMR to build the day on. The clinic's setting — see
   * `clinic_nutrition_rules.bmr_source`.
   *
   * ## Neither figure is a measurement, and that is why this is a setting
   *
   * A Tanita does not measure metabolic rate. Measuring it means indirect
   * calorimetry — a different machine. What an analyser does is measure
   * *impedance*, estimate fat-free mass from it, then run its own proprietary
   * equation from that mass to a BMR. So this is not measurement against
   * estimate; it is one undisclosed equation against Mifflin-St Jeor, which is
   * the best-validated one in the literature and the one the Academy of
   * Nutrition and Dietetics recommends when calorimetry is not available.
   *
   * On a real report the two differed by 125 kcal a day — 1,321 against 1,446.
   * A gap that size decides how much a person eats, so the app must not pick
   * silently and must not pretend the choice is settled. The clinic picks, on a
   * screen that shows both numbers, and `bmrSource` in the result names which
   * one produced the target so every screen can say so too.
   *
   * Defaults to `formula` here rather than to the column's `device`: a caller
   * that has not been given the clinic's rules gets the conservative,
   * well-validated answer instead of one that depends on which report happened
   * to be uploaded. Callers that matter all pass it.
   */
  bmrSource?: BmrSource;
}): SuggestedTargets {
  const missing: SuggestedTargets['missing'][number][] = [];
  if (weightKg === null || !(weightKg > 0)) missing.push('weightKg');
  if (heightCm === null || !(heightCm > 0)) missing.push('heightCm');
  if (age === null) missing.push('dateOfBirth');
  if (sex !== 'male' && sex !== 'female') missing.push('sex');

  const bmiValue = bmi(weightKg, heightCm);
  const estimated = mifflinStJeorBmr({ weightKg, heightCm, age, sex });
  const device = measuredBmrKcal !== null && measuredBmrKcal > 0 ? measuredBmrKcal : null;

  /*
    Which of the two the day is built on — the clinic's setting, and the report
    has to exist for it to apply. `device` with no report is not an error and
    not a blank target: it falls through to Mifflin-St Jeor, which is the only
    other answer there is. See `bmrSource` on `clinic_nutrition_rules`.
  */
  const usingDevice = bmrSource === 'device' && device !== null;
  const basalKcal = usingDevice ? device : estimated;

  const tdeeValue = basalKcal === null ? null : tdee(basalKcal, activityLevel);
  const lifeStage = lifeStageKcal(clinicalTags);

  return {
    bmi: bmiValue,
    bmiCategory: bmiValue === null ? null : bmiCategory(bmiValue),
    bmr: basalKcal,
    bmrSource: basalKcal === null ? null : usingDevice ? 'measured' : 'estimated',
    estimatedBmr: estimated,
    deviceBmr: device,
    /*
      How far apart the two answers are, as a fraction of the estimate, when
      both exist. `null` when there is nothing to compare — the screen shows the
      device figure only when this crosses its own threshold, so an analyser
      that agrees with the formula adds no clutter.
    */
    bmrGap: device === null || estimated === null ? null : (device - estimated) / estimated,
    tdee: tdeeValue,
    suggestedKcal: tdeeValue === null ? null : goalKcal(tdeeValue, goal, lifeStage.kcal),
    lifeStageKcal: lifeStage.kcal,
    lifeStageFrom: lifeStage.from,
    missing,
  };
}

/**
 * The rate used when a caller passes none.
 *
 * ⚠ **This is a fallback, not the clinic's answer.** The rate belongs to the
 * clinic and is edited in Settings — see `clinic_nutrition_rules.protein_per_kg`
 * and `DEFAULT_NUTRITION_RULES`, which this deliberately mirrors so a caller
 * that has not been threaded the rules yet behaves exactly as the app did when
 * the figure was a constant.
 *
 * It is also what `proteinIsRestricted` compares against, which is the reason
 * it stays a module constant rather than becoming a parameter everywhere: that
 * question is "is this a ceiling or a goal", and the answer must not change
 * because a clinic edited a rate.
 */
const DEFAULT_PROTEIN_PER_KG = DEFAULT_NUTRITION_RULES.proteinPerKg;

/**
 * Grams of protein per kilogram, where a condition changes the answer.
 *
 * ## Why a flat rate was unsafe
 *
 * 1.6 g/kg was applied to everybody, and for a client with chronic kidney disease
 * that is roughly double what they should eat: non-dialysis CKD guidance is
 * 0.6–0.8 g/kg. An audited plan for an 80 kg renal client was given a 128 g target,
 * delivered a clinically correct 57–85 g, and the board then reported every day of
 * the week as a protein failure. The plan was right and the target was wrong.
 *
 * Worse, the same prompt carried both "Daily protein target: 128 g" and "Chronic
 * kidney disease. Keep animal protein to one modest portion a day" — two
 * instructions pulling against each other in one payload.
 *
 * Dialysis is the mirror image and the reason the two cannot share a rule: dialysis
 * *raises* the requirement, because the treatment itself removes amino acids.
 *
 * The lowest applicable figure wins. A record carrying both `kidney_disease` and
 * `dialysis` is mid-correction, and erring downward is the safe direction for a
 * kidney.
 */
const PROTEIN_PER_KG: Partial<Record<ClinicalCondition, number>> = {
  kidney_disease: 0.7,
  dialysis: 1.2,
};

/**
 * The most of a day's energy that may be asked of protein.
 *
 * Not a clinical limit but a reachability one. 141 g of protein against a
 * 1,522 kcal target is 37% of the day's energy, which no ordinary week of
 * Palestinian home cooking reaches — so the plan is marked short every day for
 * missing a number it was never going to hit, and the real signal is buried.
 *
 * A third is generous: high-protein practice sits at 25–30%, and the cap only
 * binds where an aggressive deficit meets a heavy client.
 */
const MAX_PROTEIN_ENERGY_SHARE = 1 / 3;

/**
 * Whether a condition makes the protein target a ceiling rather than a goal.
 *
 * The number reads the same either way, and the difference is the whole clinical
 * point: 56 g for a renal client is the most they should eat, and 56 g for anybody
 * else is the least. Anything judging a plan against the figure — the board, the
 * second pass — has to know which it is looking at.
 */
export function proteinIsRestricted(clinicalTags: readonly string[]): boolean {
  return clinicalTags.some(
    (tag) => (PROTEIN_PER_KG[tag as ClinicalCondition] ?? DEFAULT_PROTEIN_PER_KG) < DEFAULT_PROTEIN_PER_KG,
  );
}
const KCAL_PER_GRAM_PROTEIN = 4;

/**
 * The weight a gram-per-kilo rate should be read against.
 *
 * Protein is dosed to the tissue that uses it, and fat mass does not. Charging
 * 1.6 g/kg against the scale gives a client carrying thirty kilos of fat a target
 * built on thirty kilos that will never ask for any — 125 g a day for a 78 kg
 * woman on 1,529 kcal, which is a third of her energy and more than her lean mass
 * could use at 2.6 g per kilo of it.
 *
 * So above a healthy weight the standard correction applies: ideal body weight
 * plus a quarter of the excess, which is the adjusted weight dietetics has used
 * for decades and the figure most clinical references dose against. At or below
 * a healthy weight nothing happens and the scale is the answer.
 *
 * Devine for the ideal, because it is the one the references are written in.
 * Nothing here is a diagnosis — it is which number a rate multiplies.
 */
export function dosingWeightKg(
  weightKg: number,
  heightCm: number | null,
  sex: string | null,
): number {
  if (heightCm === null || !(heightCm > 0)) return weightKg;

  const inchesOverFiveFeet = Math.max(0, heightCm / 2.54 - 60);
  const ideal = (sex === 'female' ? 45.5 : 50) + 2.3 * inchesOverFiveFeet;

  if (weightKg <= ideal) return weightKg;

  return ideal + 0.25 * (weightKg - ideal);
}

/**
 * Protein suggestion in grams.
 *
 * Three things narrow the answer, in this order, and each is a different kind
 * of limit:
 *
 * 1. **The clinic's rule** — `perKg` against the weight `basis` names. This is
 *    the target, and it is a setting because it is a clinical judgement the app
 *    has no standing to make.
 * 2. **The condition** — a renal client's published ceiling, computed on its own
 *    basis and taking the lower of the two. See the note inside.
 * 3. **The day's energy** — `dailyKcalTarget` caps the result at a share of the
 *    day that food can actually deliver; omit it and no cap applies, which is
 *    what the intake form wants while the calorie target is still being decided.
 *
 * Returns null only when there is no weight, which is the one input with no
 * substitute.
 */
export function suggestProteinGrams(
  weightKg: number | null,
  {
    clinicalTags = [],
    dailyKcalTarget = null,
    heightCm = null,
    sex = null,
    perKg = DEFAULT_PROTEIN_PER_KG,
    basis = DEFAULT_NUTRITION_RULES.proteinBasis,
    fatFreeMassKg = null,
  }: {
    clinicalTags?: readonly string[];
    dailyKcalTarget?: number | null;
    /** Both needed for the adjusted weight; without them the scale is used unchanged. */
    heightCm?: number | null;
    sex?: string | null;
    /** The clinic's rate — `clinic_nutrition_rules.protein_per_kg`. */
    perKg?: number;
    /** Which weight that rate multiplies — `clinic_nutrition_rules.protein_basis`. */
    basis?: ProteinBasis;
    /**
     * Fat-free mass from the client's most recent body composition report.
     *
     * Only read when `basis` is `lean`, and its absence is the ordinary case
     * rather than an error — see {@link proteinDosingWeightKg}.
     */
    fatFreeMassKg?: number | null;
  } = {},
): number | null {
  if (weightKg === null || !(weightKg > 0)) return null;

  const adjusted = dosingWeightKg(weightKg, heightCm, sex);
  const grams = proteinDosingWeightKg(weightKg, adjusted, basis, fatFreeMassKg) * perKg;

  /*
    ⚠ **A condition's rate is a separate answer, not a replacement rate**, and
    computing it apart from the clinic's is what keeps the kidney safe.

    Both used to be one number: the lowest applicable g/kg, times the adjusted
    weight. That worked while the clinic's rate was also per adjusted kilo. It
    stops working the moment a clinic doses on `lean` — 0.7 g/kg against 54.6 kg
    of lean mass is 38 g for a renal client who should be eating 41 g, and the
    error is silent and in the direction that matters.

    So the published figure keeps the basis it is published in — adjusted body
    weight, which is what renal guidance is written against — and the lower of
    the two wins. A clinic can never raise a restricted client's target by
    editing a setting, and lowering one still works.
  */
  const clinicalPerKg = clinicalTags.reduce(
    (lowest, tag) => Math.min(lowest, PROTEIN_PER_KG[tag as ClinicalCondition] ?? lowest),
    Number.POSITIVE_INFINITY,
  );
  const clinicalGrams = Number.isFinite(clinicalPerKg) ? adjusted * clinicalPerKg : grams;

  const dosed = Math.min(grams, clinicalGrams);

  if (dailyKcalTarget === null || !(dailyKcalTarget > 0)) return Math.round(dosed);

  const ceiling = (dailyKcalTarget * MAX_PROTEIN_ENERGY_SHARE) / KCAL_PER_GRAM_PROTEIN;

  return Math.round(Math.min(dosed, ceiling));
}

/**
 * Which kilos the clinic's rate multiplies.
 *
 * ⚠ **`lean` falls back to `adjusted`, and the fallback is the feature.** A
 * clinic dosing on measured fat-free mass still has clients who have never
 * stood on the analyser — a walk-in, a first visit, anyone weighed on an
 * ordinary scale. Returning null for them would blank the one figure a plan is
 * judged against; using the scale unchanged would quietly hand a client
 * carrying thirty kilos of fat a target built on all of it. The adjusted weight
 * is the estimate of lean mass that exists without a report, so it is what
 * `lean` degrades to, and `SuggestedTargets` is not where that is announced —
 * the Nutrition tab names the basis it actually used.
 */
export function proteinDosingWeightKg(
  weightKg: number,
  adjustedKg: number,
  basis: ProteinBasis,
  fatFreeMassKg: number | null,
): number {
  if (basis === 'actual') return weightKg;
  if (basis === 'lean' && fatFreeMassKg !== null && fatFreeMassKg > 0) return fatFreeMassKg;
  return adjustedKg;
}

export type SlotBudget = {
  slotKey: string;
  label: string;
  timeOfDay: string;
  /** Calories this slot should carry. Rounded — the model gets a whole number. */
  kcal: number;
};

/**
 * Splits a daily target across the client's slots by their shares.
 *
 * Shares are normalised rather than assumed to sum to 1: a dietitian editing the
 * schedule to four meals should not silently lose a fifth of the day's calories
 * because the shares no longer add up.
 */
export function slotBudgets(
  dailyKcal: number,
  slots: readonly { slotKey: string; label: string; timeOfDay: string; kcalShare: number }[],
): SlotBudget[] {
  const total = slots.reduce((sum, slot) => sum + slot.kcalShare, 0);

  // No shares at all: split the day evenly rather than returning zeros, which
  // would tell the model every meal should be empty.
  const weight = (share: number) => (total > 0 ? share / total : 1 / slots.length);

  return slots.map((slot) => ({
    slotKey: slot.slotKey,
    label: slot.label,
    timeOfDay: slot.timeOfDay,
    kcal: Math.round(dailyKcal * weight(slot.kcalShare)),
  }));
}
