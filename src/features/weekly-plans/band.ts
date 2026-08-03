import { DAY_TOLERANCE, driftState, type Drift } from './drift';

/**
 * Where the track ends, as a multiple of the daily target.
 *
 * A plain progress bar capped at the target renders a 2133 day and a 2000 day
 * identically — both full — which is the one comparison the dietitian is
 * scanning for. Running the track past the target gives the overshoot somewhere
 * to be drawn.
 *
 * This must stay greater than `1 + DAY_TOLERANCE` (from `./drift`) so the
 * tolerance span's upper edge lands before the ceiling. If `DAY_TOLERANCE`
 * ever rises to meet or pass `CEILING - 1`, `at()` silently clamps that edge
 * to 100 and the rendered tolerance span goes narrower than the real
 * tolerance, with no error and no failing test to catch it.
 */
const CEILING = 1.25;

export type BandGeometry = {
  /** Percent along the track where the tolerance span begins. */
  rangeStart: number;
  /** The tolerance span's width, in percent of the track. */
  rangeWidth: number;
  /** Percent along the track where the day actually landed. */
  marker: number;
  state: Drift;
};

/**
 * The band's three positions, as percentages of the track.
 *
 * Percentages rather than pixels so the band is width-agnostic, and so the
 * caller sets them as inline-start offsets — which mirror in Arabic without an
 * override, per the RTL rules.
 */
export function bandGeometry(total: number, target: number): BandGeometry | null {
  if (target <= 0) return null;

  const span = target * CEILING;
  const at = (value: number) => Math.min(100, Math.max(0, (value / span) * 100));

  const rangeStart = at(target * (1 - DAY_TOLERANCE));

  return {
    rangeStart,
    rangeWidth: at(target * (1 + DAY_TOLERANCE)) - rangeStart,
    marker: at(total),
    state: driftState(total, target, DAY_TOLERANCE),
  };
}
