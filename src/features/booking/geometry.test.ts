import { describe, expect, test } from 'bun:test';

import {
  BLOCK_GUTTER_PX,
  INLINE_HEIGHT_PX,
  MIN_PX_PER_SLOT,
  PX_PER_HOUR,
  PX_PER_SLOT,
  SUBDIVISION_MIN_PX_PER_SLOT,
  blockBox,
  blockCardBox,
  blockTypeScale,
  clampToDay,
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

/**
 * The grid is drawn at `PX_PER_SLOT` and the panel scrolls to it, so nothing
 * ships a different scale today. These stay because the *parameter* is still
 * the contract: every function here takes `pxPerSlot`, and a caller that passes
 * something other than the default must get answers at that scale rather than
 * silently at 32px. That was a real bug once — the gestures read the pointer at
 * the module default while the columns were drawn at another size, so every
 * drag landed on a different slot from the one under the cursor.
 *
 * `MIN_PX_PER_SLOT` is the bottom of the range the module is answerable for, so
 * it is what these are exercised at.
 */
describe('a scale other than the default', () => {
  const DENSE = MIN_PX_PER_SLOT; // 20px per slot

  test('positions blocks at the given scale, not the default', () => {
    expect(blockBox({ startMinute: 9 * 60, durationMinutes: 30 }, OPEN, DENSE)).toEqual({ top: 80, height: 40 });
  });

  test('round-trips a pointer back to the same minute', () => {
    const minute = 11 * 60 + 45;
    const y = minuteToY(minute, OPEN, DENSE);

    expect(yToMinute(y, OPEN, DENSE)).toBeCloseTo(minute, 6);
  });

  test('reads a pointer against the given scale', () => {
    // One hour down at 20px/slot is 80px.
    expect(pointerToMinute(200 + 80, 200, OPEN, CLOSE, DENSE)).toBeCloseTo(9 * 60, 6);
  });

  test('the same pointer read at the default scale lands on another hour', () => {
    // The bug this parameter exists to prevent: 80px is 09:00 at 20px a slot
    // and 08:37 at the default 32.
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

describe('blockCardBox', () => {
  test('insets the drawn card by the gutter at both block edges', () => {
    const appointment = { startMinute: 9 * 60, durationMinutes: 30 };

    expect(blockCardBox(appointment, OPEN)).toEqual({
      top: 128 + BLOCK_GUTTER_PX,
      height: 64 - BLOCK_GUTTER_PX * 2,
    });
  });

  test('leaves back-to-back appointments a gap of two gutters', () => {
    const first = blockCardBox({ startMinute: 10 * 60, durationMinutes: 30 }, OPEN);
    const second = blockCardBox({ startMinute: 10 * 60 + 30, durationMinutes: 30 }, OPEN);

    expect(second.top - (first.top + first.height)).toBe(BLOCK_GUTTER_PX * 2);
  });

  test('never shrinks a card below the readable floor', () => {
    // A quarter-hour on the most compressed grid: 20px, which two gutters
    // would otherwise cut to 12.
    const { height } = blockCardBox({ startMinute: OPEN, durationMinutes: 15 }, OPEN, MIN_PX_PER_SLOT);

    expect(height).toBeGreaterThanOrEqual(16);
  });

  test('does not move the appointment itself', () => {
    const appointment = { startMinute: 9 * 60, durationMinutes: 30 };

    // The gap is presentation only — every gesture and drop target still reads
    // the raw box, which is what keeps a card droppable on the slot it snaps to.
    expect(blockBox(appointment, OPEN)).toEqual({ top: 128, height: 64 });
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
  test('the slowest slot the module answers for still gives a comfortable hour', () => {
    // 20px a slot is 80px an hour — the point of the floor.
    expect(minutesToPx(60, MIN_PX_PER_SLOT)).toBe(80);
  });

  test('the quarter-hour rules are dropped before the grid gets that tight', () => {
    // Otherwise the densest grid would also be the most heavily ruled.
    expect(SUBDIVISION_MIN_PX_PER_SLOT).toBeGreaterThan(MIN_PX_PER_SLOT);
  });

  test('the scale actually shipped keeps the quarter-hour rules', () => {
    // 32px a slot, comfortably above the subdivision floor — which is why the
    // dropped-subdivision branch in `DayColumn` does not currently fire.
    expect(PX_PER_SLOT).toBeGreaterThanOrEqual(SUBDIVISION_MIN_PX_PER_SLOT);
  });
});
