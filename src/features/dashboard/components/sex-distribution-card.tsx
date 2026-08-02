import { getTranslations } from 'next-intl/server';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartTip } from '@/components/ui/chart-tip';
import { Icon } from '@/components/ui/icon';
import { type Demographics, type SexKey } from '@/features/dashboard/demographics';
import { type Locale } from '@/i18n/routing';
import { formatNumber, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';

type SexDistributionCardProps = {
  sex: Demographics['sex'];
  total: number;
  locale: Locale;
};

/**
 * The register by sex, as a donut.
 *
 * Two or three segments is the only size a ring is honest at — it answers
 * "roughly half?" at a glance and nothing more, which is exactly the question
 * here. Anything finer is read off the legend, which carries every count and
 * share in text, so no value is locked behind the colour or a hover.
 *
 * **The colour is fixed to the category, never to its size.** Female is always
 * slot 1 and male always slot 2, so a clinic whose balance shifts does not see
 * the chart repaint itself.
 *
 * Slot 2 (lime-600) sits at 2.77:1 on the card — under the 3:1 floor a mark
 * needs on its own. The legend beside it is not decoration, it is the required
 * relief; do not strip it back to swatches.
 */

/** Fixed slot per category. `unknown` is a neutral: an absence, not a third identity. */
const FILL: Record<SexKey, string> = {
  female: 'stroke-viz-cat-1',
  male: 'stroke-viz-cat-2',
  unknown: 'stroke-viz-cat-none',
};

const SWATCH: Record<SexKey, string> = {
  female: 'bg-viz-cat-1',
  male: 'bg-viz-cat-2',
  unknown: 'bg-viz-cat-none',
};

/**
 * The ring is drawn on a circle of circumference 100, so a dash length *is* a
 * percentage and no trigonometry is needed. `GAP` is the surface-coloured
 * separator between segments — the 2px spacer that keeps two fills apart
 * without drawing a border around either.
 */
const RADIUS = 15.915;
const GAP = 1;

/**
 * Hovering a segment.
 *
 * The hover target is inside the SVG and the bubble is HTML beside it, so the
 * two cannot be parent and child — `:has()` on their common ancestor is what
 * links them. The selectors have to be literal strings for Tailwind to see
 * them, which is why this is a hand-written record rather than a template.
 *
 * `.donut-*` are markers, not styles: nothing declares them, they exist to be
 * selected.
 */
const SEGMENT_MARKER: Record<SexKey, string> = {
  female: 'donut-female',
  male: 'donut-male',
  unknown: 'donut-unknown',
};

const TIP_VISIBILITY: Record<SexKey, string> = {
  female: 'group-has-[.donut-female:hover]/donut:scale-100 group-has-[.donut-female:hover]/donut:opacity-100',
  male: 'group-has-[.donut-male:hover]/donut:scale-100 group-has-[.donut-male:hover]/donut:opacity-100',
  unknown: 'group-has-[.donut-unknown:hover]/donut:scale-100 group-has-[.donut-unknown:hover]/donut:opacity-100',
};

/** The centre total steps aside while a segment is being read. */
const CENTRE_FADE =
  'group-has-[.donut-female:hover]/donut:opacity-0 group-has-[.donut-male:hover]/donut:opacity-0 group-has-[.donut-unknown:hover]/donut:opacity-0';

type Segment = {
  key: SexKey;
  count: number;
  share: number;
  dash: number;
  offset: number;
  /** Where the tip sits: the segment's mid-angle, as a percentage of the box. */
  tip: { x: number; y: number };
};

/**
 * Slices → dash lengths, walking the ring once.
 *
 * `offset` starts at 25 so the first segment begins at twelve o'clock rather
 * than at three, where a circle's path naturally starts. The tip anchor is the
 * only trigonometry here: the mid-angle of the arc, pushed out past the ring.
 */
function toSegments(slices: Demographics['sex']): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;

  for (const slice of slices) {
    if (slice.count === 0) continue;

    const length = slice.share * 100;
    // Straight up is −90°, matching the offset above.
    const midAngle = ((cursor + length / 2) / 100) * 2 * Math.PI - Math.PI / 2;

    segments.push({
      key: slice.key,
      count: slice.count,
      share: slice.share,
      // A single 100% segment keeps its gap: a closed ring would read as a
      // border, and the seam is the honest signal that it is still a chart.
      dash: Math.max(length - GAP, 0.5),
      offset: 25 - cursor,
      tip: { x: 50 + Math.cos(midAngle) * 38, y: 50 + Math.sin(midAngle) * 38 },
    });

    cursor += length;
  }

  return segments;
}

export async function SexDistributionCard({ sex, total, locale }: SexDistributionCardProps) {
  const t = await getTranslations('dashboard.sexDistribution');

  const segments = toSegments(sex);

  return (
    <Card className="min-h-0 xl:h-full">
      <CardHeader className="shrink-0 grid-cols-[auto_1fr] items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-primary">
          <Icon name="topClients" className="size-4" />
        </span>
        <span>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('subtitle', { count: total })}</CardDescription>
        </span>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 items-center">
        {total === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-border p-4">
            <Icon name="clients" className="size-5 text-muted-foreground" />
            <p className="text-body-md text-muted-foreground">{t('empty')}</p>
          </div>
        ) : (
          <div className="flex w-full flex-wrap items-center justify-center gap-5 sm:flex-nowrap">
            <div className="group/donut relative shrink-0">
              {/*
                `overflow-visible`, because a hovered segment scales past the
                viewBox — without it the ring would be sliced flat at the top
                of the box at the exact moment it grows.
              */}
              <svg viewBox="0 0 42 42" className="size-40 overflow-visible 2xl:size-48" role="img" aria-label={t('title')}>
                {/* The track: what an empty ring would look like, so the fills sit on something. */}
                <circle cx="21" cy="21" r={RADIUS} fill="none" strokeWidth="9" className="stroke-muted" />

                {segments.map((segment) => (
                  <circle
                    key={segment.key}
                    cx="21"
                    cy="21"
                    r={RADIUS}
                    fill="none"
                    strokeDasharray={`${segment.dash} ${100 - segment.dash}`}
                    strokeDashoffset={segment.offset}
                    /*
                      Scaling the whole circle only *looks* like scaling one
                      sector: the dashes scale with it, so the arc keeps its
                      angle and grows outward. `transform-box: fill-box` is
                      what puts the origin at the circle's centre — SVG's
                      default origin is the viewport corner, which would send
                      the segment sliding across the card instead.
                    */
                    className={cn(
                      'origin-center [transform-box:fill-box] [stroke-width:9]',
                      'transition-all duration-200 ease-[cubic-bezier(.2,.6,.2,1)]',
                      'hover:scale-[1.06] hover:[stroke-width:11]',
                      FILL[segment.key],
                      SEGMENT_MARKER[segment.key],
                    )}
                  />
                ))}
              </svg>

              <span
                className={cn(
                  'pointer-events-none absolute inset-0 flex flex-col items-center justify-center',
                  'transition-opacity duration-200 ease-[cubic-bezier(.2,.6,.2,1)]',
                  CENTRE_FADE,
                )}
              >
                <span className="font-mono text-display-sm leading-none font-semibold">{formatNumber(locale, total)}</span>
                <span className="text-label text-muted-foreground">{t('centerLabel')}</span>
              </span>

              {/*
                One tip per segment, anchored at that segment's mid-angle.
                Positioned with physical `left`/`top` on purpose: these are
                coordinates on a ring that does not mirror, so an inline-start
                inset would put the Arabic tips on the wrong segments.
              */}
              {segments.map((segment) => (
                <span
                  key={segment.key}
                  style={{ left: `${segment.tip.x}%`, top: `${segment.tip.y}%` }}
                  className={cn(
                    'absolute z-10 flex -translate-x-1/2 -translate-y-1/2 scale-95 opacity-0',
                    'transition-all duration-200 ease-[cubic-bezier(.2,.6,.2,1)]',
                    TIP_VISIBILITY[segment.key],
                  )}
                >
                  <ChartTip>
                    {t('tooltip', { count: segment.count, group: t(`groups.${segment.key}`) })}
                    <span className="block font-mono">{formatPercent(locale, segment.share)}</span>
                  </ChartTip>
                </span>
              ))}
            </div>

            {/* The legend carries every value in text — the chart is never the only way to read one. */}
            <ul className="flex min-w-0 flex-1 flex-col gap-2">
              {sex.map((slice) => (
                <li key={slice.key} className="flex items-center gap-2">
                  <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', SWATCH[slice.key])} />
                  <span className="min-w-0 flex-1 truncate text-caption">{t(`groups.${slice.key}`)}</span>
                  <span className="flex shrink-0 items-baseline gap-1.5 font-mono text-caption tabular-nums">
                    <span>{formatNumber(locale, slice.count)}</span>
                    <span className="text-muted-foreground">{formatPercent(locale, slice.share)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
