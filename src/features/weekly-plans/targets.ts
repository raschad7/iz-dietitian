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
}: {
  weightKg: number | null;
  heightCm: number | null;
  age: number | null;
  sex: string | null;
  activityLevel: string | null;
  goal: string | null;
}): SuggestedTargets {
  const missing: SuggestedTargets['missing'][number][] = [];
  if (weightKg === null || !(weightKg > 0)) missing.push('weightKg');
  if (heightCm === null || !(heightCm > 0)) missing.push('heightCm');
  if (age === null) missing.push('dateOfBirth');
  if (sex !== 'male' && sex !== 'female') missing.push('sex');

  const bmiValue = bmi(weightKg, heightCm);
  const bmrValue = mifflinStJeorBmr({ weightKg, heightCm, age, sex });
  const tdeeValue = bmrValue === null ? null : tdee(bmrValue, activityLevel);

  return {
    bmi: bmiValue,
    bmiCategory: bmiValue === null ? null : bmiCategory(bmiValue),
    bmr: bmrValue,
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
