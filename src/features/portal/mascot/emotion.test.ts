import { describe, expect, test } from 'bun:test';

import { resolveMascotEmotion, type MascotSignals } from './emotion';
import { getMascotProgression } from './states';

function signals(overrides: Partial<MascotSignals> = {}): MascotSignals {
  return {
    progression: getMascotProgression(0.5),
    celebration: 'none',
    meal: null,
    streak: null,
    inactivity: 'active',
    isLoading: false,
    isEmpty: false,
    welcomePending: false,
    ...overrides,
  };
}

describe('resolveMascotEmotion', () => {
  test('with nothing going on, the mascot rests', () => {
    expect(resolveMascotEmotion(signals()).emotion).toBe('resting');
  });

  test('the welcome outranks everything else, including a completed goal', () => {
    const resolution = resolveMascotEmotion(
      signals({ welcomePending: true, progression: getMascotProgression(1) }),
    );
    expect(resolution.emotion).toBe('welcome');
  });

  test('a completed week wins over a milestone reading the same fraction', () => {
    const resolution = resolveMascotEmotion(
      signals({ progression: getMascotProgression(1), celebration: 'milestone' }),
    );
    expect(resolution.emotion).toBe('goalComplete');
  });

  test('a lost streak outranks a merely at-risk one', () => {
    const resolution = resolveMascotEmotion(
      signals({
        streak: { current: 0, atRisk: false, justLost: true, justRecovered: false, milestoneReached: false },
      }),
    );
    expect(resolution.emotion).toBe('sad');
    expect(resolution.settleInto).toBe('encouraging');
  });

  test('a missed meal outranks a merely due one', () => {
    const resolution = resolveMascotEmotion(signals({ meal: 'missed' }));
    expect(resolution.emotion).toBe('missedMeal');
  });

  test('a due meal outranks a streak recovery', () => {
    const resolution = resolveMascotEmotion(
      signals({
        meal: 'due',
        streak: { current: 1, atRisk: false, justLost: false, justRecovered: true, milestoneReached: false },
      }),
    );
    expect(resolution.emotion).toBe('mealReminder');
  });

  test('loading and an empty screen fall back once nothing more urgent applies', () => {
    expect(resolveMascotEmotion(signals({ isLoading: true })).emotion).toBe('thinking');
    expect(resolveMascotEmotion(signals({ isEmpty: true })).emotion).toBe('curious');
    expect(resolveMascotEmotion(signals({ isLoading: true, isEmpty: true })).emotion).toBe('thinking');
  });

  test('sleepy only applies once nothing else does', () => {
    expect(resolveMascotEmotion(signals({ inactivity: 'sleepy' })).emotion).toBe('sleepy');
    expect(resolveMascotEmotion(signals({ inactivity: 'sleepy', meal: 'due' })).emotion).toBe('mealReminder');
  });

  test('every temporary emotion holds for a positive duration and settles somewhere', () => {
    const resolution = resolveMascotEmotion(signals({ meal: 'due' }));
    expect(resolution.temporary).toBe(true);
    expect(resolution.holdMs).toBeGreaterThan(0);
    expect(resolution.settleInto).toBe('resting');
  });
});
