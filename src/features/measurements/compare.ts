/**
 * What changed between two measurements, and whether that change is good news.
 *
 * Pure functions over plain values: no database, no React, no Next.js — the
 * same discipline as `features/weekly-plans/targets.ts` and for the same
 * reason. A verdict that could only be checked by rendering a page is a verdict
 * nobody checks, and this module decides which arrow points which way on a
 * clinical screen.
 *
 * ## The trap this module exists to avoid
 *
 * "Weight went down, colour it green" is wrong often enough to be dangerous.
 * It is wrong for a client whose goal is to gain, wrong for an underweight
 * client, and wrong when the weight that left was muscle. Direction is a
 * property of *this metric for this client's goal*, never of the sign of the
 * number — so every judgement here goes through {@link metricIntent}, and any
 * combination it has no confident answer for comes back `unjudged` and is drawn
 * without colour. A missing verdict is a small loss; a confidently wrong one is
 * a dietitian being told a deterioration is progress.
 */

import { toUtcInstant } from '@/features/booking/date';
import { bmi } from '@/features/weekly-plans/targets';
import { type IsoDate } from '@/lib/iso-date';

/**
 * The figures worth comparing across visits.
 *
 * A subset of the columns on `client_measurements`, not all of them: metabolic
 * age, bone mass and body water in kilograms are recorded and shown on a single
 * visit, but they are not things a dietitian tracks a trend in, and offering a
 * trend line for every stored number would bury the four that matter.
 *
 * `bmi` is here and is **not** a column — see {@link measurementValue}.
 */
export const MEASUREMENT_METRICS = [
  'weightKg',
  'bmi',
  'bodyFatPercent',
  'fatMassKg',
  'fatFreeMassKg',
  'muscleMassKg',
  'visceralFatRating',
  'waistCm',
  'hipCm',
  'basalMetabolicRateKcal',
] as const;

export type MeasurementMetric = (typeof MEASUREMENT_METRICS)[number];

/**
 * Which way a metric should be moving, for a given goal.
 *
 * `none` is a real answer and the safe default, not a gap to be filled in
 * later. It means "this app cannot tell whether that is good news", which is
 * the honest position for a client whose goal is `medical` — the same reasoning
 * `GOAL_ADJUSTMENTS` in `targets.ts` uses when it refuses to guess a calorie
 * direction for one.
 */
export type MetricIntent = 'lower' | 'higher' | 'none';

/** How a change came out, once the intent is known. */
export type ChangeVerdict = 'improved' | 'declined' | 'unchanged' | 'unjudged';

/** The client facts a comparison needs. Deliberately not a database row. */
export type MeasurementSubject = {
  /** `clients.goal` — weight_loss | weight_gain | maintenance | medical | sports. */
  goal: string | null;
  /** `clients.height_cm`. The authority on height; see {@link measurementHeightCm}. */
  heightCm: number | null;
};

/**
 * The shape a comparison reads. A structural type rather than the Drizzle row,
 * so tests can write one out by hand and so nothing here depends on the schema
 * module.
 */
export type ComparableMeasurement = {
  id: string;
  /** Clinic-local `YYYY-MM-DD`, paired with the minute below. See the schema note. */
  measuredOn: IsoDate;
  /** Minutes from clinic-local midnight, 0-1439. */
  measuredAtMinute: number;
  weightKg: number;
  heightCm: number | null;
  bodyFatPercent: number | null;
  fatMassKg: number | null;
  fatFreeMassKg: number | null;
  muscleMassKg: number | null;
  visceralFatRating: number | null;
  waistCm: number | null;
  hipCm: number | null;
  basalMetabolicRateKcal: number | null;
};

/**
 * Per-metric display and comparison settings.
 *
 * `epsilon` is the change below which two readings are the same reading. It is
 * not cosmetic rounding: an analyser repeats to about ±0.1 kg, so calling a
 * 0.02 kg difference "progress" would put a green arrow on noise. Each value is
 * one step of the precision the figure is shown at.
 */
const METRIC_SETTINGS = {
  weightKg: { decimals: 1, epsilon: 0.05 },
  bmi: { decimals: 1, epsilon: 0.05 },
  bodyFatPercent: { decimals: 1, epsilon: 0.05 },
  fatMassKg: { decimals: 1, epsilon: 0.05 },
  fatFreeMassKg: { decimals: 1, epsilon: 0.05 },
  muscleMassKg: { decimals: 1, epsilon: 0.05 },
  visceralFatRating: { decimals: 1, epsilon: 0.05 },
  waistCm: { decimals: 1, epsilon: 0.05 },
  hipCm: { decimals: 1, epsilon: 0.05 },
  basalMetabolicRateKcal: { decimals: 0, epsilon: 0.5 },
} as const satisfies Record<MeasurementMetric, { decimals: number; epsilon: number }>;

export function metricDecimals(metric: MeasurementMetric): number {
  return METRIC_SETTINGS[metric].decimals;
}

/**
 * Which direction counts as progress, per metric and goal.
 *
 * Read the `medical` column first: it is `none` for everything. "Medical" in
 * this app means the dietitian decides, and a medical client losing weight may
 * be losing it for the reason they are a client. Nothing here will call that an
 * improvement.
 *
 * `sports` is judged on body composition but **not** on scale weight, because a
 * sports client may be deliberately cutting or deliberately bulking and the
 * goal alone does not say which.
 *
 * Muscle and fat-free mass rise for every goal that is judged at all — there is
 * no goal in this app for which losing muscle is the plan.
 */
export function metricIntent(metric: MeasurementMetric, goal: string | null): MetricIntent {
  switch (metric) {
    case 'weightKg':
    case 'bmi':
      if (goal === 'weight_loss') return 'lower';
      if (goal === 'weight_gain') return 'higher';
      // maintenance included: the aim is to stay put, and neither direction is
      // an improvement on that.
      return 'none';

    case 'bodyFatPercent':
    case 'fatMassKg':
    case 'waistCm':
      if (goal === 'weight_loss' || goal === 'maintenance' || goal === 'sports') return 'lower';
      // weight_gain: some of a deliberate gain is fat, and that is the plan.
      return 'none';

    case 'muscleMassKg':
    case 'fatFreeMassKg':
      if (goal === 'medical') return 'none';
      return 'higher';

    case 'visceralFatRating':
      if (goal === 'medical') return 'none';
      return 'lower';

    // Hip circumference on its own says little without the waist beside it, and
    // BMR is a property of the body rather than a target. Both are tracked and
    // neither is graded.
    case 'hipCm':
    case 'basalMetabolicRateKcal':
      return 'none';
  }
}

/**
 * The height a measurement's BMI is computed from.
 *
 * ## The record wins, and the machine is the fallback
 *
 * `clients.height_cm` is the authority — the schema says so on the column
 * itself: "an analyser's height is whatever the operator typed into it, and is
 * wrong often enough to be worth catching." The measurement's own height is
 * used only when the record has none, which is the normal case for a
 * hand-typed weigh-in that recorded no height.
 *
 * ⚠ **This used to be the other way around, and it put two BMIs on one
 * record.** The intake tab computes BMI from the client's height; this tab
 * computed it from the height typed into the machine. On a real client the two
 * were 156 cm and 157 cm, so the same weight on the same day read 29.7 on one
 * tab and 29.3 on the other — with no way for a dietitian to tell which was
 * the app's answer. Two screens disagreeing about one number is worse than
 * either answer being slightly off.
 *
 * What the old order bought was history: a past visit stayed reproducible from
 * its own row, and correcting a height today could not rewrite last year's
 * BMI. That is a real property and it is not gone — the machine's height is
 * still stored on the row, `bmiDisagreement` still checks our BMI against the
 * one the sheet printed, and the upload still warns when the two heights
 * differ. What changed is which of them the *screens* read, and they now read
 * the same one.
 */
export function measurementHeightCm(
  measurement: Pick<ComparableMeasurement, 'heightCm'>,
  subject: MeasurementSubject,
): number | null {
  return subject.heightCm ?? measurement.heightCm;
}

/**
 * One metric's value on one measurement.
 *
 * `bmi` is derived here rather than stored, through the same `bmi()` the intake
 * screen and the plan context panel already use — so a client's BMI cannot read
 * one way on this tab and another way on that one.
 */
export function measurementValue(
  measurement: ComparableMeasurement,
  metric: MeasurementMetric,
  subject: MeasurementSubject,
): number | null {
  if (metric === 'bmi') {
    return bmi(measurement.weightKg, measurementHeightCm(measurement, subject));
  }

  return measurement[metric];
}

/**
 * The gap between the BMI we compute and the one the machine printed, when both
 * exist and they disagree.
 *
 * An analyser computes BMI from the height its operator typed in. A difference
 * here therefore means the two heights differ, which is worth showing a person
 * — it is usually a typo at one end or the other, and it is the cheapest error
 * detector this feature has. Returns null when they agree closely enough to be
 * rounding, or when either side is missing.
 */
export function bmiDisagreement(
  ourBmi: number | null,
  deviceBmi: number | null,
  tolerance = 0.2,
): number | null {
  if (ourBmi === null || deviceBmi === null) return null;

  const gap = ourBmi - deviceBmi;
  return Math.abs(gap) > tolerance ? gap : null;
}

export type MeasurementChange = {
  metric: MeasurementMetric;
  /** The earlier reading. Null when that visit did not record this figure. */
  from: number | null;
  /** The later reading. Null when this visit did not record this figure. */
  to: number | null;
  /**
   * `to - from`, or null when either side is missing.
   *
   * **Null, never zero.** A previous visit that recorded no body fat and one
   * that recorded exactly the same body fat are different facts, and only one of
   * them is "no change".
   */
  delta: number | null;
  intent: MetricIntent;
  verdict: ChangeVerdict;
};

/**
 * Grades one change against what the goal wanted.
 *
 * Order matters: an unjudged metric is unjudged even when it moved a long way,
 * and a movement smaller than the metric's `epsilon` is `unchanged` rather than
 * a very small improvement.
 */
export function judgeChange(
  metric: MeasurementMetric,
  delta: number | null,
  intent: MetricIntent,
): ChangeVerdict {
  if (delta === null) return 'unjudged';
  if (Math.abs(delta) < METRIC_SETTINGS[metric].epsilon) return 'unchanged';
  if (intent === 'none') return 'unjudged';

  const movedDown = delta < 0;
  return movedDown === (intent === 'lower') ? 'improved' : 'declined';
}

/** Every metric's change between two measurements, `from` being the earlier one. */
export function compareMeasurements(
  from: ComparableMeasurement,
  to: ComparableMeasurement,
  subject: MeasurementSubject,
): MeasurementChange[] {
  return MEASUREMENT_METRICS.map((metric) => {
    const before = measurementValue(from, metric, subject);
    const after = measurementValue(to, metric, subject);
    const delta = before === null || after === null ? null : after - before;
    const intent = metricIntent(metric, subject.goal);

    return { metric, from: before, to: after, delta, intent, verdict: judgeChange(metric, delta, intent) };
  });
}

/** Picks one metric out of a comparison. */
export function changeFor(
  changes: readonly MeasurementChange[],
  metric: MeasurementMetric,
): MeasurementChange | null {
  return changes.find((change) => change.metric === metric) ?? null;
}

/**
 * Which story this client's progress tells, as a key the UI turns into a
 * sentence.
 *
 * The choice of *which fact to lead with* is logic and belongs here; the
 * wording is Arabic and English and belongs in messages. Splitting it the other
 * way would either put translation in this module or put clinical judgement in
 * a component.
 *
 * `fatDownMuscleUp` is the headline the machine is bought for: it is the one
 * thing a bathroom scale cannot tell you, and it is invisible on a weight chart.
 */
export type ProgressNarrative =
  | 'notEnoughData'
  | 'fatDownMuscleUp'
  | 'fatDown'
  | 'weightDown'
  | 'weightUpMuscleUp'
  | 'weightUp'
  | 'holding';

export function progressNarrative(changes: readonly MeasurementChange[]): ProgressNarrative {
  const weight = changeFor(changes, 'weightKg');
  const fat = changeFor(changes, 'fatMassKg');
  const muscle = changeFor(changes, 'muscleMassKg');

  if (!weight || weight.delta === null) return 'notEnoughData';

  // Both read the raw delta rather than the verdict, deliberately: the verdict
  // is `unjudged` for a weight_gain client, and "the gain was muscle, not fat"
  // is exactly the sentence that client should hear. The direction of the
  // number is a fact; only whether it is *good* depends on the goal.
  // A metric this pair of visits cannot answer reads as 0 — "no movement I can
  // see" — which falls through to the weight-only narratives below rather than
  // claiming a body composition story the data does not support.
  const moved = (change: MeasurementChange | null) => change?.delta ?? 0;

  const fatFell = moved(fat) < -METRIC_SETTINGS.fatMassKg.epsilon;
  const muscleRose = moved(muscle) > METRIC_SETTINGS.muscleMassKg.epsilon;

  if (fatFell && muscleRose) return 'fatDownMuscleUp';
  if (fatFell) return 'fatDown';

  if (weight.verdict === 'unchanged') return 'holding';

  if (weight.delta < 0) return 'weightDown';
  return muscleRose ? 'weightUpMuscleUp' : 'weightUp';
}

export type MeasurementProgress = {
  latest: ComparableMeasurement | null;
  /** The visit before the latest. Null on a client's very first measurement. */
  previous: ComparableMeasurement | null;
  /** The oldest measurement on record — what "since the start" is measured from. */
  baseline: ComparableMeasurement | null;
  sinceLast: MeasurementChange[];
  sinceStart: MeasurementChange[];
  narrativeSinceLast: ProgressNarrative;
  narrativeSinceStart: ProgressNarrative;
  count: number;
};

/**
 * The whole Measurements tab's arithmetic, in one pass.
 *
 * Takes measurements **newest first** — the order `listMeasurements` returns
 * them in, so the caller never re-sorts and the two can never disagree about
 * which one is latest.
 *
 * A single measurement is a real state, not an error: there is a latest, there
 * is nothing to compare it to, and both change lists come back empty rather
 * than comparing the visit against itself.
 */
export function summariseProgress(
  measurements: readonly ComparableMeasurement[],
  subject: MeasurementSubject,
): MeasurementProgress {
  const latest = measurements[0] ?? null;
  const previous = measurements[1] ?? null;
  const baseline = measurements.length > 1 ? measurements[measurements.length - 1]! : null;

  const sinceLast = latest && previous ? compareMeasurements(previous, latest, subject) : [];
  const sinceStart = latest && baseline ? compareMeasurements(baseline, latest, subject) : [];

  return {
    latest,
    previous,
    baseline,
    sinceLast,
    sinceStart,
    narrativeSinceLast: sinceLast.length ? progressNarrative(sinceLast) : 'notEnoughData',
    narrativeSinceStart: sinceStart.length ? progressNarrative(sinceStart) : 'notEnoughData',
    count: measurements.length,
  };
}

export type TrendPoint = {
  id: string;
  measuredOn: IsoDate;
  measuredAtMinute: number;
  value: number;
};

/**
 * One metric across every visit that recorded it, oldest first for plotting.
 *
 * Visits missing the metric are **dropped, not zeroed**: a client weighed by
 * hand between two analyser sessions has no body-fat figure for that day, and
 * plotting it as zero would draw a collapse that never happened.
 */
export function trendSeries(
  measurements: readonly ComparableMeasurement[],
  metric: MeasurementMetric,
  subject: MeasurementSubject,
): TrendPoint[] {
  return measurements
    .map((measurement) => ({
      id: measurement.id,
      measuredOn: measurement.measuredOn,
      measuredAtMinute: measurement.measuredAtMinute,
      value: measurementValue(measurement, metric, subject),
    }))
    .filter((point): point is TrendPoint => point.value !== null)
    .sort(compareByWhenMeasured);
}

/**
 * Chronological order over the stored wall clock, oldest first.
 *
 * ISO dates are zero-padded, so a string comparison is already a correct
 * date comparison — the same property `lib/iso-date.ts` documents and several
 * call sites already rely on. The minute only breaks a tie within one day.
 */
export function compareByWhenMeasured(
  a: Pick<ComparableMeasurement, 'measuredOn' | 'measuredAtMinute'>,
  b: Pick<ComparableMeasurement, 'measuredOn' | 'measuredAtMinute'>,
): number {
  if (a.measuredOn !== b.measuredOn) return a.measuredOn < b.measuredOn ? -1 : 1;
  return a.measuredAtMinute - b.measuredAtMinute;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole days from one measurement date to another, both `YYYY-MM-DD`. Negative
 * when `to` is the earlier of the two.
 *
 * The gap a dietitian reads as "six weeks since the last check", and the figure
 * the dashboard's overdue sweep compares against a review interval. The time of
 * day is deliberately not part of it: nobody means "41.7 days".
 *
 * ⚠ The third copy of this three-line function in the repository — see
 * `booking/visit-stats.ts` and `billing/subscription.ts`. It is duplicated
 * rather than shared because pulling it into `lib/iso-date.ts` is a change to
 * two other features' imports, which does not belong in this one.
 */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcInstant(to).getTime() - toUtcInstant(from).getTime()) / MS_PER_DAY);
}

/**
 * How far apart in the clinic's day two readings have to be before the app
 * says so, in minutes.
 *
 * Four hours: the difference between a fasted first-thing reading and one taken
 * after lunch, which is the shift a real clinic day produces and the one that
 * moves body water.
 */
export const CLOCK_DRIFT_MINUTES = 240;

/**
 * Two visits measured at very different times of day, when they were.
 *
 * ## Why this exists
 *
 * Impedance is measured through body water, so a BIA reading moves with
 * hydration and with what is in the gut. The standardisation literature is
 * consistent about it: repeat measurements are only comparable when the
 * conditions are — same posture, same device, similar prandial and hydration
 * state. A client weighed fasted at 07:00 in March and after lunch at 14:00 in
 * April can show a kilogram of "gain" that is water, and this panel would draw
 * it as a confident amber badge.
 *
 * The app cannot know what somebody drank. It does know what time each reading
 * was taken, because an analyser prints its own clock and the parser keeps it —
 * which is most of why that column survived the form dropping its time field.
 * So the one honest thing available is to name the gap and let the dietitian
 * discount the comparison themselves.
 *
 * Returns null when either time is unknown. Minute 0 is exactly that: a
 * hand-typed weigh-in records no clock, and treating midnight as a real reading
 * time would make every manual entry look like a 3am outlier.
 */
export function clockDrift(
  a: Pick<ComparableMeasurement, 'measuredAtMinute'>,
  b: Pick<ComparableMeasurement, 'measuredAtMinute'>,
): number | null {
  if (a.measuredAtMinute === 0 || b.measuredAtMinute === 0) return null;

  const gap = Math.abs(a.measuredAtMinute - b.measuredAtMinute);
  return gap >= CLOCK_DRIFT_MINUTES ? gap : null;
}
