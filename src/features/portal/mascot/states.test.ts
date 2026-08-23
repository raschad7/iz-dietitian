import { describe, expect, test } from 'bun:test';

import {
  clampProgress,
  FINAL_MASCOT_STATE,
  FIRST_MASCOT_STATE,
  getMascotMilestone,
  getMascotProgression,
  getMascotState,
  mascotAdvanced,
  mascotCelebrationFor,
  MASCOT_MILESTONES,
  MASCOT_STATES,
  MASCOT_THRESHOLDS,
  type MascotMilestone,
  type MascotState,
} from './states';

describe('getMascotState', () => {
  test('an unreported week reads as the beginning, not as an error', () => {
    expect(getMascotState(null)).toBe(FIRST_MASCOT_STATE);
  });

  test('each band maps to its drawing at its own lower bound', () => {
    expect(getMascotState(0)).toBe(1);
    expect(getMascotState(0.1)).toBe(2);
    expect(getMascotState(0.25)).toBe(3);
    expect(getMascotState(0.45)).toBe(4);
    expect(getMascotState(0.7)).toBe(5);
    expect(getMascotState(0.9)).toBe(6);
  });

  test('a value just under a bound stays in the band below it', () => {
    expect(getMascotState(0.0999)).toBe(1);
    expect(getMascotState(0.2499)).toBe(2);
    expect(getMascotState(0.4499)).toBe(3);
    expect(getMascotState(0.6999)).toBe(4);
    expect(getMascotState(0.8999)).toBe(5);
  });

  test('a fully kept week is the last drawing', () => {
    expect(getMascotState(1)).toBe(FINAL_MASCOT_STATE);
  });

  /*
    The bands are searched top-down with `find`, so an out-of-order table would
    silently return the wrong drawing for every fraction rather than fail. This
    is the test that would catch a threshold being edited into the wrong row.
  */
  test('the threshold table is ordered highest bound first', () => {
    const bounds = MASCOT_THRESHOLDS.map((band) => band.from);
    expect(bounds).toEqual([...bounds].sort((a, b) => b - a));
  });

  test('every threshold names a state that exists, and every state is reachable', () => {
    const named = MASCOT_THRESHOLDS.map((band) => band.state);
    expect([...named].sort()).toEqual([...MASCOT_STATES].sort());
  });
});

describe('clampProgress', () => {
  test('holds the 0-1 contract against anything a caller passes', () => {
    expect(clampProgress(-3)).toBe(0);
    expect(clampProgress(4)).toBe(1);
    expect(clampProgress(0.5)).toBe(0.5);
  });

  test('the infinities clamp to their own end; only NaN falls back to the floor', () => {
    expect(clampProgress(Number.POSITIVE_INFINITY)).toBe(1);
    expect(clampProgress(Number.NEGATIVE_INFINITY)).toBe(0);
    expect(clampProgress(Number.NaN)).toBe(0);
  });

  test('an out-of-range fraction still picks a real drawing', () => {
    expect(getMascotState(-1)).toBe(FIRST_MASCOT_STATE);
    expect(getMascotState(2)).toBe(FINAL_MASCOT_STATE);
    expect(getMascotState(Number.NaN)).toBe(FIRST_MASCOT_STATE);
  });
});

describe('getMascotMilestone', () => {
  test('below the first milestone there is none', () => {
    expect(getMascotMilestone(null)).toBeNull();
    expect(getMascotMilestone(0)).toBeNull();
    expect(getMascotMilestone(0.24)).toBeNull();
  });

  test('reports the highest passed, not the first cleared', () => {
    expect(getMascotMilestone(0.25)).toBe(25);
    expect(getMascotMilestone(0.6)).toBe(50);
    expect(getMascotMilestone(0.99)).toBe(75);
    expect(getMascotMilestone(1)).toBe(100);
  });

  test('the milestone list is ascending, which the top-down search assumes', () => {
    expect([...MASCOT_MILESTONES]).toEqual([...MASCOT_MILESTONES].sort((a, b) => a - b));
  });
});

describe('getMascotProgression', () => {
  test('derives state, milestone and completion from one reading', () => {
    expect(getMascotProgression(0.75)).toEqual({
      progress: 0.75,
      state: 5,
      milestone: 75,
      complete: false,
    });
  });

  test('an unreported week is the beginning and is not complete', () => {
    expect(getMascotProgression(null)).toEqual({
      progress: null,
      state: 1,
      milestone: null,
      complete: false,
    });
  });

  test('clamps before deriving, so an over-range reading is merely complete', () => {
    expect(getMascotProgression(1.4)).toEqual({
      progress: 1,
      state: 6,
      milestone: 100,
      complete: true,
    });
  });
});

describe('mascotAdvanced', () => {
  test('only forward counts', () => {
    expect(mascotAdvanced(2, 4)).toBe(true);
    expect(mascotAdvanced(4, 4)).toBe(false);
    expect(mascotAdvanced(4, 2)).toBe(false);
  });
});

describe('mascotCelebrationFor', () => {
  /** A reading, described the way the hook rebuilds it for the comparison. */
  function reading(state: MascotState, milestone: MascotMilestone | null, complete = false) {
    return { state, milestone, complete };
  }

  test('an unchanged reading earns nothing — this is the once-per-render guard', () => {
    expect(
      mascotCelebrationFor({
        previousState: 4,
        previousMilestone: 50,
        current: reading(4, 50),
      }),
    ).toBe('none');
  });

  test('a step up between drawings, with no new milestone, is an evolve', () => {
    expect(
      mascotCelebrationFor({
        previousState: 4,
        previousMilestone: 50,
        current: reading(5, 50),
      }),
    ).toBe('evolve');
  });

  test('crossing a milestone outranks the state change it came with', () => {
    expect(
      mascotCelebrationFor({
        previousState: 3,
        previousMilestone: 25,
        current: reading(4, 50),
      }),
    ).toBe('milestone');
  });

  test('the first milestone is new even though none was celebrated before', () => {
    expect(
      mascotCelebrationFor({
        previousState: 2,
        previousMilestone: null,
        current: reading(3, 25),
      }),
    ).toBe('milestone');
  });

  test('a fully kept week is a goal, not a milestone', () => {
    expect(
      mascotCelebrationFor({
        previousState: 5,
        previousMilestone: 75,
        current: reading(6, 100, true),
      }),
    ).toBe('goal');
  });

  test('a week already celebrated at 100% is not celebrated again', () => {
    expect(
      mascotCelebrationFor({
        previousState: 6,
        previousMilestone: 100,
        current: reading(6, 100, true),
      }),
    ).toBe('none');
  });

  /*
    §24: the mascot never reacts to a client losing ground. A missed day drags
    the week's average down, and the only correct response is silence.
  */
  test('falling back is silent — no animation, no comment', () => {
    expect(
      mascotCelebrationFor({
        previousState: 5,
        previousMilestone: 75,
        current: reading(2, null),
      }),
    ).toBe('none');
  });

  test('re-crossing a milestone already celebrated stays silent', () => {
    expect(
      mascotCelebrationFor({
        previousState: 2,
        previousMilestone: 75,
        current: reading(4, 50),
      }),
    ).toBe('evolve');
  });

  /*
    The pair above and below together are the asymmetry the hook is built on:
    the remembered *state* follows the client down, so climbing back out of a
    bad patch animates, while the remembered *milestone* never falls, so 50%
    is only ever marked once in a week.
  */
  test('climbing back up to a drawing already seen still evolves', () => {
    expect(
      mascotCelebrationFor({
        previousState: 2,
        previousMilestone: 50,
        current: reading(4, 50),
      }),
    ).toBe('evolve');
  });
});
