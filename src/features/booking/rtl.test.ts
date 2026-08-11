import { describe, expect, test } from 'bun:test';

import { anchorPopover, dateAtX, toClientX, toInlineOffset, type ColumnBounds } from './rtl';

const VIEWPORT = { width: 1000, height: 800 };
const POPOVER = { width: 320, height: 400 };

describe('toInlineOffset', () => {
  test('is the identity in LTR', () => {
    expect(toInlineOffset(250, 1000, 'ltr')).toBe(250);
  });

  test('measures from the right edge in RTL', () => {
    expect(toInlineOffset(250, 1000, 'rtl')).toBe(750);
  });

  test('round-trips through toClientX in both directions', () => {
    for (const direction of ['ltr', 'rtl'] as const) {
      expect(toClientX(toInlineOffset(250, 1000, direction), 1000, direction)).toBe(250);
    }
  });
});

describe('dateAtX', () => {
  /** A three-day strip laid out left-to-right, as English would render it. */
  const LTR: ColumnBounds[] = [
    { date: '2026-08-03', start: 100, end: 200 },
    { date: '2026-08-04', start: 200, end: 300 },
    { date: '2026-08-05', start: 300, end: 400 },
  ];

  test('finds the day under the pointer', () => {
    expect(dateAtX(150, LTR)).toBe('2026-08-03');
    expect(dateAtX(250, LTR)).toBe('2026-08-04');
    expect(dateAtX(350, LTR)).toBe('2026-08-05');
  });

  test('a shared border belongs to exactly one column', () => {
    // Half-open: 200 is the start of the 4th, not the end of the 3rd.
    expect(dateAtX(200, LTR)).toBe('2026-08-04');
    expect(dateAtX(199.9, LTR)).toBe('2026-08-03');
  });

  test('returns null outside the strip, so a drag keeps the day it started on', () => {
    expect(dateAtX(50, LTR)).toBeNull();
    expect(dateAtX(400, LTR)).toBeNull();
    expect(dateAtX(9999, LTR)).toBeNull();
  });

  test('returns null when there are no columns', () => {
    expect(dateAtX(150, [])).toBeNull();
  });

  test('works unchanged on an RTL strip, because the rects are measured', () => {
    // The same week in Arabic: the browser lays the earliest day out on the
    // right, so its rect has the *largest* x. No mirroring maths needed.
    const rtl: ColumnBounds[] = [
      { date: '2026-08-03', start: 300, end: 400 },
      { date: '2026-08-04', start: 200, end: 300 },
      { date: '2026-08-05', start: 100, end: 200 },
    ];

    expect(dateAtX(350, rtl)).toBe('2026-08-03');
    expect(dateAtX(250, rtl)).toBe('2026-08-04');
    expect(dateAtX(150, rtl)).toBe('2026-08-05');
  });

  test('a single-column day view keeps every pointer on that one day', () => {
    const dayView: ColumnBounds[] = [{ date: '2026-08-05', start: 100, end: 900 }];

    expect(dateAtX(500, dayView)).toBe('2026-08-05');
    expect(dateAtX(950, dayView)).toBeNull();
  });
});

describe('anchorPopover', () => {
  test('centres on the pointer in LTR', () => {
    const { insetInlineStart, insetBlockStart } = anchorPopover(
      { x: 400, y: 300 },
      POPOVER,
      VIEWPORT,
      'ltr',
    );

    // The pointer sits in the middle of the panel on both axes, not on a corner.
    expect(insetInlineStart + 320 / 2).toBe(400);
    expect(insetBlockStart + 400 / 2).toBe(300);
  });

  test('mirrors in RTL — the same pointer lands the same distance from the *other* edge', () => {
    const ltr = anchorPopover({ x: 400, y: 300 }, POPOVER, VIEWPORT, 'ltr');
    const rtl = anchorPopover({ x: 600, y: 300 }, POPOVER, VIEWPORT, 'rtl');

    // x=600 in RTL is 400 from the inline start, the mirror of x=400 in LTR.
    expect(rtl.insetInlineStart).toBe(ltr.insetInlineStart);
  });

  test('the block axis never mirrors', () => {
    const ltr = anchorPopover({ x: 400, y: 300 }, POPOVER, VIEWPORT, 'ltr');
    const rtl = anchorPopover({ x: 400, y: 300 }, POPOVER, VIEWPORT, 'rtl');

    expect(ltr.insetBlockStart).toBe(100);
    expect(rtl.insetBlockStart).toBe(100);
  });

  /**
   * Near an edge the panel gives up the centre rather than the viewport.
   *
   * This is the whole of the edge behaviour — there is no separate rule for it.
   * A slot at the bottom of the day would centre below the screen, gets pushed
   * back inside, and so lands *above* the pointer, which is what someone
   * booking the last hour of the day is asking for.
   */
  test('a slot at the bottom of the day pushes the panel above the pointer', () => {
    const { insetBlockStart } = anchorPopover({ x: 400, y: 790 }, POPOVER, VIEWPORT, 'ltr');

    expect(insetBlockStart).toBe(800 - 400 - 8);
    // Entirely above the click, not hanging past the bottom of the screen.
    expect(insetBlockStart + 400).toBeLessThanOrEqual(800 - 8);
  });

  test('the inline end edge pushes it back in, in both directions', () => {
    expect(anchorPopover({ x: 980, y: 300 }, POPOVER, VIEWPORT, 'ltr').insetInlineStart).toBe(
      1000 - 320 - 8,
    );
    // A pointer near the left edge in RTL is near the *end* of the inline axis.
    expect(anchorPopover({ x: 20, y: 300 }, POPOVER, VIEWPORT, 'rtl').insetInlineStart).toBe(
      1000 - 320 - 8,
    );
  });

  test('clamps to the inline start edge', () => {
    expect(anchorPopover({ x: 2, y: 300 }, POPOVER, VIEWPORT, 'ltr').insetInlineStart).toBe(8);
    expect(anchorPopover({ x: 998, y: 300 }, POPOVER, VIEWPORT, 'rtl').insetInlineStart).toBe(8);
  });

  test('a click with room all round stays centred on both axes', () => {
    const { insetInlineStart, insetBlockStart } = anchorPopover(
      { x: 500, y: 400 },
      POPOVER,
      VIEWPORT,
      'ltr',
    );

    expect(insetInlineStart + 160).toBe(500);
    expect(insetBlockStart + 200).toBe(400);
  });

  test('the bottom-end corner is pushed in on both axes at once', () => {
    const { insetInlineStart, insetBlockStart } = anchorPopover(
      { x: 980, y: 790 },
      POPOVER,
      VIEWPORT,
      'ltr',
    );

    expect(insetInlineStart).toBe(1000 - 320 - 8);
    expect(insetBlockStart).toBe(800 - 400 - 8);
  });

  test('keeps the start edge on screen when the popover is taller than the viewport', () => {
    const tall = { width: 320, height: 900 };
    const { insetBlockStart } = anchorPopover({ x: 400, y: 400 }, tall, VIEWPORT, 'ltr');

    expect(insetBlockStart).toBe(8);
  });

  test('keeps the start edge on screen when the popover is wider than the viewport', () => {
    const narrow = { width: 200, height: 300 };
    const wide = { width: 400, height: 200 };

    for (const direction of ['ltr', 'rtl'] as const) {
      const { insetInlineStart } = anchorPopover({ x: 100, y: 100 }, wide, narrow, direction);
      expect(insetInlineStart).toBe(8);
    }
  });

  test('a pointer at the exact centre is unmoved by direction', () => {
    const ltr = anchorPopover({ x: 500, y: 300 }, POPOVER, VIEWPORT, 'ltr');
    const rtl = anchorPopover({ x: 500, y: 300 }, POPOVER, VIEWPORT, 'rtl');
    expect(ltr.insetInlineStart).toBe(rtl.insetInlineStart);
  });
});
