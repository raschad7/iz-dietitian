'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { MascotFace } from '@/features/portal/mascot/mascot-face';
import { cn } from '@/lib/utils';

import {
  guideEmote,
  guideReaction,
  guideReactionMs,
  guideSettled,
  type GuideMascotSide,
  type GuideReactionName,
} from './guide-emotes';
import type { GuideStep } from './steps';

/**
 * The character on the guide card: the step's own expression, what the reader
 * just did, and where they are pointing, resolved into one face.
 *
 * ## Why this is its own component
 *
 * It watches the pointer, and a pointer moves at the refresh rate. Anything
 * holding that in state re-renders on every frame of every mouse movement, and
 * if that thing were `GuideCard` the whole card — eyebrow, title, sentence,
 * three buttons — would re-render with it, several dozen times a second, over
 * a screen that is already running the spotlight's measurement loop.
 *
 * Down here the re-render is this component and the SVG under it. The card
 * above it renders when the step changes and not otherwise.
 */

/**
 * How far the eyes lean towards the pointer, in the drawing's own units.
 *
 * Small, and much smaller than the expressions themselves. The character is
 * looking at the card — that is what `side` decided, and it is the thing the
 * reader should be looking at too — so this is a lean, not a turn. Enough to
 * say "I know you are there", not enough to take its attention off the words.
 */
const FOLLOW = 26;

/**
 * The radius, in pixels, over which the lean reaches its full extent.
 *
 * A pointer this far from the mark is looked at as hard as any pointer ever
 * gets looked at; nearer than that, the lean is proportional. Roughly a third
 * of a laptop screen's width — beyond it, the difference between "over there"
 * and "much further over there" is not worth drawing.
 */
const FOLLOW_RANGE = 520;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Where the reader's pointer is, as a gaze offset for the face.
 *
 * `pointermove` on the window rather than on the card, because the interesting
 * pointer is the one crossing the dimmed page: the reader looking at the
 * control in the spotlight is exactly when the mark noticing them is worth
 * anything.
 *
 * Coalesced to one measurement per frame. The event fires far more often than
 * the screen is painted, and a `setState` per event would be a render per
 * event; a `requestAnimationFrame` gate spends at most one on each frame that
 * is actually drawn. It also drops itself entirely under `prefers-reduced-
 * motion`, where a face that tracks the mouse is precisely the kind of
 * incidental movement the preference is about.
 */
function usePointerLook(node: React.RefObject<HTMLElement | null>): { x: number; y: number } {
  const [look, setLook] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (prefersReducedMotion()) return;

    let frame: number | null = null;
    let latest: { x: number; y: number } | null = null;

    function measure() {
      frame = null;
      const element = node.current;
      const pointer = latest;
      if (element === null || pointer === null) return;

      const box = element.getBoundingClientRect();
      const fromX = pointer.x - (box.left + box.width / 2);
      const fromY = pointer.y - (box.top + box.height / 2);

      setLook({
        x: clamp(fromX / FOLLOW_RANGE, -1, 1) * FOLLOW,
        y: clamp(fromY / FOLLOW_RANGE, -1, 1) * FOLLOW,
      });
    }

    function onPointerMove(event: PointerEvent) {
      latest = { x: event.clientX, y: event.clientY };
      frame ??= window.requestAnimationFrame(measure);
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [node]);

  return look;
}

export type GuideMascotProps = {
  stepId: GuideStep['id'];
  side: GuideMascotSide;
  /** Pixels — the card's own height, wherever there is room for that. */
  size: number;
  /**
   * What the reader just did, or `null` for "nothing, carry on".
   *
   * Owned by `GuideCard`, which is where the buttons and the anchor's state
   * are. Everything about *how long* it lasts is owned here.
   */
  reaction: GuideReactionName | null;
  /** Told when a reaction has run its course, so the card can clear it. */
  onReactionEnd: () => void;
};

export function GuideMascot({ stepId, side, size, reaction, onReactionEnd }: GuideMascotProps) {
  const box = useRef<HTMLSpanElement>(null);
  const look = usePointerLook(box);

  /*
    Whether the step's expression has already had its turn.

    A step arrives, the face performs it, and then a reaction interrupts —
    after which the character goes back to the *pose* rather than replaying the
    performance (see `guideSettled`). Without this, dismissing a hover would
    re-introduce a step the reader is halfway through reading, every time their
    pointer crossed the Next button.

    Set during render on the step changing, the same pattern `MascotFace` uses
    for its own frame reset and for the same reason: an effect would spend a
    frame showing the previous step's face under the new step's words.
  */
  const [renderedStep, setRenderedStep] = useState(stepId);
  const [interrupted, setInterrupted] = useState(false);

  if (stepId !== renderedStep) {
    setRenderedStep(stepId);
    setInterrupted(false);
  }

  /*
    A reaction arriving is what marks the step's own performance as spent, and
    it is recorded here rather than in the effect below for the same reason the
    reset above is: adjusting state from a prop during render is the pattern
    React documents for exactly this, while doing it from an effect is a second
    render pass after a paint — and this project's lint rules reject it outright.
  */
  if (reaction !== null && !interrupted) {
    setInterrupted(true);
  }

  useEffect(() => {
    if (reaction === null) return;

    /*
      A held reaction — `hunting` — has no length of its own: it lasts exactly
      as long as the condition that raised it, and the card takes it away by
      passing `null`. Everything else is a moment, and ends on its own.
    */
    const ms = guideReactionMs(reaction);
    if (ms === 0) return;

    const timer = window.setTimeout(onReactionEnd, ms);
    return () => window.clearTimeout(timer);
  }, [reaction, onReactionEnd]);

  const performance =
    reaction !== null
      ? guideReaction(reaction, side)
      : interrupted
        ? guideSettled(stepId, side)
        : guideEmote(stepId, side);

  return (
    <span
      ref={box}
      className={cn('q-guide-mascot', `q-guide-mascot-${side}`)}
      /*
        The one number the stylesheet cannot know: the mark is drawn at the
        card's own measured height, and the card's height is a different number
        on every step and in every language. The rule reads it back for the
        box's size and for centring it against the card's edge.
      */
      style={{ '--q-guide-mascot-size': `${size}px` } as CSSProperties}
    >
      <MascotFace performance={performance} look={look} size={size} />
    </span>
  );
}
