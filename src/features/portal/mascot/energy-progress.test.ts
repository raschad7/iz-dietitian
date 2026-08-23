import { describe, expect, test } from 'bun:test';

import { energyEyePose, getEnergyMessageKey, getEnergyTier } from './energy-progress';

describe('getEnergyTier', () => {
  test('nothing reported yet reads as the empty tier', () => {
    expect(getEnergyTier(null)).toBe(0);
  });

  test('a 5-meal day lands each tier at its own fraction', () => {
    expect(getEnergyTier(0)).toBe(0);
    expect(getEnergyTier(0.2)).toBe(1);
    expect(getEnergyTier(0.4)).toBe(2);
    expect(getEnergyTier(0.6)).toBe(3);
    expect(getEnergyTier(0.8)).toBe(3);
    expect(getEnergyTier(1)).toBe(4);
  });

  test('a value just under a bound stays in the band below it', () => {
    expect(getEnergyTier(0.2999)).toBe(1);
    expect(getEnergyTier(0.4999)).toBe(2);
    expect(getEnergyTier(0.9999)).toBe(3);
  });

  test('a day with a different meal count still bands sensibly', () => {
    expect(getEnergyTier(1 / 3)).toBe(2); // 1 of 3 meals
  });

  test('clamps out-of-range and NaN input rather than throwing', () => {
    expect(getEnergyTier(-1)).toBe(0);
    expect(getEnergyTier(2)).toBe(4);
    expect(getEnergyTier(NaN)).toBe(0);
  });
});

describe('getEnergyMessageKey', () => {
  test('mirrors the tier boundaries', () => {
    expect(getEnergyMessageKey(null)).toBe('empty');
    expect(getEnergyMessageKey(0)).toBe('empty');
    expect(getEnergyMessageKey(0.2)).toBe('starting');
    expect(getEnergyMessageKey(0.4)).toBe('halfway');
    expect(getEnergyMessageKey(0.8)).toBe('strong');
    expect(getEnergyMessageKey(1)).toBe('complete');
  });
});

describe('energyEyePose', () => {
  test('gaze moves from downward at empty to upward at complete', () => {
    expect(energyEyePose(0).gazeY).toBeGreaterThan(0);
    expect(energyEyePose(4).gazeY).toBeLessThan(0);
  });

  test('every tier has an answer', () => {
    for (const tier of [0, 1, 2, 3, 4] as const) {
      expect(energyEyePose(tier)).toBeDefined();
    }
  });
});
