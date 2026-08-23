'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';

import { MARK_LEAF_PATH, MARK_SEED_CX, SEED_CY, SEED_RX, SEED_RY, SEED_ROTATION } from '@/features/brand/logo';
import { energyEyePose, getEnergyMessageKey, getEnergyTier } from '@/features/portal/mascot/energy-progress';
import { useRisingFraction } from '@/features/portal/rising-fraction';
import { type Locale } from '@/i18n/routing';
import { toIntlLocale } from '@/lib/format';

/**
 * The home screen's daily commitment card, replacing `TodayRing`'s dashed
 * disc with the Qiwam mark itself as the progress indicator — every meal
 * ticked rises a soft green "energy" fill inside the same leaf silhouette,
 * and the mark's two eyes read tired at empty and proud at full.
 *
 * **The mark is not redrawn.** `MARK_LEAF_PATH` and the seed ellipse
 * geometry are the exact constants `BrandMark`/`MascotFace` already draw
 * from — no second copy of the outline, and nothing is added to it beyond
 * what moves here: the fill inside it, and the two eyes' pose.
 *
 * **A different scale from the reactive mascot's.** `ReactiveMascot` reads a
 * *week's* average adherence into one of six drawings (`states.ts`); this
 * card reads *today's* meal fraction alone into `energy-progress.ts`'s five
 * bands. The two never share a component because they are never allowed to
 * disagree about the same day for different reasons — this card only ever
 * asks "how much of today is done".
 */

const VIEWBOX = 743;
const MASCOT_SIZE = 128;

const TRACK_FILL = 'var(--portal-progress-track-soft)';
const ENERGY_FILL = 'var(--portal-progress-fill)';
const EYE_FILL = 'var(--brand-seed)';
const EYE_BASE_TILT = SEED_ROTATION;

const [LEFT_EYE, RIGHT_EYE] = MARK_SEED_CX.map((cx) => ({ cx, cy: SEED_CY, rx: SEED_RX, ry: SEED_RY })) as [
  { cx: number; cy: number; rx: number; ry: number },
  { cx: number; cy: number; rx: number; ry: number },
];

/**
 * The energy's own shape: a gentle two-crest wave along the top, extending
 * far below the viewBox so translating it up to `0` still leaves the bottom
 * fully covered. Clipped to `MARK_LEAF_PATH` below, so only the silhouette
 * ever shows it — this rectangle-with-a-wavy-top never reads as a shape of
 * its own.
 */
const WAVE_FILL_PATH = [
  'M -80 12',
  'C 60 -12 180 -12 300 12',
  'C 420 36 540 -12 660 12',
  'C 740 28 800 4 823 12',
  'L 823 900',
  'L -80 900',
  'Z',
].join(' ');

/** How long the fill rises and the eyes settle into their next pose. */
const FILL_TRANSITION_MS = 900;

/** How long `data-energy-bump` stays set — must match `q-energy-bump`'s own duration in `globals.css`. */
const BUMP_MS = 640;

export function TodayEnergyMascot({
  fraction,
  completed,
  total,
  locale,
  countOnMount = false,
}: {
  fraction: number | null;
  completed: number;
  total: number;
  locale: Locale;
  countOnMount?: boolean;
}) {
  const t = useTranslations('portal.progress.today');
  const clipId = useId();

  const shown = useRisingFraction(fraction, { countOnMount });
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

  const formatter = useMemo(
    () =>
      new Intl.NumberFormat(toIntlLocale(locale), {
        style: 'percent',
        maximumFractionDigits: 0,
        numberingSystem: 'latn',
      }),
    [locale],
  );

  const percentParts = shown === null ? null : formatter.formatToParts(shown);
  const riseY = VIEWBOX * (1 - (shown ?? 0));
  // Read off `shown`, the same animated value the fill and eyes are drawn
  // from — so the words never call the day "complete" a beat before the
  // energy has actually finished rising to the top.
  const messageKey = getEnergyMessageKey(shown);
  const complete = messageKey === 'complete';

  return (
    <span className="flex flex-col items-center gap-3">
      <span
        data-energy-bump={bumping}
        className="q-mascot"
        style={{ '--q-mascot-size': `${MASCOT_SIZE}px` } as CSSProperties}
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
              path itself. `clip-path` is evaluated in the coordinate system
              the element's own `transform` produces — so putting both on the
              same `<path>` drags the leaf-shaped clip window along with the
              fill as it rises, instead of holding it fixed over a fill that
              slides underneath it. That misalignment is what briefly shipped
              here and showed up as a second, mismatched shape rather than a
              clean fill — this `<g>` keeps the clip anchored to the leaf
              outline while only its child transforms.
            */}
            <g clipPath={`url(#${clipId})`}>
              <path
                d={WAVE_FILL_PATH}
                fill={ENERGY_FILL}
                style={{
                  transform: `translateY(${riseY}px)`,
                  transition: `transform ${FILL_TRANSITION_MS}ms var(--ease-sweep, ease)`,
                }}
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
      </span>

      <span className="flex flex-col items-center gap-1 text-center">
        <span className="font-heading text-4xl leading-none font-bold tabular-nums text-primary">
          {percentParts ? (
            percentParts.map((part, index) =>
              part.type === 'percentSign' ? (
                <span key={index} className="text-xl">
                  {part.value}
                </span>
              ) : (
                <span key={index}>{part.value}</span>
              ),
            )
          ) : (
            '—'
          )}
        </span>

        {total > 0 ? (
          <span className="text-caption leading-none text-muted-foreground">{t('meals', { completed, total })}</span>
        ) : null}

        {complete ? (
          <span className="font-heading text-xl leading-snug font-bold text-primary">
            {t('energy.completeTitle')}
          </span>
        ) : null}

        <p className="font-heading text-lg leading-snug font-bold text-foreground">{t(`energy.${messageKey}`)}</p>
      </span>
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
