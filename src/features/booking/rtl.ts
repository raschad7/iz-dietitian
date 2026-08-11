import { type Direction } from '@/i18n/routing';

/**
 * Horizontal pixel maths for floating elements, mirrored for RTL.
 *
 * Layout is handled by logical Tailwind utilities and needs nothing from here.
 * This exists for the one case they cannot cover: a popover anchored to a raw
 * `clientX`, which is a *physical* coordinate measured from the left of the
 * viewport in both directions. Positioning with `insetInlineStart: clientX`
 * would place an Arabic popover on the opposite side of the screen from the
 * pointer that opened it.
 *
 * Vertical geometry never mirrors, so it stays in `./geometry.ts`.
 */

/** Breathing room between a floating element and the viewport edge. */
export const VIEWPORT_MARGIN_PX = 8;

function clamp(value: number, min: number, max: number): number {
  // `max` can fall below `min` when the element is wider than the viewport;
  // pinning to `min` then keeps the start edge on screen rather than the end.
  return max < min ? min : Math.min(Math.max(value, min), max);
}

/**
 * Converts a physical x (as reported by any pointer event) into a distance from
 * the *inline start* edge — the left in LTR, the right in RTL.
 *
 * The result is what `inset-inline-start` expects, so the browser puts it back
 * on the correct side.
 */
export function toInlineOffset(clientX: number, viewportWidth: number, direction: Direction): number {
  return direction === 'rtl' ? viewportWidth - clientX : clientX;
}

/** The inverse, for reading a pointer back out of an inline offset. */
export function toClientX(inlineOffset: number, viewportWidth: number, direction: Direction): number {
  return direction === 'rtl' ? viewportWidth - inlineOffset : inlineOffset;
}

/** One day column's horizontal extent, as measured from the DOM. */
export type ColumnBounds = { date: string; start: number; end: number };

/**
 * Which day column a pointer is over — what lets a booking be dragged from
 * Monday to Wednesday.
 *
 * Takes measured rects rather than computing positions, and that is the whole
 * reason it needs no direction argument: the browser has already laid the
 * columns out right-to-left in Arabic, so their rects say where they actually
 * are. Any arithmetic version of this would need mirroring and would be one more
 * place for RTL to break.
 *
 * Returns null outside every column, so a caller can hold the day the drag
 * started on instead of flinging the appointment onto whichever day is nearest.
 * Half-open (`start <= x < end`) so two adjacent columns can never both claim
 * the pixel on their shared border.
 */
export function dateAtX(clientX: number, columns: readonly ColumnBounds[]): string | null {
  return columns.find((column) => clientX >= column.start && clientX < column.end)?.date ?? null;
}

export type AnchorRect = { width: number; height: number };
export type Viewport = { width: number; height: number };

/**
 * One axis of {@link anchorPopover}: centre the element on the pointer, then
 * push it back inside the viewport if that hangs it over an edge.
 *
 * **Centred, not cornered.** Two earlier versions put the element's leading
 * corner on the pointer, so the panel hung down and away from the click and the
 * cursor ended up on the outside of it. Centred, the click is *inside* the thing
 * it opened, which is what "it should appear where I clicked" means when the
 * element is 320px wide and the click is a point.
 *
 * Clamping is then the whole of the edge behaviour, and it produces what folding
 * was written to produce: a slot at the bottom of the day centres below the
 * viewport, gets pushed up, and lands above the pointer. The same at the inline
 * end. There is no case left that needs its own branch.
 *
 * `clamp` pins to the start edge when the element is larger than the viewport,
 * so a panel taller than a phone screen stays anchored at the top rather than
 * running off the bottom.
 */
function placeOnAxis(at: number, size: number, extent: number, margin: number): number {
  return clamp(at - size / 2, margin, extent - size - margin);
}

/**
 * Where to pin a popover opened at a pointer, as logical offsets.
 *
 * The element is centred on the pointer and held inside the viewport — see
 * {@link placeOnAxis}. What survives from the mirroring is the coordinate
 * itself: `inset-inline-start` measures from the left in English and the right
 * in Arabic, so a raw `clientX` would put an Arabic popover on the opposite side
 * of the screen from the pointer that opened it. `toInlineOffset` converts once,
 * here, and the arithmetic below needs no direction branch of its own.
 */
export function anchorPopover(
  pointer: { x: number; y: number },
  element: AnchorRect,
  viewport: Viewport,
  direction: Direction,
  margin = VIEWPORT_MARGIN_PX,
): { insetInlineStart: number; insetBlockStart: number } {
  const inline = toInlineOffset(pointer.x, viewport.width, direction);

  return {
    insetInlineStart: placeOnAxis(inline, element.width, viewport.width, margin),
    // The block axis runs top-to-bottom in both directions, so no mirroring.
    insetBlockStart: placeOnAxis(pointer.y, element.height, viewport.height, margin),
  };
}
