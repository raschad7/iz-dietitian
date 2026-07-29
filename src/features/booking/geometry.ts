import { SLOT_MINUTES } from './validation';

/**
 * The timeline's pixel maths, derived from exactly one number.
 *
 * `PX_PER_SLOT` is the only hardcoded height in the feature. Total grid height,
 * block tops and heights, drop targets and the hover label all come from the
 * functions here, so changing 32 to 40 rescales the whole calendar and nothing
 * drifts. Do not write a pixel height anywhere else.
 *
 * Pure — safe to unit test, and callable during a pointer move without touching
 * the DOM.
 */

/** One 15-minute slot. An hour is 4 slots, so 128px; an 08:00–18:00 day is 1280px. */
export const PX_PER_SLOT = 32;

export const PX_PER_MINUTE = PX_PER_SLOT / SLOT_MINUTES;

export const PX_PER_HOUR = PX_PER_MINUTE * 60;

/**
 * Below this a block has no room for two stacked lines, so the name and the time
 * share one row instead.
 *
 * They are never dropped: a block always shows both, at every size. A block
 * carrying only a name makes staff click it to find out when it is, which is the
 * one question a calendar exists to answer.
 */
export const INLINE_HEIGHT_PX = 46;

/** How far the pointer must travel before a press becomes a drag rather than a click. */
export const DRAG_THRESHOLD_PX = 4;

/**
 * The smallest a slot may shrink to when fitting a day into the viewport.
 *
 * 20px per slot is 80px per hour — enough air between the hour rules to read the
 * grid comfortably rather than as a stack of hairlines. Below this the timeline
 * scrolls instead of compressing further: a ruler too fine to read is worse than
 * a short scroll.
 */
export const MIN_PX_PER_SLOT = 20;

/**
 * Below this, the quarter-hour rules are dropped and only the hours are drawn.
 *
 * At small slot heights a line every 15 minutes turns the column into grey
 * corduroy and the hours stop standing out — which reads as the hours being
 * *closer together* than they are. Fewer lines, more apparent space.
 */
export const SUBDIVISION_MIN_PX_PER_SLOT = 22;

/**
 * The slot height that makes a whole clinic day fill `availableHeight` exactly,
 * so the grid fits the screen and there is no scrollbar.
 *
 * `PX_PER_SLOT` remains the *default* — the size the grid uses when nothing is
 * measuring it — and every function here takes the fitted value as an argument
 * instead of reading a global. That keeps them pure and keeps one formula in
 * charge of the mapping whether the grid is fitted or not.
 */
export function fitPxPerSlot(availableHeight: number, openMinute: number, closeMinute: number): number {
  const slots = (closeMinute - openMinute) / SLOT_MINUTES;
  if (slots <= 0 || availableHeight <= 0) return PX_PER_SLOT;

  return Math.max(MIN_PX_PER_SLOT, availableHeight / slots);
}

export function minutesToPx(minutes: number, pxPerSlot: number = PX_PER_SLOT): number {
  return (minutes * pxPerSlot) / SLOT_MINUTES;
}

export function pxToMinutes(px: number, pxPerSlot: number = PX_PER_SLOT): number {
  return (px * SLOT_MINUTES) / pxPerSlot;
}

/** Offset from the top of the grid for a given minute-of-day. */
export function minuteToY(minute: number, openMinute: number, pxPerSlot: number = PX_PER_SLOT): number {
  return minutesToPx(minute - openMinute, pxPerSlot);
}

/** The inverse. Unsnapped — callers decide whether to quantise. */
export function yToMinute(y: number, openMinute: number, pxPerSlot: number = PX_PER_SLOT): number {
  return openMinute + pxToMinutes(y, pxPerSlot);
}

/** Nearest 15 minutes. The grid snaps to this while dragging. */
export function snapToSlot(minute: number): number {
  return Math.round(minute / SLOT_MINUTES) * SLOT_MINUTES;
}

/** Rounds down — the slot a pointer is *inside*, which is what a click means. */
export function floorToSlot(minute: number): number {
  return Math.floor(minute / SLOT_MINUTES) * SLOT_MINUTES;
}

export function gridHeight(openMinute: number, closeMinute: number, pxPerSlot: number = PX_PER_SLOT): number {
  return minutesToPx(closeMinute - openMinute, pxPerSlot);
}

/** Where a block sits and how tall it is, in pixels from the top of the grid. */
export type BlockBox = { top: number; height: number };

export function blockBox(
  appointment: { startMinute: number; durationMinutes: number },
  openMinute: number,
  pxPerSlot: number = PX_PER_SLOT,
): BlockBox {
  return {
    top: minuteToY(appointment.startMinute, openMinute, pxPerSlot),
    height: minutesToPx(appointment.durationMinutes, pxPerSlot),
  };
}

/**
 * Clamps a candidate so a drag can never leave the clinic day.
 *
 * The validator would reject an out-of-hours range anyway; clamping means the
 * block stops at the edge under the pointer instead of following it off the grid
 * and flashing red. Duration is preserved, so a drag past closing time slides
 * the whole appointment back rather than shortening it.
 */
export function clampToDay(
  startMinute: number,
  durationMinutes: number,
  openMinute: number,
  closeMinute: number,
): number {
  const latestStart = closeMinute - durationMinutes;
  if (latestStart < openMinute) return openMinute;
  return Math.min(Math.max(startMinute, openMinute), latestStart);
}

/**
 * Reads a pointer's y as a minute-of-day, in the direction-agnostic axis.
 *
 * Vertical geometry is unaffected by RTL — only the horizontal axis mirrors —
 * so this needs no direction argument. The horizontal equivalent lives in
 * `./rtl.ts`, which does.
 */
export function pointerToMinute(
  clientY: number,
  gridTop: number,
  openMinute: number,
  closeMinute: number,
  pxPerSlot: number = PX_PER_SLOT,
): number {
  const minute = yToMinute(clientY - gridTop, openMinute, pxPerSlot);
  return Math.min(Math.max(minute, openMinute), closeMinute);
}

/**
 * Type scale for a block, driven by its height so a two-hour booking reads
 * larger than a half-hour one.
 *
 * Returned as concrete values rather than Tailwind classes: the sizes are
 * continuous in the block's height, and a class per step would mean a dozen
 * arbitrary breakpoints. `gap` scales with the type so the name and the time do
 * not crowd each other as the block grows.
 */
export type BlockTypeScale = {
  nameRem: number;
  timeRem: number;
  /** Gap between the name and the time — vertical when stacked, horizontal when inline. */
  gapRem: number;
  /** Both on one row, because the block is too short to stack them. */
  inline: boolean;
};

/** The smallest type this calendar will render. Roughly 10px at the default root size. */
const MIN_TYPE_REM = 0.625;

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

export function blockTypeScale(height: number): BlockTypeScale {
  if (height < INLINE_HEIGHT_PX) {
    // One row, name then time. Both still shown — a short booking is exactly
    // when "who and when" has to be readable without opening anything.
    const growth = clamp01((height - PX_PER_SLOT) / (INLINE_HEIGHT_PX - PX_PER_SLOT));

    return {
      nameRem: MIN_TYPE_REM + 0.125 + growth * 0.125,
      timeRem: MIN_TYPE_REM + growth * 0.125,
      gapRem: 0.375,
      inline: true,
    };
  }

  // Grows from 0.875rem at 46px to 1.25rem at ~256px (a two-hour booking), then
  // stops — past that the block is large enough and more type would just shout.
  const growth = clamp01((height - INLINE_HEIGHT_PX) / (256 - INLINE_HEIGHT_PX));

  return {
    nameRem: 0.875 + growth * 0.375,
    timeRem: 0.8125 + growth * 0.25,
    gapRem: 0.125 + growth * 0.25,
    inline: false,
  };
}
