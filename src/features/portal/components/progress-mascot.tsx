'use client';

import Image from 'next/image';
import { useEffect, useState, type CSSProperties } from 'react';

import { mascotAssetFor, MASCOT_SIZES, type MascotSize } from '@/features/portal/mascot/assets';
import { getMascotProgression, type MascotState } from '@/features/portal/mascot/states';
import { useMascotProgression } from '@/features/portal/mascot/use-mascot-progression';
import { cn } from '@/lib/utils';

/**
 * The character itself: one of six drawings, the movement that carries it from
 * the last one, and nothing else.
 *
 * **It owns no copy and no numbers.** The percentage, the encouragement and the
 * bar all live on `JourneyCard`, which is also what makes this safe to place
 * anywhere — the mascot is decorative in the accessibility sense precisely
 * because everything it says is already said in text beside it. See the `alt`
 * note below.
 *
 * **It takes a fraction, not a state.** Callers pass the same 0–1 adherence
 * value the rest of the portal draws and `getMascotProgression` resolves it —
 * so there is no way for a caller to hand this component a state that disagrees
 * with the figure printed under it. That resolution is the one in
 * `mascot/states.ts` and there is no other.
 */

/**
 * How long the two drawings overlap during a swap. Matches
 * `.q-mascot-art-in`/`.q-mascot-art-out` in `globals.css` — the outgoing copy
 * is unmounted when this fires, so a shorter value here cuts its fade off.
 *
 * Shorter than every entry in `MASCOT_CELEBRATION_MS` on purpose: the art has
 * to have finished changing before the movement carrying it does, or the
 * character lands from its hop still mid-dissolve.
 */
const ART_SWAP_MS = 440;

/**
 * Eight dots on the compass points, thrown outward on a milestone.
 *
 * Built once at module scope, not per render: the offsets are trigonometry over
 * constants and recomputing them on every frame of a card that re-renders with
 * every ticked meal is work for nothing. Same construction as
 * `today-flame-celebration.tsx`'s six — and the same keyframe underneath, since
 * `q-flame-particle-burst` is written entirely against these two variables.
 */
const PARTICLE_COUNT = 8;

const PARTICLES = Array.from({ length: PARTICLE_COUNT }, (_, index) => {
  const angle = (index * (360 / PARTICLE_COUNT) * Math.PI) / 180;

  return {
    key: index,
    style: {
      '--q-tx': `${Math.round(Math.cos(angle) * 42)}px`,
      '--q-ty': `${Math.round(Math.sin(angle) * 42)}px`,
      animationDelay: `${index * 30}ms`,
    } as CSSProperties,
  };
});

export type ProgressMascotProps = {
  /**
   * The client's plan adherence, 0–1, or `null` when the week has nothing
   * reported yet. The same value the card's own percentage is printed from.
   */
  progress: number | null;
  /**
   * What the "have we already celebrated this?" record is filed under —
   * normally the ISO date the week starts on. See `use-mascot-progression.ts`
   * for why the record is scoped at all.
   */
  scope: string;
  size?: MascotSize;
  /**
   * `false` freezes the character at its earned drawing with no float, no swap
   * and no celebration — and, importantly, without touching the stored record,
   * so a later animated render still plays what was earned in the meantime.
   */
  animated?: boolean;
  /**
   * `false` keeps the evolution but drops the burst and the glow. For a surface
   * where the mascot is a supporting mark rather than the subject.
   */
  showCelebration?: boolean;
  className?: string;
};

export function ProgressMascot({
  progress,
  scope,
  size = 'md',
  animated = true,
  showCelebration = true,
  className,
}: ProgressMascotProps) {
  const progression = getMascotProgression(progress);
  const { state } = progression;

  const { celebration } = useMascotProgression({ progression, scope, animated });

  /*
    The drawing currently on screen, and the one it is replacing.

    Both are adjusted during render rather than in an effect — the pattern
    `TodayFlameCell` uses and the React docs call out for state that tracks
    another value. An effect would run a frame late, which here means one
    painted frame of the new drawing at full opacity before its fade-in starts:
    a visible flash, precisely in the moment the transition exists to smooth.
  */
  const [renderedState, setRenderedState] = useState<MascotState>(state);
  const [outgoingState, setOutgoingState] = useState<MascotState | null>(null);

  if (state !== renderedState) {
    setOutgoingState(animated ? renderedState : null);
    setRenderedState(state);
  }

  useEffect(() => {
    if (outgoingState === null) return;

    const timer = window.setTimeout(() => setOutgoingState(null), ART_SWAP_MS);
    return () => window.clearTimeout(timer);
  }, [outgoingState]);

  /*
    Drawings whose file did not load, so a half-delivered asset set degrades to
    an empty square rather than to a broken-image glyph in the middle of the
    card. A set rather than a boolean: state 3 missing must not blank out state
    4 once the client earns it.
  */
  const [failed, setFailed] = useState<ReadonlySet<MascotState>>(() => new Set());

  const pixels = MASCOT_SIZES[size];

  /*
    The hook already returns `'none'` when `animated` is false, so this is
    belt-and-braces — but it is the prop's whole contract, and stating it here
    means a caller reading this component can see that `animated={false}`
    reaches the DOM attribute too, not only the hook.
  */
  const active = animated ? celebration : 'none';
  const bursting = showCelebration && (active === 'milestone' || active === 'goal');

  /**
   * True only while one drawing is being replaced by another.
   *
   * ⚠ **This is what keeps the swap from playing on an ordinary mount.** The
   * home tab remounts this whole subtree every time the day picker is tapped
   * (`PlanDayCompletionProvider` is keyed to the open day), and an entrance
   * animation written unconditionally would fade the character in on every one
   * of those taps — §15's "not on every render", in its quietest form. On a
   * mount there is nothing to replace, so the earned drawing is simply there.
   */
  const swapping = outgoingState !== null;

  function renderArt(drawing: MascotState, variant: 'in' | 'out') {
    if (failed.has(drawing)) return null;

    return (
      <Image
        /*
          Keyed by the drawing, not by the drawing *and* its role. The role
          changes when `outgoingState` clears 440ms after a swap, and a key that
          included it would remount the settled image at that moment — a flash,
          arriving exactly when the transition had finished hiding one.
        */
        key={variant === 'out' ? `out-${drawing}` : drawing}
        src={mascotAssetFor(drawing)}
        /*
          A fixed box, and deliberately no `sizes`. The mascot does not grow
          with the viewport, so `next/image` builds the 1x/2x pair a fixed image
          wants; naming a `sizes` would switch it to width descriptors over the
          whole `deviceSizes` list and offer the browser a dozen sources for a
          box that is only ever one width.
        */
        width={pixels}
        height={pixels}
        /*
          Decorative, deliberately. The brief allows either treatment and this
          is the one the layout earns: `JourneyCard` prints the percentage, the
          encouragement and a labelled progress bar within a few lines of this
          image, so a screen reader that announced the character too would read
          the same fact twice and the second time less precisely. If the mascot
          is ever placed somewhere without that text, it needs a label — this is
          a decision about the surrounding card, not about the picture.
        */
        alt=""
        aria-hidden="true"
        draggable={false}
        /*
          No `priority`. The mascot is never the largest contentful paint on
          either tab — the plan and the ring are above it — and preloading six
          possible drawings to show one is the over-fetch §21 rules out. Only
          the earned drawing is ever requested.
        */
        onError={() => setFailed((current) => new Set(current).add(drawing))}
        className={cn(
          'q-mascot-art',
          variant === 'out' ? 'q-mascot-art-out' : swapping && 'q-mascot-art-in',
        )}
      />
    );
  }

  return (
    <span
      data-celebration={active}
      className={cn('q-mascot', className)}
      style={{ '--q-mascot-size': `${pixels}px` } as CSSProperties}
    >
      {/*
        The glow sits behind everything and outside the floating element, so it
        pulses in place rather than riding the character's hop.
      */}
      {showCelebration && active === 'goal' ? (
        <span aria-hidden="true" className="q-mascot-glow pointer-events-none absolute -inset-4 -z-10" />
      ) : null}

      <span className="q-mascot-float">
        <span className="q-mascot-figure">
          {outgoingState !== null ? renderArt(outgoingState, 'out') : null}
          {renderArt(renderedState, 'in')}
        </span>
      </span>

      {bursting ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0">
          {PARTICLES.map((particle) => (
            <span key={particle.key} className="q-mascot-particle" style={particle.style} />
          ))}
        </span>
      ) : null}
    </span>
  );
}
