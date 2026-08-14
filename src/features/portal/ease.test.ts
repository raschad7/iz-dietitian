import { describe, expect, test } from 'bun:test';

import { easeSweep } from './ease';

/**
 * The curve is `cubic-bezier(.2, .6, .2, 1)` solved by bisection, so what is
 * worth pinning is the shape rather than any one sample: it has to start at
 * zero, end at one, never go backwards, and — since both control points pull
 * it upward early — sit above the straight line the whole way. A tween that
 * silently became linear, or that overshot past 1 and printed 101%, would still
 * look plausible in a screenshot and is exactly what these catch.
 */
describe('easeSweep', () => {
  test('is pinned at both ends', () => {
    expect(easeSweep(0)).toBe(0);
    expect(easeSweep(1)).toBe(1);
  });

  test('clamps outside the unit interval', () => {
    expect(easeSweep(-0.5)).toBe(0);
    expect(easeSweep(1.5)).toBe(1);
  });

  test('never decreases, and never leaves [0, 1]', () => {
    let previous = 0;

    for (let step = 0; step <= 100; step += 1) {
      const value = easeSweep(step / 100);

      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value).toBeLessThanOrEqual(1);
      previous = value;
    }
  });

  test('leads the linear ramp — the count-up is front-loaded', () => {
    // Both control points sit at x=0.2 with y at 0.6 and 1, so the curve is
    // well above `y = x` across the middle. If someone swaps in a plain
    // ease-in, these flip.
    expect(easeSweep(0.25)).toBeGreaterThan(0.25);
    expect(easeSweep(0.5)).toBeGreaterThan(0.5);
    expect(easeSweep(0.75)).toBeGreaterThan(0.75);
  });

  test('is most of the way there by the halfway point', () => {
    // The practical consequence, and the reason `COUNT_MS` is not one of the
    // duration tokens: the curve spends its back half settling, so only the
    // opening stretch of any duration is perceived as counting. That is what
    // made 220ms read as a flicker.
    expect(easeSweep(0.5)).toBeGreaterThan(0.7);
  });
});

