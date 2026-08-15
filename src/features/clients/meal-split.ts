/**
 * Scaling whole-number meal-calorie shares so they sum to exactly 100.
 *
 * Pure, no React and no database — the same discipline as `targets.ts`, so the
 * rounding rules are pinned down by a test rather than discovered in the UI.
 *
 * Mirrors what the server already does on save (`slotBudgets` normalises the
 * shares); this just makes that adjustment visible and one-click for the
 * dietitian, instead of a silent correction they never see.
 */
export function balanceToHundred(percents: readonly number[]): number[] {
  const n = percents.length;
  if (n === 0) return [];

  // Negative shares are meaningless here and would poison the proportional
  // scale, so they are floored to zero before anything else.
  const clamped = percents.map((p) => (p > 0 ? p : 0));
  const total = clamped.reduce((sum, p) => sum + p, 0);

  // Nothing to scale from: an all-zero (or all-negative) schedule splits the day
  // evenly rather than staying at zero, which is the sensible default a dietitian
  // pressing "balance" expects.
  const scaled =
    total <= 0
      ? Array.from({ length: n }, () => Math.floor(100 / n))
      : clamped.map((p) => Math.round((p / total) * 100));

  // Whole-number rounding rarely lands on exactly 100. The remainder is added to
  // the largest entry, where a point or two is least noticeable and cannot make a
  // small meal look wrong.
  const drift = 100 - scaled.reduce((sum, p) => sum + p, 0);
  if (drift !== 0) {
    let largest = 0;
    for (let i = 1; i < scaled.length; i += 1) {
      if (scaled[i]! > scaled[largest]!) largest = i;
    }
    scaled[largest]! += drift;
  }

  return scaled;
}
