'use client';

import { useTranslations } from 'next-intl';

import { type Locale } from '@/i18n/routing';
import { toIntlLocale } from '@/lib/format';

/**
 * The ring's own geometry. `RING_RADIUS` leaves a visible gap between the
 * ring's inner edge and the solid disc it surrounds — Figma insets the disc
 * (154×144) further than the ring's own 8px border, by about 7px at that
 * scale. The disc below (`size-[7.5rem]`) is picked to leave roughly that
 * gap, proportionally, at this component's size.
 */
const RING_RADIUS = 44;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * The fine broken-line texture on the ring, standing in for the Figma
 * "Dynamic" brush stroke (frequency/wiggle/smoothen) applied to its two
 * ellipses — a hand-drawn wobble that SVG has no equivalent primitive for.
 * A short dash rendered in `stroke-linecap: round` reads as the same kind of
 * irregular, not-quite-straight line at this scale.
 */
const DASH = 3;
const DASH_GAP = 2.2;

/**
 * Builds a `stroke-dasharray` that dashes exactly `activeLength` of a
 * `totalLength`-long closed path, then leaves the rest bare — used both for
 * the fully-dashed background track (`activeLength === totalLength`) and for
 * the dashed progress arc, which has to stop dashing exactly at the
 * fraction. The list SVG walks must sum to `totalLength` and hold an even
 * number of entries, or the renderer repeats it around the circle a second
 * time instead of leaving the remainder blank — the trailing `[0, remainder]`
 * pair guarantees both.
 */
function buildDashArray(activeLength: number, totalLength: number): string {
  const segments: number[] = [];
  let consumed = 0;

  while (consumed < activeLength) {
    const dash = Math.min(DASH, activeLength - consumed);
    segments.push(dash, DASH_GAP);
    consumed += dash + DASH_GAP;
  }

  segments.push(0, Math.max(totalLength - consumed, 0));
  return segments.join(' ');
}

/**
 * The circular "today" badge — a dashed full-circle track, a dashed arc
 * drawn to the exact fraction, and a solid shadowed disc on top carrying the
 * percentage and, optionally, the meal count. Pinned to the
 * `portal-progress-*` tokens in `globals.css`, which are themselves pinned
 * to Figma values rather than the olive/lime ramp — see the tokens' own
 * comment for why.
 *
 * Shared by the home screen's commitment card and the progress tab's own
 * card — one ring drawn one way, not two that happen to agree today. The
 * progress tab passes `showMealsCaption={false}`: its card states the
 * fraction alone, with no meal count riding under it.
 */
export function TodayRing({
  fraction,
  completed,
  total,
  locale,
  showMealsCaption = true,
}: {
  fraction: number | null;
  completed: number;
  total: number;
  locale: Locale;
  showMealsCaption?: boolean;
}) {
  const t = useTranslations('portal.progress.today');
  const drawn = fraction !== null && fraction > 0;

  // Split so the `%` can render smaller than the figure it follows — Intl
  // reports it as its own `percentSign` part rather than baking it into the
  // number, which is what lets the two sizes differ without string-slicing.
  const percentParts =
    fraction === null
      ? null
      : new Intl.NumberFormat(toIntlLocale(locale), {
          style: 'percent',
          maximumFractionDigits: 0,
          numberingSystem: 'latn',
        }).formatToParts(fraction);

  return (
    <span className="relative grid size-44 shrink-0 place-items-center">
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
        <circle
          cx="50"
          cy="50"
          r={RING_RADIUS}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={buildDashArray(RING_LENGTH, RING_LENGTH)}
          className="fill-none stroke-portal-progress-track-soft"
        />

        {drawn ? (
          <circle
            cx="50"
            cy="50"
            r={RING_RADIUS}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={buildDashArray((fraction ?? 0) * RING_LENGTH, RING_LENGTH)}
            className="fill-none stroke-portal-progress-track"
          />
        ) : null}
      </svg>

      <span className="grid size-[7.5rem] place-items-center rounded-full bg-portal-progress-fill shadow-elevated saturate-150">
        <span className="flex flex-col items-center gap-1">
          <span className="font-heading text-4xl leading-none font-bold tabular-nums text-portal-progress-figure">
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

          {showMealsCaption && total > 0 ? (
            <span className="text-caption leading-none text-portal-progress-caption">
              {t('meals', { completed, total })}
            </span>
          ) : null}
        </span>
      </span>
    </span>
  );
}
