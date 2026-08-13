import { Icon } from '@/components/ui/icon';
import { useLocale, useTranslations } from 'next-intl';

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ChartTip } from '@/components/ui/chart-tip';
import { type ContinuityDay } from '@/features/portal/adherence';
import { getLocaleDirection, type Locale } from '@/i18n/routing';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * "استمراريتك" — the client's streak, with each day's own adherence drawn
 * beneath it.
 *
 * **The curve plots each day's fraction, not the run length.** A run length
 * only ever climbs or resets, so a day kept at 1 of 4 meals used to draw the
 * same rising line as a day kept at 4 of 4 — the shape said "still going" and
 * nothing about how much of the day was actually kept. Plotting the fraction
 * means a lighter day visibly dips even mid-streak, and a day nobody answered
 * reads as the line returning to the floor, same as a broken streak did
 * before. The headline number above the curve is still the streak count —
 * that has not moved — but it is no longer restating what the line itself
 * shows.
 *
 * **The number appears once.** The old copy repeated the streak count in text
 * under the number and again in the chart's callout bubble; the bubble is now
 * the only other place it shows, since it is doing a different job (labelling
 * today's point on the curve) rather than restating the headline.
 *
 * **A curve, not the old sparkline's runs of points.** A streak has no gaps to
 * break a line over — a day with nothing in it is a real value, zero — and
 * drawing that as the line returning to the floor says "the run ended" far more
 * directly than an interrupted stroke did.
 *
 * **Why olive and lime are allowed on this chart.** §Charts keeps the brand off
 * the practitioner dashboard's charts because olive there marks what you can
 * click. This card has nothing to click, and what it draws is the client's own
 * growth — the same olive-line-over-lime-wash language the home screen's leaf
 * ring already speaks to them in. The lime stays a fill and never a foreground,
 * which is the rule that actually matters.
 */

/**
 * The plot area, in the 0–100 square the SVG is stretched over.
 *
 * The curve stops 34 from the top rather than at the edge because the callout
 * is pinned to the top of the same box: the bubble has to clear the highest the
 * line can ever reach, and reserving that room is steadier than re-positioning
 * the bubble against a value that changes every day.
 */
const TOP = 34;
const BOTTOM = 88;

/** Catmull-Rom tension. Below 1 the curve pulls tighter and overshoots less. */
const TENSION = 0.82;

type Point = { x: number; y: number };

/**
 * Where a day sits across the width, 0–1.
 *
 * Centred in its own column rather than spread edge to edge, so every point
 * lands under the axis label naming it — the labels are an equal-width grid,
 * and a curve that started at the very edge would leave its first point half a
 * column away from the word for it. It also keeps the last point's halo inside
 * the card, which `overflow-hidden` would otherwise clip.
 */
function columnFraction(index: number, count: number): number {
  return (index + 0.5) / Math.max(count, 1);
}

function clampY(value: number): number {
  return Math.min(Math.max(value, TOP), BOTTOM);
}

/**
 * Where each day sits in the box.
 *
 * `x` runs from the inline-start edge (oldest) to the inline-end edge (today) —
 * the direction the week strip above already reads in. It is mirrored for
 * Arabic here rather than in CSS, because an SVG coordinate system is not
 * affected by `direction` the way the HTML markers layered over it are.
 *
 * The scale is a fixed 0–1, not the tallest point in the window: `fraction`
 * is already a percentage, so a day at 4 of 4 meals reaches the top whether
 * every other day in the window did too or not, and two cards showing
 * different weeks stay comparable. A day nobody answered — `fraction` is
 * `null` — reads as the floor, the same place a `missed` day's `0` lands.
 */
function plot(days: ContinuityDay[], rtl: boolean): Point[] {
  return days.map((day, index) => {
    const fraction = columnFraction(index, days.length);
    const value = day.fraction ?? 0;

    return {
      x: (rtl ? 1 - fraction : fraction) * 100,
      y: BOTTOM - value * (BOTTOM - TOP),
    };
  });
}

function round(value: number): string {
  return value.toFixed(2);
}

/**
 * A Catmull-Rom spline written out as cubic Béziers — the smooth curve, with
 * every point actually on the line rather than merely near it.
 *
 * Control points are clamped to the plot area so a steep rise cannot bow the
 * stroke out through the floor and leave the wash hanging below its own
 * baseline.
 */
function curve(points: Point[]): string {
  const first = points[0];
  if (!first) return '';

  let path = `M ${round(first.x)} ${round(first.y)}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const previous = points[index - 1] ?? start;
    const next = points[index + 2] ?? end;

    if (!start || !end || !previous || !next) continue;

    const c1 = {
      x: start.x + ((end.x - previous.x) / 6) * TENSION,
      y: clampY(start.y + ((end.y - previous.y) / 6) * TENSION),
    };
    const c2 = {
      x: end.x - ((next.x - start.x) / 6) * TENSION,
      y: clampY(end.y - ((next.y - start.y) / 6) * TENSION),
    };

    path += ` C ${round(c1.x)} ${round(c1.y)}, ${round(c2.x)} ${round(c2.y)}, ${round(end.x)} ${round(end.y)}`;
  }

  return path;
}

/** The same curve closed down to the baseline, for the gradient wash under it. */
function areaPath(points: Point[], line: string): string {
  const first = points[0];
  const last = points[points.length - 1];

  if (!first || !last || points.length < 2) return '';

  return `${line} L ${round(last.x)} 100 L ${round(first.x)} 100 Z`;
}

export function AdherenceStreakCard({
  streak,
  continuity,
}: {
  streak: number;
  /** Oldest first. Its last entry's `streak` is `streak`. */
  continuity: ContinuityDay[];
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations('portal.progress.streak');

  const rtl = getLocaleDirection(locale) === 'rtl';
  const points = plot(continuity, rtl);
  const line = curve(points);
  const latest = points[points.length - 1];
  const latestFraction = columnFraction(continuity.length - 1, continuity.length);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>

        <CardAction>
          {/*
            A chip, not a second surface: one tail per card, and this sits
            inside one that already carries it.
          */}
          <span className="grid size-9 place-items-center rounded-2xl bg-icon-chip text-icon-chip-foreground" aria-hidden="true">
            <Icon name="streak" className="size-5" />
          </span>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-start gap-1.5">
            <span className="font-heading text-4xl leading-none font-medium tabular-nums text-secondary-foreground">
              {formatNumber(locale, streak)}
            </span>

            <Icon name="streak" className="mt-1 size-5 shrink-0 text-primary/60" />
          </div>

          {streak === 0 ? <p className="text-sm font-medium text-secondary-foreground">{t('empty')}</p> : null}

          {streak > 0 ? (
            <p className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground ring-1 ring-primary/15 ring-inset">
              <Icon name="encouragement" className="size-3.5 shrink-0 text-primary" />
              {t(streak < 3 ? 'encouragement.starting' : 'encouragement.steady')}
            </p>
          ) : null}
        </div>

        <div>
          {/*
            `role="img"` with one label, everything inside it hidden. Every
            number the curve carries is already printed on this card — the
            streak above it, the days along its axis — so a screen reader
            walking six unlabelled markers would hear one fact six times in a
            shape it cannot see. Same reasoning as `ChartTip`'s own
            `aria-hidden`.
          */}
          <div
            role="img"
            aria-label={t('chart', { days: continuity.length })}
            className="relative h-36 w-full sm:h-40"
          >
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden="true">
              <defs>
                {/*
                  Vertical, so it needs no RTL override — gradients take angles
                  and have no logical direction, and a horizontal one would run
                  the wrong way in Arabic while looking correct in English.
                */}
                <linearGradient id="continuity-wash" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-accent-lime)" stopOpacity="0.5" />
                  <stop offset="55%" stopColor="var(--color-accent-lime)" stopOpacity="0.16" />
                  <stop offset="100%" stopColor="var(--color-accent-lime)" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/*
                One guide, at today, hairline and solid — §Charts is explicit
                that rules are never dashed. It marks what the callout is
                pointing at and nothing else; a grid behind six points would be
                scaffolding for a reading nobody is doing.
              */}
              {latest ? (
                <line
                  x1={round(latest.x)}
                  y1="26"
                  x2={round(latest.x)}
                  y2="100"
                  vectorEffect="non-scaling-stroke"
                  strokeWidth="1"
                  className="stroke-border"
                />
              ) : null}

              <path d={areaPath(points, line)} fill="url(#continuity-wash)" stroke="none" />

              {/*
                `non-scaling-stroke` is what lets the box stretch to the card's
                width without the stroke stretching with it. The alternative —
                a preserved aspect ratio — would leave the curve floating in the
                middle of a band it never fills.
              */}
              <path
                d={line}
                vectorEffect="non-scaling-stroke"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="fill-none stroke-primary"
              />
            </svg>

            {/*
              The day markers are HTML, not SVG circles: the box is stretched,
              so a circle drawn inside it would arrive as an ellipse. Each one
              is a zero-width centring box placed with `inset-inline-start`,
              which mirrors for Arabic on its own — matching the mirrored `x`
              the curve was plotted at.
            */}
            {continuity.map((day, index) => {
              const point = points[index];
              if (!point) return null;

              const isLatest = index === continuity.length - 1;

              return (
                <span
                  key={day.date}
                  aria-hidden="true"
                  className="absolute flex w-0 -translate-y-1/2 justify-center"
                  style={{
                    insetInlineStart: `${columnFraction(index, continuity.length) * 100}%`,
                    top: `${point.y}%`,
                  }}
                >
                  <span className="grid place-items-center">
                    {/* The halo makes the current point read as lit rather than as a bigger dot. */}
                    {isLatest ? (
                      <span className="col-start-1 row-start-1 size-6 rounded-full bg-accent-lime/25" />
                    ) : null}

                    <span
                      className={cn(
                        'col-start-1 row-start-1 rounded-full bg-card ring-primary',
                        isLatest ? 'size-3 ring-[3px]' : 'size-2 ring-2',
                      )}
                    />
                  </span>
                </span>
              );
            })}

            {/*
              The bubble is pinned to the inline-end corner and the pointer to
              the current day's own column, rather than the two travelling
              together. Anchoring the bubble to the point would push it out
              past the card's edge — `overflow-hidden` would take the corner
              off it — and anchoring the pointer to the bubble would leave it
              indicating a column that is not today's.
            */}
            {streak > 0 ? (
              <>
                <ChartTip className="absolute top-0 end-0 bg-primary text-primary-foreground">
                  {t('unit', { count: streak })}
                </ChartTip>

                <span
                  aria-hidden="true"
                  className="absolute top-6 flex w-0 justify-center"
                  style={{ insetInlineStart: `${latestFraction * 100}%` }}
                >
                  <span className="size-2 rotate-45 rounded-xs bg-primary" />
                </span>
              </>
            ) : null}
          </div>

          {/*
            One column per point, in the same source order the curve is plotted
            in — the grid flows inline-start to inline-end, so Arabic mirrors
            the axis for free and every label stays under its own marker.
          */}
          <ol
            className="mt-2 grid gap-1"
            style={{ gridTemplateColumns: `repeat(${continuity.length}, minmax(0, 1fr))` }}
          >
            {continuity.map((day) => (
              <li
                key={day.date}
                className={cn(
                  'text-center text-xs leading-tight',
                  day.daysAgo === 0 ? 'font-semibold text-secondary-foreground' : 'text-muted-foreground',
                )}
              >
                {day.daysAgo === 0
                  ? t('axis.today')
                  : day.daysAgo === 1
                    ? t('axis.yesterday')
                    : day.daysAgo === 2
                      ? t('axis.dayBefore')
                      : t('axis.daysAgo', { count: day.daysAgo })}
              </li>
            ))}
          </ol>
        </div>
      </CardContent>

      <CardFooter className="justify-center">
        <p className="text-center text-base font-bold text-secondary-foreground">{t('note.title')}</p>
      </CardFooter>
    </Card>
  );
}
