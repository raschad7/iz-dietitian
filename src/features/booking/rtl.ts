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
 * Where to pin a popover opened at a pointer, as logical offsets.
 *
 * The element opens *away* from the inline start edge — rightwards in English,
 * leftwards in Arabic — which is the direction reading continues in, and is what
 * `inset-inline-start` gives for free once the coordinate is converted. Both
 * axes are clamped so the popover cannot be opened partly off screen near an
 * edge.
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
    insetInlineStart: clamp(inline, margin, viewport.width - element.width - margin),
    // The block axis runs top-to-bottom in both directions, so no mirroring.
    insetBlockStart: clamp(pointer.y, margin, viewport.height - element.height - margin),
  };
}
