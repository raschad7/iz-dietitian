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
 * **Why brand green is allowed on this chart.** §Charts keeps the brand off
 * the practitioner dashboard's charts because olive there marks what you can
 * click. This card has nothing to click, and what it draws is the client's own
 * growth — the same green-line-over-green-wash language the home screen's leaf
 * ring already speaks to them in. The wash reads `--accent-green`
 * (`--color-accent-green` below), the token lime's own removal from
 * `globals.css` left as its replacement — see the "Lime: removed" note there.
 * It stays a fill and never a foreground, which is the rule that actually
 * matters.
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

/**
 * The wipe's own duration, mirroring `.q-chart-reveal` in `globals.css` — 7 ×
 * `--duration-arc`, which also lands within 40ms of the 1500ms Recharts
 * animates the dashboard's area over, the plot this card was asked to move
 * like. Repeated on this side because the dots are staggered *across* it and
 * only this component knows where each day's column sits.
 *
 * ⚠ **Nothing here waits on the commitment ring above it.** The curve was once
 * held back until that number finished counting, and it was wrong every way it
 * was tried: the plot sat blank for the length of the wait, the ring frequently
 * does not animate at all (null or zero fraction), and `--ease-sweep`
 * decelerates into its value so there is no crisp moment to call its end
 * anyway. The two now run together from the first paint. See the note on the
 * progress page.
 */
const DRAW_MS = 1540;

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
 * One tangent per point, chosen so each segment's cubic never overshoots past
 * either of its two endpoints — Fritsch–Carlson monotone cubic interpolation,
 * the same family recharts draws with `type="monotone"` elsewhere in the app
 * (see the note on it in `stat-plots.tsx`: a spline that can overshoot is
 * exactly what that comment already ruled out for the dashboard's own charts).
 *
 * This curve used to be a Catmull-Rom spline, whose control points *can*
 * overshoot past an endpoint on a sharp reversal — a day at the very floor or
 * ceiling next to a steep rise, which a streak's own shape produces constantly
 * — and were clamped back to the plot's bounds when they did. Clamping only
 * the y of one control point, independent of the other, broke the curve's
 * tangent asymmetrically right at that point: the two halves of the curve no
 * longer left it at matching angles, which read as a sharp corner instead of
 * a rounded one — exactly at the days most likely to be a real streak's own
 * peaks and floors. Monotone interpolation has no such case to clamp: each
 * segment already stays within its two endpoints by construction.
 */
function tangents(points: Point[]): number[] {
  const count = points.length;
  if (count < 2) return points.map(() => 0);

  const dx: number[] = [];
  const secant: number[] = [];

  /*
    The non-null assertions through the rest of this function are all the same
    claim: every index here is derived from `count`, `secant` was just filled
    with exactly `count - 1` entries, and the early return above guarantees
    `count >= 2`. `noUncheckedIndexedAccess` cannot see any of that, and
    threading `?? 0` fallbacks through an interpolation would invent data
    points rather than describe them.
  */
  for (let index = 0; index < count - 1; index += 1) {
    const step = points[index + 1]!.x - points[index]!.x;
    dx.push(step);
    secant.push(step === 0 ? 0 : (points[index + 1]!.y - points[index]!.y) / step);
  }

  const slope: number[] = new Array(count);
  slope[0] = secant[0]!;
  slope[count - 1] = secant[count - 2]!;

  for (let index = 1; index < count - 1; index += 1) {
    const before = secant[index - 1]!;
    const after = secant[index]!;
    // A local peak or floor gets a flat tangent — forcing a slope through a
    // point the data itself turns around at is what overshoot comes from.
    slope[index] = before === 0 || after === 0 || before > 0 !== after > 0 ? 0 : (before + after) / 2;
  }

  // Fritsch–Carlson's own bound: shrink a segment's two tangents together,
  // preserving their ratio, whenever they would carry the curve past either
  // endpoint — the guarantee that makes clamping unnecessary anywhere else.
  for (let index = 0; index < count - 1; index += 1) {
    const step = secant[index]!;
    if (step === 0) {
      slope[index] = 0;
      slope[index + 1] = 0;
      continue;
    }

    const a = slope[index]! / step;
    const b = slope[index + 1]! / step;
    const magnitude = Math.hypot(a, b);

    if (magnitude > 3) {
      const scale = 3 / magnitude;
      slope[index] = scale * a * step;
      slope[index + 1] = scale * b * step;
    }
  }

  return slope;
}

/** The monotone curve, with every point actually on the line rather than merely near it. */
function curve(points: Point[]): string {
  const first = points[0];
  if (!first) return '';

  const slope = tangents(points);
  let path = `M ${round(first.x)} ${round(first.y)}`;

  // Same claim as in `tangents`: `index` and `index + 1` are both inside a
  // list this loop is bounded by, and `slope` has one entry per point.
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]!;
    const end = points[index + 1]!;
    const step = (end.x - start.x) / 3;

    const c1 = { x: start.x + step, y: start.y + slope[index]! * step };
    const c2 = { x: end.x - step, y: end.y - slope[index + 1]! * step };

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
                  <stop offset="0%" stopColor="var(--color-accent-green)" stopOpacity="0.5" />
                  <stop offset="55%" stopColor="var(--color-accent-green)" stopOpacity="0.16" />
                  <stop offset="100%" stopColor="var(--color-accent-green)" stopOpacity="0" />
                </linearGradient>

                {/*
                  The wipe that uncovers the curve — see `.q-chart-reveal`.

                  **The origin is the oldest day's end of the plot**, which is
                  the inline-start edge, which `plot()` has already mirrored `x`
                  for. In Arabic that is the right-hand edge, so the reveal runs
                  right to left and climbs as it goes, because today — the tallest
                  point of a growing streak — is the last column it reaches. In
                  English the same rule runs it left to right. Neither is written
                  as a side: `rtl` decides, once, here.
                */}
                <clipPath id="continuity-reveal">
                  <rect
                    className="q-chart-reveal"
                    x="0"
                    y="0"
                    width="100"
                    height="100"
                    style={{ transformOrigin: rtl ? 'right' : 'left' }}
                  />
                </clipPath>
              </defs>

              {/*
                Everything drawn in the plot is clipped to the one wipe, so the
                wash, the stroke and the guide are uncovered together rather than
                each fading in on a schedule of its own. Nothing in here carries
                an animation: the group is what moves, and these are what it
                moves over.
              */}
              <g clipPath="url(#continuity-reveal)">
                {/*
                  One guide, at today, hairline and solid — §Charts is explicit
                  that rules are never dashed. It marks what the callout is
                  pointing at and nothing else; a grid behind six points would be
                  scaffolding for a reading nobody is doing. Today is the last
                  column the wipe reaches, so it arrives with the curve's end.
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

                  ⚠ It is also why this stroke must never be revealed with
                  `stroke-dasharray`: see the note on `.q-chart-reveal` in
                  `globals.css` for the missing-segments bug that caused.
                */}
                <path
                  d={line}
                  vectorEffect="non-scaling-stroke"
                  strokeWidth="2.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="fill-none stroke-primary"
                />
              </g>
            </svg>

            {/*
              The day markers are HTML, not SVG circles: the box is stretched,
              so a circle drawn inside it would arrive as an ellipse. Each one
              is a zero-width centring box placed with `inset-inline-start`,
              which mirrors for Arabic on its own — matching the mirrored `x`
              the curve was plotted at.

              Only today's dot stays on the page — the rest are a hover
              reveal (`group`/`group-hover` on the inner dot), so the curve's
              shape is what reads at a glance and a past day's exact value is
              a deliberate look rather than six digits sitting on the line all
              the time. `q-chart-point` is sized to a full `size-8` hit area
              rather than the dot's own few pixels — centred by the same
              zero-width trick, so growing it does not shift it off the point
              — because a target that small is not one a cursor lands on
              without hunting for it.
            */}
            {continuity.map((day, index) => {
              const point = points[index];
              if (!point) return null;

              const isLatest = index === continuity.length - 1;

              return (
                <span
                  key={day.date}
                  aria-hidden="true"
                  className="group absolute flex w-0 -translate-y-1/2 justify-center"
                  style={{
                    insetInlineStart: `${columnFraction(index, continuity.length) * 100}%`,
                    top: `${point.y}%`,
                  }}
                >
                  {/*
                    The pop is on this inner box, not the positioned one above
                    it: that carries `-translate-y-1/2` to sit on its own point,
                    and a keyframe animating `transform` here would overwrite it
                    and drop every dot half its height down the card.

                    The delay is the dot's own column position times the wipe's
                    duration, which is exactly when the reveal's edge crosses it
                    — so a circle appears as the curve arrives at it rather than
                    the whole row landing at once over a finished line.

                    `columnFraction` and not `index / (count - 1)`: the wipe
                    travels the full width while the points sit centred in their
                    columns, so the first is reached a little after the start and
                    the last a little before the end. The same expression works
                    in both scripts — in Arabic the plot's `x` is mirrored *and*
                    the wipe starts from the opposite edge, so a point's distance
                    along the travel is unchanged.

                    Inline because it is computed per point — the same reason
                    `TodayFlameCell`'s particles set theirs inline.
                  */}
                  <span
                    className="q-chart-point grid size-8 place-items-center"
                    style={{
                      animationDelay: `${Math.round(columnFraction(index, continuity.length) * DRAW_MS)}ms`,
                    }}
                  >
                    {/* The halo makes the current point read as lit rather than as a bigger dot. */}
                    {isLatest ? (
                      <span className="col-start-1 row-start-1 size-6 rounded-full bg-accent-green/25" />
                    ) : null}

                    <span
                      className={cn(
                        'col-start-1 row-start-1 rounded-full bg-card ring-primary transition-opacity duration-150',
                        isLatest ? 'size-3 ring-[3px] opacity-100' : 'size-2 ring-2 opacity-0 group-hover:opacity-100',
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
                {/*
                  Last in, once the curve it labels is finished being drawn —
                  a bubble reading "5 أيام متواصلة" over a line still arriving
                  at five is captioning something that has not happened yet.
                */}
                <ChartTip
                  className="q-chart-callout absolute top-0 end-0 bg-primary text-primary-foreground"
                  style={{ animationDelay: `${DRAW_MS}ms` }}
                >
                  {t('unit', { count: streak })}
                </ChartTip>

                <span
                  aria-hidden="true"
                  className="q-chart-callout absolute top-6 flex w-0 justify-center"
                  style={{
                    insetInlineStart: `${latestFraction * 100}%`,
                    animationDelay: `${DRAW_MS}ms`,
                  }}
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
