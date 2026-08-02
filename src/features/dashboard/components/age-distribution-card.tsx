import { getTranslations } from 'next-intl/server';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartTip } from '@/components/ui/chart-tip';
import { Icon } from '@/components/ui/icon';
import { type Demographics } from '@/features/dashboard/demographics';
import { type Locale } from '@/i18n/routing';
import { formatNumber, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';

type AgeDistributionCardProps = {
  age: Demographics['age'];
  total: number;
  locale: Locale;
};

/**
 * The register by age band.
 *
 * Horizontal bars rather than a pie: age bands are an **ordered** scale, and a
 * pie throws that order away — a reader cannot tell 30–44 from 45–59 by arc
 * length, and the bands stop being a progression. For the same reason the fill
 * is the sequential ramp read in order (`--viz-seq-*`), so the colour walks
 * from young to old alongside the labels; it is not five identities.
 *
 * Bars grow from the inline-start edge, so the whole chart mirrors in Arabic
 * with no direction prop — the same rule progress fills follow.
 */

/** One step per band, in band order. `unknown` sits outside the ramp on purpose. */
const RAMP = ['bg-viz-seq-1', 'bg-viz-seq-2', 'bg-viz-seq-3', 'bg-viz-seq-4', 'bg-viz-seq-5'] as const;

export async function AgeDistributionCard({ age, total, locale }: AgeDistributionCardProps) {
  const t = await getTranslations('dashboard.ageDistribution');

  // Bars are read against the biggest band, not against the register: with six
  // bands the tallest would otherwise never reach a sixth of the track and the
  // whole chart would look like a rounding error.
  const max = Math.max(...age.map((band) => band.count), 0);

  return (
    <Card className="min-h-0 xl:h-full">
      <CardHeader className="shrink-0 grid-cols-[auto_1fr] items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-primary">
          <Icon name="clients" className="size-4" />
        </span>
        <span>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('subtitle', { count: total })}</CardDescription>
        </span>
      </CardHeader>

      {/* Scrolls only if the bands ever outgrow the card; six never do. */}
      <CardContent className="min-h-0 flex-1 overflow-y-auto">
        {total === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-border p-4">
            <Icon name="clients" className="size-5 text-muted-foreground" />
            <p className="text-body-md text-muted-foreground">{t('empty')}</p>
          </div>
        ) : (
          <ul className="flex flex-col justify-center gap-3">
            {age.map((band, index) => (
              <li
                key={band.key}
                className="group/mark grid grid-cols-[5.5rem_1fr_auto] items-center gap-3"
              >
                <span className="truncate text-caption text-muted-foreground transition-colors group-hover/mark:text-foreground">
                  {t(`bands.${band.key}`)}
                </span>

                {/* Track and fill share the 8px mark radius: a pill track would
                    show the fill's square start corner poking out of its own
                    rounding at the baseline. */}
                {/*
                  The whole track thickens on hover rather than the fill
                  scaling out of it. 20px still fits inside the row's text
                  line-height, so nothing below moves.
                */}
                <span className="relative h-4 w-full rounded-sm bg-muted transition-all duration-200 ease-[cubic-bezier(.2,.6,.2,1)] group-hover/mark:h-5">
                  <span className="pointer-events-none absolute inset-x-0 bottom-full z-10 mb-1 flex translate-y-1 justify-center opacity-0 transition-all duration-200 ease-[cubic-bezier(.2,.6,.2,1)] group-hover/mark:translate-y-0 group-hover/mark:opacity-100">
                    <ChartTip>{t('tooltip', { count: band.count, band: t(`bands.${band.key}`) })}</ChartTip>
                  </span>

                  <span
                    style={{ width: max > 0 ? `${(band.count / max) * 100}%` : '0%' }}
                    className={cn(
                      'block h-full rounded-e-sm',
                      band.key === 'unknown' ? 'bg-viz-cat-none' : RAMP[Math.min(index, RAMP.length - 1)],
                    )}
                  />
                </span>

                <span className="flex items-baseline gap-1.5 font-mono text-caption tabular-nums">
                  <span className="text-foreground">{formatNumber(locale, band.count)}</span>
                  <span className="text-muted-foreground">{formatPercent(locale, band.share)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
