'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';

import { MARK_LEAF_PATH, MARK_SEED_CX, SEED_CY, SEED_RX, SEED_RY, SEED_ROTATION } from '@/features/brand/logo';
import { energyEyePose, getEnergyMessageKey, getEnergyTier } from '@/features/portal/mascot/energy-progress';

/**
 * The Qiwam mark itself, filling with a soft green "energy" wave as a
 * fraction rises to 1 — the character `TodayEnergyMascot` draws on the home
 * screen's commitment card, extracted so `TodayMascotFigure` (the progress
 * tab's own card) can draw the exact same filling character beside its own
 * heading/percentage/level text instead of the discrete-tier `MascotFace`.
 *
 * **The mark is not redrawn.** `MARK_LEAF_PATH` and the seed ellipse geometry
 * are the exact constants `BrandMark`/`MascotFace` already draw from — no
 * second copy of the outline, and nothing is added to it beyond what moves
 * here: the fill inside it, and the two eyes' pose.
 *
 * **`shown` and `fraction` are both required, and mean different things.**
 * `shown` is the already-animated value (`useRisingFraction`'s output) the
 * wave and the eyes are drawn from, so this component never re-runs its own
 * count-up — the caller owns exactly one `useRisingFraction`, whether it also
 * needs `shown` for a percentage readout beside this mark or not. `fraction`
 * is the real, un-animated target, which is what the bump below has to key
 * off — see its own note for why `shown` would fire it two or three times on
 * a `countOnMount` entrance.
 */

const VIEWBOX = 743;

const TRACK_FILL = 'var(--portal-progress-track-soft)';
const ENERGY_FILL = 'var(--portal-progress-fill)';
const EYE_FILL = 'var(--brand-seed)';
const EYE_BASE_TILT = SEED_ROTATION;

const [LEFT_EYE, RIGHT_EYE] = MARK_SEED_CX.map((cx) => ({ cx, cy: SEED_CY, rx: SEED_RX, ry: SEED_RY })) as [
  { cx: number; cy: number; rx: number; ry: number },
  { cx: number; cy: number; rx: number; ry: number },
];

/**
 * The energy's own shape: a gentle two-crest wave along the top, baked
 * directly into the path's `d` string rather than moved with a `transform`.
 *
 * It used to be a static wave shifted by `style={{ transform:
 * translateY(riseY) }}` — a `transform` animated on a shape sitting inside a
 * static `clip-path` (see the `<g>` below), which is what produced a
 * hairline seam along the shape's own static edges while the 900ms rise was
 * in flight: the browser composites a transformed child onto its own layer
 * and re-rasterises the clip against it every frame, and the rounding in
 * that per-frame recomposite is the seam. `d` is itself an animatable CSS
 * property for an SVG `<path>` (SVG2's Geometry Properties), so adding
 * `riseY` straight into every command's own y-coordinate and transitioning
 * `d` gets the same smooth rise without a `transform` for the seam to come
 * from — the same fix the fill's `<rect>` predecessor used for its `y`.
 *
 * Every command keeps the same shape between renders — only the constant
 * offset changes — which is what lets the browser interpolate `d` smoothly
 * rather than snapping between two unrelated paths.
 */
function wavePath(riseY: number): string {
  return [
    `M -80 ${12 + riseY}`,
    `C 60 ${-12 + riseY} 180 ${-12 + riseY} 300 ${12 + riseY}`,
    `C 420 ${36 + riseY} 540 ${-12 + riseY} 660 ${12 + riseY}`,
    `C 740 ${28 + riseY} 800 ${4 + riseY} 823 ${12 + riseY}`,
    'L 823 900',
    'L -80 900',
    'Z',
  ].join(' ');
}

/** How long the fill rises and the eyes settle into their next pose. */
const FILL_TRANSITION_MS = 900;

/** How long `data-energy-bump` stays set — must match `q-energy-bump`'s own duration in `globals.css`. */
const BUMP_MS = 640;

export function EnergyMascotMark({
  fraction,
  shown,
  size,
}: {
  /** The real, un-animated target — only used to key the bump (see the module doc). */
  fraction: number | null;
  /** The animated value the wave and the eyes are drawn from — the caller's own `useRisingFraction` output. */
  shown: number | null;
  size: number;
}) {
  const clipId = useId();

  const tier = getEnergyTier(shown);
  const eyes = energyEyePose(tier);

  /*
    The bump has to key off the *target* tier, not `tier` above — `tier`
    tracks the animated `shown` value, which climbs through every
    intermediate tier during a `countOnMount` entrance. Bumping on each of
    those would fire the pop three or four times in the first three seconds
    the card is open. Keying it off the real fraction's own tier instead
    means it only fires when a meal tick genuinely moves it, exactly the
    same "an entrance never buzzes" rule `useRisingFraction` applies to its
    own haptic pulse.
  */
  const targetTier = getEnergyTier(fraction);
  const previousTargetTierRef = useRef(targetTier);
  const [bumping, setBumping] = useState(false);

  useEffect(() => {
    const previousTargetTier = previousTargetTierRef.current;
    previousTargetTierRef.current = targetTier;

    if (targetTier > previousTargetTier) {
      setBumping(true);
      const timer = window.setTimeout(() => setBumping(false), BUMP_MS);
      return () => window.clearTimeout(timer);
    }
  }, [targetTier]);

  const riseY = VIEWBOX * (1 - (shown ?? 0));
  // Read off `shown`, the same animated value the fill and eyes are drawn
  // from — so the character never reads "complete" a beat before the energy
  // has actually finished rising to the top.
  const messageKey = getEnergyMessageKey(shown);
  const complete = messageKey === 'complete';

  return (
    <span
      data-energy-bump={bumping}
      className="q-mascot shrink-0"
      style={{ '--q-mascot-size': `${size}px` } as CSSProperties}
    >
      {complete ? <span aria-hidden="true" className="q-mascot-glow pointer-events-none absolute -inset-4 -z-10" /> : null}

      <span className="q-mascot-float">
        <svg
          viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
          className="q-mascot-svg"
          role="presentation"
          aria-hidden="true"
        >
          <defs>
            <clipPath id={clipId}>
              <path d={MARK_LEAF_PATH} />
            </clipPath>
          </defs>

          <path d={MARK_LEAF_PATH} fill={TRACK_FILL} />

          {/*
            The clip has to live on a *static* wrapper, not on the animated
            path itself — `clip-path` is evaluated in the coordinate system
            the element's own `transform` would produce, so putting both on
            the same `<path>` would drag the leaf-shaped clip window along
            with a fill that is meant to slide underneath it. `wavePath`
            itself carries no `transform` any more (see its own doc
            comment), but the clip stays on this separate `<g>` regardless,
            since nothing here depends on the fill being transform-free to
            stay correct.
          */}
          <g clipPath={`url(#${clipId})`}>
            <path
              d={wavePath(riseY)}
              fill={ENERGY_FILL}
              style={{ transition: `d ${FILL_TRANSITION_MS}ms var(--ease-sweep, ease)` }}
            />
          </g>

          {[LEFT_EYE, RIGHT_EYE].map((eye) => (
            <g
              key={eye.cx}
              style={{
                transform: `translate(${eyes.gazeX}px, ${eyes.gazeY}px) rotate(${EYE_BASE_TILT + eyes.tilt}deg)`,
                transformOrigin: `${eye.cx}px ${eye.cy}px`,
                transition: `transform ${FILL_TRANSITION_MS}ms var(--ease-sweep, ease)`,
              }}
            >
              <ellipse
                cx={eye.cx}
                cy={eye.cy}
                rx={eye.rx}
                ry={eye.ry}
                fill={EYE_FILL}
                style={{
                  transform: `scaleY(${eyes.openness})`,
                  transformOrigin: `${eye.cx}px ${eye.cy}px`,
                  transformBox: 'fill-box',
                  transition: `transform ${FILL_TRANSITION_MS}ms var(--ease-sweep, ease)`,
                }}
              />
            </g>
          ))}
        </svg>
      </span>

      {complete ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0">
          {SPARKLE_POSITIONS.map((position) => (
            <span key={position.key} className="q-mascot-particle" style={position.style} />
          ))}
        </span>
      ) : null}

      {/*
        Three "Z"s drifting up and fading, only at 100% — the closed eyes
        alone (`ENERGY_EYE_POSES[4]` in `energy-progress.ts`) read as
        ambiguous on their own, so this makes the "asleep, resting" beat
        unmistakable. Cascades off the mark's own top-inline-end corner,
        each letter on its own delay so they never rise in lockstep.
      */}
      {complete ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0">
          {ZZZ_LETTERS.map((letter) => (
            <span
              key={letter.key}
              className={`q-mascot-zzz absolute font-heading font-bold text-primary ${letter.className}`}
              style={{ animationDelay: `${letter.delayMs}ms` }}
            >
              Z
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}

/** Four sparkles, thrown outward from the mark's centre only at 100%. */
const SPARKLE_POSITIONS = [0, 90, 180, 270].map((angle) => {
  const radians = (angle * Math.PI) / 180;
  return {
    key: angle,
    style: {
      '--q-tx': `${Math.round(Math.cos(radians) * 46)}px`,
      '--q-ty': `${Math.round(Math.sin(radians) * 46)}px`,
      animationDelay: `${angle}ms`,
    } as CSSProperties,
  };
});

/**
 * A diagonal cascade of three "Z"s off the mark's top-inline-end corner —
 * `end`/`top` rather than a physical side, so it mirrors correctly under
 * `dir="rtl"` like every other absolutely-placed decoration in this feature
 * (see `SPARKLES` in `today-flame-celebration.tsx`). Growing size and rising
 * delay read as the classic sleep cue, smallest and soonest closest to the
 * mark.
 */
const ZZZ_LETTERS: readonly { key: number; className: string; delayMs: number }[] = [
  { key: 0, className: 'end-[3%] top-[16%] text-[13px]', delayMs: 0 },
  { key: 1, className: 'end-[-8%] top-[6%] text-[17px]', delayMs: 300 },
  { key: 2, className: 'end-[-20%] top-[-4%] text-[21px]', delayMs: 600 },
];
