import type { EyePose } from './eye-choreography';

/**
 * The home screen's daily meal-progress scale — five bands over a single
 * day's meal fraction (the same number {@link adherenceFraction} in
 * `adherence.ts` gives `TodayRing`).
 *
 * Deliberately separate from `states.ts`' six-drawing scale: that one reads a
 * *week's* average adherence for the reactive mascot's own tier baseline.
 * This one reads *today's* meal count alone, so a client on day one of a
 * fresh week and a client mid a strong week read the same tier 1 the moment
 * each has eaten one of five meals today — the two scales must never be
 * confused or compared.
 */
export const ENERGY_TIERS = [0, 1, 2, 3, 4] as const;
export type EnergyTier = (typeof ENERGY_TIERS)[number];

export type EnergyMessageKey = 'empty' | 'starting' | 'halfway' | 'strong' | 'complete';

/**
 * Each band's lower bound, walked from the top down — the single statement
 * of the mapping, same pattern as `MASCOT_THRESHOLDS` in `states.ts`.
 *
 * Bands land on the exact meal fractions a 5-meal day produces (0, 0.2, 0.4,
 * 0.6, 0.8, 1) but are stated as ranges so a day with a different meal count
 * still reads sensibly: 1 of 3 meals (33%) still earns the "starting" tier,
 * not the empty one.
 */
const ENERGY_THRESHOLDS: ReadonlyArray<{ from: number; tier: EnergyTier; message: EnergyMessageKey }> = [
  { from: 1, tier: 4, message: 'complete' },
  { from: 0.5, tier: 3, message: 'strong' },
  { from: 0.3, tier: 2, message: 'halfway' },
  { from: Number.EPSILON, tier: 1, message: 'starting' },
  { from: 0, tier: 0, message: 'empty' },
];

function clampFraction(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

/** `null` — nothing to report yet — reads as the same empty tier as zero. */
export function getEnergyTier(fraction: number | null): EnergyTier {
  if (fraction === null) return 0;
  const value = clampFraction(fraction);
  return ENERGY_THRESHOLDS.find((band) => value >= band.from)?.tier ?? 0;
}

/** The supporting-message key a fraction earns — see `portal.progress.today.energy.*`. */
export function getEnergyMessageKey(fraction: number | null): EnergyMessageKey {
  if (fraction === null) return 'empty';
  const value = clampFraction(fraction);
  return ENERGY_THRESHOLDS.find((band) => value >= band.from)?.message ?? 'empty';
}

/**
 * The eyes' own emotional read per tier — tired and downward at empty,
 * proud and upward at complete. Nothing else on the mark moves; see
 * `today-energy-mascot.tsx`.
 */
const ENERGY_EYE_POSES: Record<EnergyTier, EyePose> = {
  0: { gazeX: 0, gazeY: 14, openness: 0.55, tilt: -3 },
  1: { gazeX: 0, gazeY: 7, openness: 0.75, tilt: -1 },
  2: { gazeX: 0, gazeY: 0, openness: 1, tilt: 0 },
  3: { gazeX: 0, gazeY: -6, openness: 1.12, tilt: 2 },
  /*
   * Complete: a fully closed, happy squint rather than the subtle lean the
   * other tiers use — a near-zero `openness` flattens the existing oval into
   * a shut, joyful arc, the strongest read this shape can give without
   * adding a feature the mark does not already draw (no mouth, no eyebrows
   * — see the module doc). `tilt` is pushed further than any other tier so
   * the flattened arc reads as curving upward, not just as a squashed
   * ellipse.
   */
  4: { gazeX: 0, gazeY: -9, openness: 0.1, tilt: 10 },
};

export function energyEyePose(tier: EnergyTier): EyePose {
  return ENERGY_EYE_POSES[tier];
}
