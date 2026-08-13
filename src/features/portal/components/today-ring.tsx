'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { useRisingFraction } from '@/features/portal/rising-fraction';
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
 *
 * **The figure counts up rather than jumping**, and the phone taps once when
 * it rises — both in `rising-fraction.ts`. On the home screen that is a ticked
 * meal moving the number; the progress tab, whose figure is server data that
 * never moves while it is read, instead passes `countOnMount` and draws the
 * ring up from zero once on arrival. The meal caption under it still switches
 * in one step either way: it counts whole meals, and there is nothing between
 * three and four.
 */
export function TodayRing({
  fraction,
  completed,
  total,
  locale,
  showMealsCaption = true,
  countOnMount = false,
}: {
  fraction: number | null;
  completed: number;
  total: number;
  locale: Locale;
  showMealsCaption?: boolean;
  /**
   * Draw the figure up from zero when the ring first appears, rather than
   * printing it finished. For a screen the client opened *to read this number*
   * — the progress tab. Off on the home screen, where a day switch remounts
   * the ring and replaying the climb would read as the new day's figure having
   * just been earned. See `rising-fraction.ts`.
   */
  countOnMount?: boolean;
}) {
  const t = useTranslations('portal.progress.today');

  /*
    The figure actually on screen this frame. It equals `fraction` except in
    the half-second after a meal is ticked, when it ramps up to it — see
    `rising-fraction.ts`, which also fires the haptic pulse on the way. The arc
    below is drawn from the same number, so the dashes and the digits move
    together instead of the ring jumping ahead of the count.
  */
  const shown = useRisingFraction(fraction, { countOnMount });
  const drawn = shown !== null && shown > 0;

  /*
    Built once per locale rather than per render: the tween re-renders this
    component every frame while it runs, and constructing an `Intl` formatter
    is the expensive part of printing a number.
  */
  const formatter = useMemo(
    () =>
      new Intl.NumberFormat(toIntlLocale(locale), {
        style: 'percent',
        maximumFractionDigits: 0,
        numberingSystem: 'latn',
      }),
    [locale],
  );

  // Split so the `%` can render smaller than the figure it follows — Intl
  // reports it as its own `percentSign` part rather than baking it into the
  // number, which is what lets the two sizes differ without string-slicing.
  const percentParts = shown === null ? null : formatter.formatToParts(shown);

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
            strokeDasharray={buildDashArray((shown ?? 0) * RING_LENGTH, RING_LENGTH)}
            className="fill-none stroke-portal-progress-track"
          />
        ) : null}
      </svg>

      <span className="grid size-[7.5rem] place-items-center rounded-full bg-portal-progress-fill shadow-elevated">
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
