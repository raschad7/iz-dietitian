export type InspectorSide = 'top' | 'bottom' | 'left' | 'right';

type AnchorRect = Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left'>;

/** Prefer horizontal room on a working desktop and above/below on a phone. */
export function preferredInspectorSide(
  rect: AnchorRect,
  viewportWidth: number,
  viewportHeight: number,
): InspectorSide {
  const spaces = {
    top: rect.top,
    right: viewportWidth - rect.right,
    bottom: viewportHeight - rect.bottom,
    left: rect.left,
  };

  if (viewportWidth < 768) return spaces.bottom >= spaces.top ? 'bottom' : 'top';

  if (spaces.right < 160 && spaces.left >= 360) return 'left';
  if (spaces.left < 160 && spaces.right >= 360) return 'right';

  // A card near the block edge should send the tall inspector back into the
  // board instead of forcing collision logic to squeeze it beside the card.
  if (spaces.bottom < 240 && spaces.top > spaces.bottom) return 'top';
  if (spaces.top < 160 && spaces.bottom > spaces.top) return 'bottom';

  const horizontal = spaces.right >= spaces.left ? 'right' : 'left';
  if (spaces[horizontal] >= 360) return horizontal;

  return spaces.bottom >= spaces.top ? 'bottom' : 'top';
}
