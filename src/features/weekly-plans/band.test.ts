import { describe, expect, test } from 'bun:test';

import { bandGeometry } from './band';

describe('bandGeometry', () => {
  // The track runs to 125% of target, so a 2000 target spans 2500: the
  // tolerance sits at 1800-2200, which is 72%-88% of the track.
  test('places the tolerance span against the track ceiling', () => {
    const band = bandGeometry(2005, 2000);

    expect(band?.rangeStart).toBeCloseTo(72, 5);
    expect(band?.rangeWidth).toBeCloseTo(16, 5);
  });

  test('places the marker at the value position along the track', () => {
    expect(bandGeometry(2133, 2000)?.marker).toBeCloseTo(85.32, 2);
    expect(bandGeometry(1903, 2000)?.marker).toBeCloseTo(76.12, 2);
  });

  test('carries the drift state so the marker and the total agree', () => {
    expect(bandGeometry(2005, 2000)?.state).toBeNull();
    expect(bandGeometry(2380, 2000)?.state).toBe('over');
    expect(bandGeometry(1600, 2000)?.state).toBe('under');
  });

  // A day can exceed the ceiling. The marker pins to the end rather than
  // overflowing the track, and the state still reports the miss.
  test('pins a marker past the ceiling to the end of the track', () => {
    const band = bandGeometry(4000, 2000);

    expect(band?.marker).toBe(100);
    expect(band?.state).toBe('over');
  });

  test('pins a marker at or below zero to the start of the track', () => {
    expect(bandGeometry(0, 2000)?.marker).toBe(0);
  });

  // A second target, so the geometry is pinned to the parameter rather than
  // to the 2000 every other case happens to use. rangeStart and rangeWidth
  // come out to the same 72/16 as the 2000 case by construction — the target
  // cancels out of both ratios — so it is the marker that actually catches a
  // hardcoded target here.
  test('scales the whole band to whatever the target is', () => {
    const band = bandGeometry(1290, 1200);

    expect(band?.rangeStart).toBeCloseTo(72, 5);
    expect(band?.rangeWidth).toBeCloseTo(16, 5);
    expect(band?.marker).toBeCloseTo(86, 5);
  });

  // An empty plan and a client with no computable target both reach here.
  test('has no geometry without a target', () => {
    expect(bandGeometry(500, 0)).toBeNull();
  });
});
