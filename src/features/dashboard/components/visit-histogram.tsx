import { getTranslations } from 'next-intl/server';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartTip } from '@/components/ui/chart-tip';
import { Icon } from '@/components/ui/icon';
import { formatMonthShort, formatMonthYear } from '@/features/booking/format';
import { type MonthlyVisits } from '@/features/dashboard/queries';
import { type Locale } from '@/i18n/routing';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

type VisitHistogramProps = {
  months: MonthlyVisits[];
  locale: Locale;
};

/**
 * Six months of visits, as columns whose **height and colour both carry the
 * count**.
 *
 * The double encoding is deliberate and is the one case where it is right:
 * the ramp is *sequential* (one hue, five monotone lightness steps — see
 * `--viz-seq-*` in globals.css), so colour restates magnitude rather than
 * spending the identity channel on it. That is what makes a quiet month read
 * as quiet from across the room, before anyone has looked at an axis.
 *
 * There is no y-axis: each column's own count sits under it, so every value is
 * readable without hovering. The scale key below the plot is what a sequential
 * chart owes the reader in place of a legend.
 */

/** The five steps of `--viz-seq-*`, darkest last. Index by share of the busiest month. */
const RAMP = ['bg-viz-seq-1', 'bg-viz-seq-2', 'bg-viz-seq-3', 'bg-viz-seq-4', 'bg-viz-seq-5'] as const;

/** Minimum visible column, so a month with one visit is not a hairline. */
const MIN_HEIGHT_PERCENT = 6;

/**
 * Which ramp step a month earns.
 *
 * Relative to the busiest month rather than to a fixed count, because a clinic
 * seeing 8 visits a month and one seeing 800 both need the range spread across
 * all five steps. An empty month gets no step — it is drawn as a track, not as
 * the palest colour, so "none" never reads as "a few".
 */
function rampIndex(visits: number, max: number): number | null {
  if (visits === 0) return null;
  if (max <= 0) return null;

  const step = Math.ceil((visits / max) * RAMP.length);
  return Math.min(RAMP.length, Math.max(1, step)) - 1;
}

export async function VisitHistogram({ months, locale }: VisitHistogramProps) {
  const t = await getTranslations('dashboard.visitHistory');

  const max = Math.max(...months.map((month) => month.visits), 0);
  const total = months.reduce((sum, month) => sum + month.visits, 0);
  const busiest = max > 0 ? months.find((month) => month.visits === max) : undefined;

  return (
    <Card className="min-h-0 xl:h-full">
      <CardHeader className="shrink-0 grid-cols-[auto_1fr] items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-primary">
          <Icon name="trend" className="size-4" />
        </span>
        <span>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('subtitle', { count: total })}</CardDescription>
        </span>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        {total === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-border p-4">
            <Icon name="calendar" className="size-5 text-muted-foreground" />
            <p className="text-body-md text-muted-foreground">{t('empty')}</p>
          </div>
        ) : (
          <>
            {/*
              The plot takes whatever height the card was given — the row is
              sized by the two demographic cards beside it — with a floor so it
              never collapses to nothing on a short screen. `pt-9` is the
              tallest column's tip: without it the busiest month's bubble would
              climb into the card header.
            */}
            <ol className="flex min-h-40 flex-1 items-end justify-between gap-2 pt-9">
              {months.map((month) => {
                const step = rampIndex(month.visits, max);
                const height = step === null ? 0 : Math.max(MIN_HEIGHT_PERCENT, (month.visits / max) * 100);
                const label = formatMonthYear(locale, month.month);

                return (
                  <li key={month.month} className="group/mark flex h-full min-w-0 flex-1 flex-col justify-end gap-2">
                    {/* The column sits in a full-height track, so every month shares one baseline. */}
                    <span className="relative flex h-full items-end justify-center">
                      {/*
                        The tip rides the top of its own column — `bottom` is
                        the column's height, so a short month's tip sits low and
                        a tall one's sits high, and neither covers its mark.
                        It is a sibling of the bar rather than a child so the
                        bar's hover scale does not stretch the text with it.

                        Centred by a full-width flex row rather than by
                        `-translate-x-1/2`, which would need mirroring in Arabic.
                      */}
                      <span
                        style={{ bottom: `${height}%` }}
                        className="pointer-events-none absolute inset-x-0 z-10 mb-2 flex translate-y-1 justify-center opacity-0 transition-all duration-200 ease-[cubic-bezier(.2,.6,.2,1)] group-hover/mark:translate-y-0 group-hover/mark:opacity-100"
                      >
                        <ChartTip>{t('tooltip', { count: month.visits, month: label })}</ChartTip>
                      </span>

                      <span
                        /* An empty month is a hairline on the baseline, not a
                           zero-height nothing — the reader has to see that the
                           month was asked about and came back with none. The
                           inline height is omitted there so the class wins. */
                        style={step === null ? undefined : { height: `${height}%` }}
                        className={cn(
                          'w-full max-w-14 origin-bottom rounded-t-sm transition-transform duration-200 ease-[cubic-bezier(.2,.6,.2,1)]',
                          step === null ? 'h-px bg-border' : cn(RAMP[step], 'group-hover/mark:scale-y-[1.04]'),
                        )}
                      />
                    </span>

                    <span className="flex flex-col items-center gap-0.5">
                      <span className="truncate text-label text-muted-foreground">
                        {formatMonthShort(locale, month.month)}
                      </span>
                      <span className="font-mono text-caption tabular-nums transition-colors group-hover/mark:text-primary">
                        {formatNumber(locale, month.visits)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>

            {/* The scale key a sequential chart carries instead of a legend. */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border pt-3">
              <span className="flex items-center gap-2">
                <span className="text-label text-muted-foreground">{t('fewer')}</span>
                <span className="flex gap-0.5" aria-hidden>
                  {RAMP.map((fill) => (
                    <span key={fill} className={cn('size-2.5 rounded-xs', fill)} />
                  ))}
                </span>
                <span className="text-label text-muted-foreground">{t('more')}</span>
              </span>

              {busiest ? (
                <span className="truncate text-caption text-muted-foreground">
                  {t('busiest', { month: formatMonthYear(locale, busiest.month), count: busiest.visits })}
                </span>
              ) : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
