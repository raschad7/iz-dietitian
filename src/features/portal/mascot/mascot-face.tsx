'use client';

import { useEffect, useRef, useState } from 'react';

import {
  MARK_LEAF_PATH,
  MARK_SEED_CX,
  SEED_CY,
  SEED_ROTATION,
  SEED_RX,
  SEED_RY,
} from '@/features/brand/logo';
import { cn } from '@/lib/utils';

import type { MascotEmotion } from './emotion';
import { EMOTION_SEQUENCES, LOOPING_EMOTIONS, RESTING_FRAME, tierBaseline } from './eye-choreography';
import type { MascotState } from './states';

/**
 * The character itself, drawn from the same geometry `BrandMark` and the app
 * icon routes already share — `MARK_LEAF_PATH`/`MARK_SEED_CX` in
 * `@/features/brand/logo`, not a copy of it. §1–2 of the brief: this is the
 * existing Qiwam logo, reactive, not a redesign of it, and a second copy of
 * its path data here is exactly how the two would drift apart. Nothing is
 * added to it; the two `<ellipse>`s ("the seeds") are the only elements that
 * ever move independently of the whole mark.
 *
 * Fills are `var(--brand-leaf)`/`var(--brand-seed)`, the CSS side of the same
 * two constants — `qiwam/no-raw-hex` keeps a literal hex out of every `.tsx`
 * that is not `logo.ts` itself, and there is no reason for this file to be
 * the second exception.
 */
const VIEWBOX = 743;

/**
 * Breathing room, in the drawing's own units, added on every side of the
 * viewBox so a body transform can move the leaf without crossing the SVG's
 * own default `overflow: hidden` boundary — an SVG clips to its viewBox by
 * default, and `BODY_PATH` already touches all four edges of `0 0 743 743`,
 * so any `scale`/`translateY` on it had nowhere to go but into that clip.
 *
 * Sized to `celebration`'s launch frame in `eye-choreography.ts`
 * (`scaleY: 1.12`, `translateY: -24`), the sequence's most extreme mover:
 * scaling by 1.12 about the centre pushes each edge ~44.6 units out, and the
 * translate adds 24 more on top for the leading edge, landing the top edge
 * ~68.6 units past `y=0`. 90 covers that with room to spare, and every other
 * emotion's transform is smaller still.
 */
const VIEWBOX_PADDING = 90;
const PADDED_VIEWBOX = VIEWBOX + VIEWBOX_PADDING * 2;

const BODY_PATH = MARK_LEAF_PATH;
const BODY_FILL = 'var(--brand-leaf)';
const EYE_FILL = 'var(--brand-seed)';

/** The drawing's own tilt, before any emotion adds its own on top. */
const EYE_BASE_TILT = SEED_ROTATION;

const [LEFT_EYE, RIGHT_EYE] = MARK_SEED_CX.map((cx) => ({ cx, cy: SEED_CY, rx: SEED_RX, ry: SEED_RY })) as [
  { cx: number; cy: number; rx: number; ry: number },
  { cx: number; cy: number; rx: number; ry: number },
];

/**
 * `prefers-reduced-motion` collapses `transition-duration` globally (see
 * `globals.css`), but that only mutes *how* a frame arrives — nothing stops
 * this component's own `setTimeout` chain from stepping through a five-frame
 * sequence at its full original pacing, each step landing instantly instead
 * of smoothly. That is the exact bug the global rule's own doc comment warns
 * about for staggered delays, so it is handled the same way here: a reduced-
 * motion mascot skips straight to the sequence's last frame and never steps.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export type MascotFaceProps = {
  emotion: MascotEmotion;
  /** The adherence tier's resting mood — see `tierBaseline` in `eye-choreography.ts`. */
  tier: MascotState;
  /** Pixels — the SVG is square. */
  size: number;
  className?: string;
};

export function MascotFace({ emotion, tier, size, className }: MascotFaceProps) {
  // `EMOTION_SEQUENCES` is a `Record<MascotEmotion, …>` and `emotion` is
  // always a valid `MascotEmotion`, so this index is never `undefined` — a
  // `?? [RESTING_FRAME]` fallback here would be unreachable at runtime but
  // still read by the effect below as "a new array every render".
  const sequence = EMOTION_SEQUENCES[emotion];
  const looping = LOOPING_EMOTIONS.has(emotion);
  const reduced = prefersReducedMotion();

  const [renderedEmotion, setRenderedEmotion] = useState(emotion);
  const [frameIndex, setFrameIndex] = useState(0);

  /*
    A new emotion always starts its sequence from the top — set during render,
    not in an effect, the same "adjust state when a prop changes" pattern
    `ProgressMascot` (the mascot this one replaces) used for its own drawing
    swap. Doing it here instead of an effect is what keeps the sequence's very
    first frame painting immediately rather than one tick after the emotion
    itself arrives.
  */
  if (emotion !== renderedEmotion) {
    setRenderedEmotion(emotion);
    setFrameIndex(0);
  }

  useEffect(() => {
    if (reduced) return;
    if (sequence.length <= 1) return;

    const current = sequence[frameIndex];
    if (!current) return;

    const timer = window.setTimeout(() => {
      setFrameIndex((index) => {
        const next = index + 1;
        if (next < sequence.length) return next;
        // Holds on the closing frame unless the emotion is a looping one —
        // §20: nothing here replays a one-shot reaction on its own.
        return looping ? 0 : index;
      });
    }, current.durationMs + current.holdMs);

    return () => window.clearTimeout(timer);
  }, [frameIndex, sequence, looping, reduced]);

  /**
   * True once a (non-looping) sequence has run out and settled on its last
   * frame — which for every temporary emotion is `RESTING_FRAME`, see
   * `EMOTION_SEQUENCES`. This is what lets idle blinking resume once a
   * one-shot reaction like `goalComplete` has finished performing, instead
   * of the mascot staying motionless forever at the end of a five-frame
   * story just because that story happened to have more than one frame.
   */
  const atRest = reduced || looping ? false : frameIndex === sequence.length - 1;

  /*
    Idle blinking, independent of the emotion sequence and only while one is
    not actively running — a persistent state (`resting`, `curious`,
    `encouraging`…) is exactly one frame long and always at rest, and a
    finished one-shot sequence reaches the same condition once it settles.
    This is what keeps the mascot from looking like a still photograph the
    rest of the time nothing else is happening. A running sequence already
    choreographs its own blinks (see `EMOTION_SEQUENCES`), so this never
    layers a second one on top of one that is mid-story.
  */
  const [idleBlink, setIdleBlink] = useState(false);
  const idleTimerRef = useRef<number | null>(null);
  const idleEligible = sequence.length <= 1 || atRest;

  useEffect(() => {
    if (reduced || !idleEligible) return;

    function scheduleNext() {
      const delay = 3200 + Math.random() * 2600;
      idleTimerRef.current = window.setTimeout(() => {
        setIdleBlink(true);
        window.setTimeout(() => setIdleBlink(false), 140);
        scheduleNext();
      }, delay);
    }

    scheduleNext();
    return () => {
      if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
    };
  }, [idleEligible, reduced]);

  const target = reduced ? (sequence[sequence.length - 1] ?? RESTING_FRAME) : (sequence[frameIndex] ?? RESTING_FRAME);
  const baseline = tierBaseline(tier);
  const durationMs = reduced ? 0 : target.durationMs;

  const gazeX = target.eyes.gazeX;
  const gazeY = target.eyes.gazeY;
  const tilt = EYE_BASE_TILT + target.eyes.tilt + baseline.tilt;
  const openness = (idleBlink ? 0.08 : target.eyes.openness) * baseline.openness;

  const { scaleX, scaleY, rotate, translateY } = target.body;

  /*
    The rendered box grows by the same factor as the padded viewBox, so the
    743-unit leaf itself still lands at exactly `size` px at rest — the
    padding is invisible extra canvas around it, not a change in the
    mascot's own apparent size or position. `style` (not just the `width`/
    `height` attributes) is what makes this hold everywhere `MascotFace` is
    used: `.q-mascot-svg` sets `inline-size: 100%`, which — inside
    `ReactiveMascot`'s fixed-width `.q-mascot` — would otherwise win over a
    plain attribute and force the padding back down to nothing. An inline
    style outranks that class rule in every context, so the drawing is
    always sized off `size` itself, never off an ancestor's box, and the
    extra canvas is free to overflow that box (none of `.q-mascot`,
    `.q-mascot-float`, or this SVG's own container clips it) while staying
    centred by the grids around it.
  */
  const renderedSize = (size * PADDED_VIEWBOX) / VIEWBOX;

  return (
    <svg
      viewBox={`${-VIEWBOX_PADDING} ${-VIEWBOX_PADDING} ${PADDED_VIEWBOX} ${PADDED_VIEWBOX}`}
      width={renderedSize}
      height={renderedSize}
      style={{ width: renderedSize, height: renderedSize }}
      // Decorative — see `ReactiveMascot` for the text every emotion here
      // has an accessible equivalent for. Two identical drawings side by
      // side (this and any visible copy) would only ever repeat one label.
      role="presentation"
      aria-hidden="true"
      className={cn('q-mascot-svg', className)}
    >
      <g
        style={{
          transform: `translateY(${translateY}px) scale(${scaleX}, ${scaleY}) rotate(${rotate}deg)`,
          transformOrigin: `${VIEWBOX / 2}px ${VIEWBOX / 2}px`,
          transition: `transform ${durationMs}ms var(--ease-sweep, ease)`,
        }}
      >
        <path d={BODY_PATH} fill={BODY_FILL} />

        {[LEFT_EYE, RIGHT_EYE].map((eye) => (
          <g
            key={eye.cx}
            style={{
              transform: `translate(${gazeX}px, ${gazeY}px) rotate(${tilt}deg)`,
              transformOrigin: `${eye.cx}px ${eye.cy}px`,
              transition: `transform ${durationMs}ms var(--ease-sweep, ease)`,
            }}
          >
            <ellipse
              cx={eye.cx}
              cy={eye.cy}
              rx={eye.rx}
              ry={eye.ry}
              fill={EYE_FILL}
              style={{
                transform: `scaleY(${openness})`,
                transformOrigin: `${eye.cx}px ${eye.cy}px`,
                transformBox: 'fill-box',
                transition: `transform ${idleBlink ? 90 : durationMs}ms var(--ease-sweep, ease)`,
              }}
            />
          </g>
        ))}
      </g>
    </svg>
  );
}
