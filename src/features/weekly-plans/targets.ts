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

/** The suggested daily target: TDEE, adjusted for the goal, floored. */
export function goalKcal(tdeeValue: number, goal: string | null): number {
  const adjustment = GOAL_ADJUSTMENTS[goal as ClientGoal] ?? 0;
  return Math.max(MIN_SUGGESTED_KCAL, Math.round(tdeeValue + adjustment));
}

export type SuggestedTargets = {
  bmi: number | null;
  bmiCategory: BmiCategory | null;
  bmr: number | null;
  /**
   * Which BMR the target above was built on. Always `estimated` when there is
   * one — see `measuredBmrKcal` for why the analyser's figure does not displace
   * it, and why this field is still worth reporting rather than assuming.
   */
  bmrSource: 'measured' | 'estimated' | null;
  /** Mifflin's answer. The one the suggestion is built on. */
  estimatedBmr: number | null;
  /** What the analyser's own equation said, when a report carried one. */
  deviceBmr: number | null;
  /** `(device − estimate) / estimate`, or null when there is nothing to compare. */
  bmrGap: number | null;
  tdee: number | null;
  /** Null when the profile is too incomplete to compute one. */
  suggestedKcal: number | null;
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
  measuredBmrKcal = null,
}: {
  weightKg: number | null;
  heightCm: number | null;
  age: number | null;
  sex: string | null;
  activityLevel: string | null;
  goal: string | null;
  /**
   * The BMR printed on a body composition report, when there is one.
   *
   * ## It does **not** win, and correcting that is why this comment is long
   *
   * An earlier version of this let the analyser's figure displace Mifflin-St
   * Jeor, on the reasoning that the machine "measures" what the formula guesses
   * at. That reasoning is wrong, and the error matters because it was setting
   * people's calorie targets.
   *
   * A Tanita does not measure metabolic rate. Measuring it means indirect
   * calorimetry — the gold standard, and a different machine. What an analyser
   * does is measure *impedance*, estimate fat-free mass from it, and then run
   * its own proprietary equation from that mass to a BMR. It is a prediction
   * too. So the choice is not measurement against estimate; it is one
   * undisclosed equation against Mifflin-St Jeor, which is the best-validated
   * one in the literature (roughly 73–82% accuracy against calorimetry) and the
   * one the Academy of Nutrition and Dietetics recommends when calorimetry is
   * not available.
   *
   * On a real report the two differed by 125 kcal a day — 1,321 against 1,446 —
   * and that gap is exactly why the app must not pick silently. It is shown
   * beside the estimate instead, on the Nutrition tab, so a dietitian who knows
   * this client is unusually muscular can set `daily_kcal_target` by hand and
   * knows they are doing it.
   *
   * `bmrSource` therefore always reports `estimated` when a BMR exists at all.
   * The field is kept so the screen can name the difference, and so the day
   * somebody adds a per-client choice there is a place to put it.
   */
  measuredBmrKcal?: number | null;
}): SuggestedTargets {
  const missing: SuggestedTargets['missing'][number][] = [];
  if (weightKg === null || !(weightKg > 0)) missing.push('weightKg');
  if (heightCm === null || !(heightCm > 0)) missing.push('heightCm');
  if (age === null) missing.push('dateOfBirth');
  if (sex !== 'male' && sex !== 'female') missing.push('sex');

  const bmiValue = bmi(weightKg, heightCm);
  const estimated = mifflinStJeorBmr({ weightKg, heightCm, age, sex });

  /*
    The device's figure is reported, never substituted — see the note on
    `measuredBmrKcal`. The suggestion is built on Mifflin-St Jeor and only on
    Mifflin-St Jeor, so shipping the device reading cannot move a number anybody
    is already eating to.
  */
  const device = measuredBmrKcal !== null && measuredBmrKcal > 0 ? measuredBmrKcal : null;
  const tdeeValue = estimated === null ? null : tdee(estimated, activityLevel);

  return {
    bmi: bmiValue,
    bmiCategory: bmiValue === null ? null : bmiCategory(bmiValue),
    bmr: estimated,
    bmrSource: estimated === null ? null : 'estimated',
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
    suggestedKcal: tdeeValue === null ? null : goalKcal(tdeeValue, goal),
    missing,
  };
}

/**
 * Protein suggestion in grams, at 1.6 g per kilogram of body weight.
 *
 * The upper end of general guidance rather than the 0.8 g/kg RDA, which is a
 * minimum to avoid deficiency and not a target for anyone actively changing their
 * body composition — which is every client this software has.
 */
export function suggestProteinGrams(weightKg: number | null): number | null {
  if (weightKg === null || !(weightKg > 0)) return null;
  return Math.round(weightKg * 1.6);
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
