import type { AnchorRect } from './use-guide-anchor';
import type { GuideSide } from './steps';

/** Where the card's own box is put, in viewport coordinates. */
export type Placement = { top: number; left: number };

/** Physical sides, once a logical one has been resolved against the script. */
type PhysicalSide = 'top' | 'bottom' | 'left' | 'right';

export type PlaceCardInput = {
  /** The spotlight's box, or `null` for an unanchored step. */
  anchor: AnchorRect | null;
  card: { width: number; height: number };
  viewport: { width: number; height: number };
  /** The step's preference. Honoured when it fits; see below when it does not. */
  side: GuideSide;
  dir: 'ltr' | 'rtl';
  /** Keep-out margin against the edges of the screen. */
  gutter: number;
  /** Space between the spotlight and the card. */
  gap: number;
};

/**
 * Resolves a logical side against the reading direction.
 *
 * This is the whole of what the tour has to do differently in Arabic. A step
 * that asks to sit `inline-end` of the rail is asking to sit *away from* it,
 * which is the right of the rail in English and the left of it in Arabic — and
 * a step written in physical sides would have put the card on top of the thing
 * it was pointing at, in one of the two languages, forever.
 */
function resolve(side: GuideSide, dir: 'ltr' | 'rtl'): PhysicalSide {
  switch (side) {
    case 'block-start':
      return 'top';
    case 'block-end':
      return 'bottom';
    case 'inline-start':
      return dir === 'rtl' ? 'right' : 'left';
    case 'inline-end':
      return dir === 'rtl' ? 'left' : 'right';
  }
}

/** The side directly across the anchor from `side`. */
function opposite(side: PhysicalSide): PhysicalSide {
  switch (side) {
    case 'top':
      return 'bottom';
    case 'bottom':
      return 'top';
    case 'left':
      return 'right';
    case 'right':
      return 'left';
  }
}

function clamp(value: number, min: number, max: number): number {
  /*
    `min` last, and it matters when the card is larger than the space it is
    being clamped into — a very long step on a short screen. `Math.min` first
    would pin it to a `max` that is smaller than `min` and push it off the top;
    this way it pins to `min` and overflows at the end the reader is not looking
    at yet.
  */
  return Math.max(min, Math.min(max, value));
}

/**
 * Puts the step card beside its spotlight without letting it leave the screen.
 *
 * ## The order it tries
 *
 * The step's preferred side, then the side opposite it, then the two on the
 * other axis. First one that fits wins. If none do — a spotlight in the middle
 * of a small window, most often — the preference is used anyway and clamped,
 * which puts the card partly over the anchor. That is the least-bad end state:
 * the card is always fully readable, and the reader can still see where the hole
 * is because the dim around it does not move.
 *
 * ## Why this is not a popover
 *
 * `Popover` and the rest of the app's positioned surfaces anchor to an element
 * they are rendered beside, and re-anchor by re-rendering that pair. The guide
 * has neither half of that: its anchor is any element on any of five screens,
 * found by attribute after a navigation, and its card lives in a portal that
 * outlives the screen the anchor is on. Positioning is arithmetic here for the
 * same reason it is not there.
 */
export function placeCard({
  anchor,
  card,
  viewport,
  side,
  dir,
  gutter,
  gap,
}: PlaceCardInput): Placement {
  const maxLeft = Math.max(gutter, viewport.width - card.width - gutter);
  const maxTop = Math.max(gutter, viewport.height - card.height - gutter);

  /* No anchor — the opening and closing cards. Centred, as a dialog would be. */
  if (anchor === null) {
    return {
      top: clamp((viewport.height - card.height) / 2, gutter, maxTop),
      left: clamp((viewport.width - card.width) / 2, gutter, maxLeft),
    };
  }

  /*
    Read out into locals before `candidate` closes over them. A narrowing of
    `anchor` from the check above does not survive into a nested function —
    TypeScript has to assume something could reassign it in between — so the
    edges are taken here, where it is still known not to be null.
  */
  const anchorTop = anchor.top;
  const anchorLeft = anchor.left;
  const anchorRight = anchor.left + anchor.width;
  const anchorBottom = anchor.top + anchor.height;
  const centreX = anchor.left + anchor.width / 2;
  const centreY = anchor.top + anchor.height / 2;

  function candidate(at: PhysicalSide): { placement: Placement; fits: boolean } {
    switch (at) {
      case 'bottom': {
        const top = anchorBottom + gap;
        return {
          placement: { top, left: clamp(centreX - card.width / 2, gutter, maxLeft) },
          fits: top + card.height <= viewport.height - gutter,
        };
      }
      case 'top': {
        const top = anchorTop - gap - card.height;
        return {
          placement: { top, left: clamp(centreX - card.width / 2, gutter, maxLeft) },
          fits: top >= gutter,
        };
      }
      case 'right': {
        const left = anchorRight + gap;
        return {
          placement: { top: clamp(centreY - card.height / 2, gutter, maxTop), left },
          fits: left + card.width <= viewport.width - gutter,
        };
      }
      case 'left': {
        const left = anchorLeft - gap - card.width;
        return {
          placement: { top: clamp(centreY - card.height / 2, gutter, maxTop), left },
          fits: left >= gutter,
        };
      }
    }
  }

  const preferred = resolve(side, dir);
  const vertical: PhysicalSide[] = ['bottom', 'top'];
  const order: PhysicalSide[] = [
    preferred,
    opposite(preferred),
    /* The other axis, in whichever order does not repeat what has been tried. */
    ...(vertical.includes(preferred)
      ? ([dir === 'rtl' ? 'left' : 'right', dir === 'rtl' ? 'right' : 'left'] as PhysicalSide[])
      : (['bottom', 'top'] as PhysicalSide[])),
  ];

  for (const at of order) {
    const result = candidate(at);
    if (result.fits) {
      return {
        top: clamp(result.placement.top, gutter, maxTop),
        left: clamp(result.placement.left, gutter, maxLeft),
      };
    }
  }

  const fallback = candidate(preferred);
  return {
    top: clamp(fallback.placement.top, gutter, maxTop),
    left: clamp(fallback.placement.left, gutter, maxLeft),
  };
}
