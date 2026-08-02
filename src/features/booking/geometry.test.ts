import { describe, expect, test } from 'bun:test';

import {
  INLINE_HEIGHT_PX,
  MIN_PX_PER_SLOT,
  PX_PER_HOUR,
  PX_PER_SLOT,
  SUBDIVISION_MIN_PX_PER_SLOT,
  blockBox,
  blockTypeScale,
  clampToDay,
  fitPxPerSlot,
  floorToSlot,
  gridHeight,
  minuteToY,
  minutesToPx,
  pointerToMinute,
  pxToMinutes,
  snapToSlot,
  yToMinute,
} from './geometry';
import { SLOT_MINUTES } from './validation';

const OPEN = 8 * 60; // 08:00
const CLOSE = 18 * 60; // 18:00

describe('the constant everything derives from', () => {
  test('an hour is four slots', () => {
    expect(PX_PER_HOUR).toBe(PX_PER_SLOT * 4);
    expect(PX_PER_HOUR).toBe(128);
  });

  test('an 08:00–18:00 day is 1280px tall', () => {
    expect(gridHeight(OPEN, CLOSE)).toBe(1280);
  });

  test('a slot is exactly PX_PER_SLOT tall', () => {
    expect(minutesToPx(SLOT_MINUTES)).toBe(PX_PER_SLOT);
  });
});

describe('fitPxPerSlot', () => {
  test('divides the clinic day into the height available', () => {
    // 10 hours is 40 slots; 800px of panel gives 20px each.
    expect(fitPxPerSlot(800, OPEN, CLOSE)).toBe(20);
  });

  test('makes the day exactly fill a panel with room for it, so nothing scrolls', () => {
    const fitted = fitPxPerSlot(1000, OPEN, CLOSE);
    expect(gridHeight(OPEN, CLOSE, fitted)).toBeCloseTo(1000, 6);
  });

  /**
   * The invariant behind "no scrollbar": for any whole-pixel panel tall enough
   * to hold the day, the drawn grid is never taller than the panel. A fraction
   * over is a scrollbar, and the fitted height is multiplied by the slot count,
   * so a rounding error at this end arrives magnified forty times.
   *
   * `useFittedSlotHeight` floors its measurement, which is what makes whole
   * pixels the only input this has to survive.
   */
  test('never draws a grid taller than the panel it was fitted to', () => {
    const slots = (CLOSE - OPEN) / SLOT_MINUTES;

    // From the shortest panel that still fits at the readable minimum, upwards.
    for (let height = slots * MIN_PX_PER_SLOT; height <= 1400; height += 1) {
      expect(gridHeight(OPEN, CLOSE, fitPxPerSlot(height, OPEN, CLOSE))).toBeLessThanOrEqual(height);
    }
  });

  test('leaves no visible gap either — it fills the panel to the pixel', () => {
    for (let height = 800; height <= 1400; height += 1) {
      const drawn = gridHeight(OPEN, CLOSE, fitPxPerSlot(height, OPEN, CLOSE));
      expect(height - drawn).toBeLessThan(1);
    }
  });

  test('refuses to shrink past the readable minimum, and scrolls instead', () => {
    expect(fitPxPerSlot(100, OPEN, CLOSE)).toBe(MIN_PX_PER_SLOT);

    // The consequence, stated rather than implied: a ten-hour day needs 800px
    // of panel to fit. Anything shorter overflows and the timeline scrolls,
    // which is the deliberate trade for keeping the hours readable.
    expect(gridHeight(OPEN, CLOSE, fitPxPerSlot(640, OPEN, CLOSE))).toBe(800);
  });

  test('falls back to the default before anything has been measured', () => {
    expect(fitPxPerSlot(0, OPEN, CLOSE)).toBe(PX_PER_SLOT);
    expect(fitPxPerSlot(800, OPEN, OPEN)).toBe(PX_PER_SLOT);
  });

  test('a shorter clinic day gets taller slots from the same panel', () => {
    const fullDay = fitPxPerSlot(800, OPEN, CLOSE);
    const halfDay = fitPxPerSlot(800, 9 * 60, 13 * 60);

    expect(halfDay).toBeGreaterThan(fullDay);
  });
});

describe('a fitted grid', () => {
  const FITTED = fitPxPerSlot(800, OPEN, CLOSE); // 20px per slot

  test('positions blocks at the fitted scale, not the default', () => {
    expect(blockBox({ startMinute: 9 * 60, durationMinutes: 30 }, OPEN, FITTED)).toEqual({ top: 80, height: 40 });
  });

  test('round-trips a pointer back to the same minute', () => {
    const minute = 11 * 60 + 45;
    const y = minuteToY(minute, OPEN, FITTED);

    expect(yToMinute(y, OPEN, FITTED)).toBeCloseTo(minute, 6);
  });

  test('reads a pointer against the fitted scale', () => {
    // One hour down at 20px/slot is 80px.
    expect(pointerToMinute(200 + 80, 200, OPEN, CLOSE, FITTED)).toBeCloseTo(9 * 60, 6);
  });

  test('a pointer read at the default scale would land on the wrong hour', () => {
    // The bug this parameter exists to prevent: 80px is 09:00 on a fitted grid
    // and 08:37 on an unfitted one.
    expect(pointerToMinute(200 + 80, 200, OPEN, CLOSE)).not.toBeCloseTo(9 * 60, 6);
  });
});

describe('minutes ↔ pixels', () => {
  test('round-trips', () => {
    expect(pxToMinutes(minutesToPx(437))).toBeCloseTo(437, 10);
    expect(yToMinute(minuteToY(9 * 60 + 15, OPEN), OPEN)).toBeCloseTo(9 * 60 + 15, 10);
  });

  test('opening time sits at the top of the grid', () => {
    expect(minuteToY(OPEN, OPEN)).toBe(0);
  });

  test('closing time sits at the bottom', () => {
    expect(minuteToY(CLOSE, OPEN)).toBe(gridHeight(OPEN, CLOSE));
  });

  test('09:00 is one hour down', () => {
    expect(minuteToY(9 * 60, OPEN)).toBe(128);
  });
});

describe('snapping', () => {
  test('snapToSlot goes to the nearest quarter hour', () => {
    expect(snapToSlot(542)).toBe(540); // 09:02 → 09:00
    expect(snapToSlot(548)).toBe(555); // 09:08 → 09:15
    expect(snapToSlot(547.5)).toBe(555); // exactly halfway rounds up
  });

  test('floorToSlot stays inside the slot the pointer is in', () => {
    expect(floorToSlot(542)).toBe(540);
    expect(floorToSlot(554)).toBe(540);
    expect(floorToSlot(555)).toBe(555);
  });

  test('an exact boundary is left alone', () => {
    expect(snapToSlot(540)).toBe(540);
    expect(floorToSlot(540)).toBe(540);
  });
});

describe('blockBox', () => {
  test('places a 30-minute 09:00 appointment', () => {
    expect(blockBox({ startMinute: 9 * 60, durationMinutes: 30 }, OPEN)).toEqual({ top: 128, height: 64 });
  });

  test('a 15-minute appointment is exactly one slot tall', () => {
    expect(blockBox({ startMinute: OPEN, durationMinutes: 15 }, OPEN)).toEqual({ top: 0, height: 32 });
  });

  test('a two-hour appointment is 256px', () => {
    expect(blockBox({ startMinute: OPEN, durationMinutes: 120 }, OPEN).height).toBe(256);
  });
});

describe('clampToDay', () => {
  test('leaves an in-hours start alone', () => {
    expect(clampToDay(9 * 60, 30, OPEN, CLOSE)).toBe(9 * 60);
  });

  test('pins a drag above the grid to opening time', () => {
    expect(clampToDay(6 * 60, 30, OPEN, CLOSE)).toBe(OPEN);
  });

  test('slides an appointment back so it ends at closing rather than shortening it', () => {
    expect(clampToDay(CLOSE, 60, OPEN, CLOSE)).toBe(CLOSE - 60);
    expect(clampToDay(17 * 60 + 45, 60, OPEN, CLOSE)).toBe(CLOSE - 60);
  });

  test('an appointment longer than the clinic day pins to opening time', () => {
    expect(clampToDay(12 * 60, 15 * 60, OPEN, CLOSE)).toBe(OPEN);
  });
});

describe('pointerToMinute', () => {
  const GRID_TOP = 200;

  test('reads the pointer against the top of the grid', () => {
    expect(pointerToMinute(GRID_TOP + 128, GRID_TOP, OPEN, CLOSE)).toBe(9 * 60);
  });

  test('clamps above and below the grid', () => {
    expect(pointerToMinute(GRID_TOP - 500, GRID_TOP, OPEN, CLOSE)).toBe(OPEN);
    expect(pointerToMinute(GRID_TOP + 5000, GRID_TOP, OPEN, CLOSE)).toBe(CLOSE);
  });
});

describe('blockTypeScale', () => {
  test('puts the name and time on one row below the two-line threshold', () => {
    expect(blockTypeScale(32).inline).toBe(true);
    expect(blockTypeScale(INLINE_HEIGHT_PX - 1).inline).toBe(true);
  });

  test('a 30-minute block stacks them', () => {
    expect(blockTypeScale(64).inline).toBe(false);
  });

  test('type grows with the block', () => {
    const half = blockTypeScale(64);
    const twoHour = blockTypeScale(256);

    expect(twoHour.nameRem).toBeGreaterThan(half.nameRem);
    expect(twoHour.timeRem).toBeGreaterThan(half.timeRem);
    expect(twoHour.gapRem).toBeGreaterThan(half.gapRem);
  });

  test('stops growing past two hours, so a full-day block is not enormous', () => {
    expect(blockTypeScale(1280).nameRem).toBe(blockTypeScale(256).nameRem);
  });

  test('the name is always at least as large as the time', () => {
    for (const height of [20, 32, 44, 64, 128, 256, 1280]) {
      const scale = blockTypeScale(height);
      expect(scale.nameRem).toBeGreaterThanOrEqual(scale.timeRem);
    }
  });

  test('type never falls below the legible floor, however short the block', () => {
    for (const height of [8, 15, 20, 32, 45]) {
      const scale = blockTypeScale(height);
      expect(scale.nameRem).toBeGreaterThanOrEqual(0.625);
      expect(scale.timeRem).toBeGreaterThanOrEqual(0.625);
    }
  });

  test('every size gets a name size and a time size — neither is ever dropped', () => {
    // The whole point of the inline layout: a block always says who and when.
    for (const height of [8, 20, 32, 45, 46, 64, 128, 256, 1280]) {
      const scale = blockTypeScale(height);
      expect(scale.nameRem).toBeGreaterThan(0);
      expect(scale.timeRem).toBeGreaterThan(0);
    }
  });

  test('type grows monotonically with the block, across the layout change', () => {
    const heights = [20, 32, 45, 46, 64, 128, 256];

    for (let index = 1; index < heights.length; index += 1) {
      const previous = blockTypeScale(heights[index - 1]!);
      const current = blockTypeScale(heights[index]!);

      expect(current.nameRem).toBeGreaterThanOrEqual(previous.nameRem);
      expect(current.timeRem).toBeGreaterThanOrEqual(previous.timeRem);
    }
  });
});

describe('hour spacing', () => {
  test('a fitted slot never compresses below a comfortable hour', () => {
    // 20px a slot is 80px an hour — the point of the floor.
    expect(minutesToPx(60, MIN_PX_PER_SLOT)).toBe(80);
  });

  test('the quarter-hour rules are dropped before the grid gets that tight', () => {
    // Otherwise the densest grid would also be the most heavily ruled.
    expect(SUBDIVISION_MIN_PX_PER_SLOT).toBeGreaterThan(MIN_PX_PER_SLOT);
  });

  test('a comfortable panel keeps the quarter-hour rules', () => {
    // 1000px over a 10-hour day is 25px a slot, above the subdivision floor.
    expect(fitPxPerSlot(1000, OPEN, CLOSE)).toBeGreaterThanOrEqual(SUBDIVISION_MIN_PX_PER_SLOT);
  });
});
