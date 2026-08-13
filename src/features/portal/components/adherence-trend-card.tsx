import { useLocale, useTranslations } from 'next-intl';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { type MonthlyTrendWeek } from '@/features/portal/adherence';
import { getLocaleDirection, type Locale } from '@/i18n/routing';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * "تطور الالتزام" — the last four calendar weeks, one bar each.
 *
 * Bars, not a line: four points is a comparison between weeks, not a
 * continuous quantity, and a bar per week reads as "how did each week do"
 * where a line invites reading a slope between only four samples. The
 * current week is the one bar in olive; the rest sit in a quieter tone so the
 * eye lands on where the client is now before comparing it to where they were.
 */
export function AdherenceTrendCard({ weeks }: { weeks: MonthlyTrendWeek[] }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('portal.progress.trend');

  const rtl = getLocaleDirection(locale) === 'rtl';
  // `weeks` arrives oldest first. `dir="ltr"` below pins the row to a fixed
  // physical order regardless of the page's own direction, so the bars
  // cannot silently flip with it; the array itself is reversed for Arabic
  // instead, which is what puts the oldest week — "the first week" — at the
  // physical right, where a right-to-left reader starts.
  const orderedWeeks = rtl ? [...weeks].reverse() : weeks;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <p className="text-xs text-muted-foreground">{t('subtitle')}</p>
      </CardHeader>

      <CardContent>
        <div dir="ltr" className="flex items-end justify-between gap-3">
          {orderedWeeks.map((week) => {
            const percent = week.averageFraction ?? 0;
            const heightPercent = Math.max(percent * 100, week.averageFraction === null ? 0 : 6);

            return (
              <div key={week.weekStartDate} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-xs font-medium tabular-nums text-muted-foreground">
                  {week.averageFraction === null ? '—' : formatNumber(locale, week.averageFraction, { style: 'percent' })}
                </span>

                <div className="flex h-24 w-full items-end rounded-md bg-muted">
                  <div
                    style={{ height: `${heightPercent}%` }}
                    className={cn('w-full rounded-md', week.isCurrent ? 'bg-primary' : 'bg-primary/30')}
                  />
                </div>

                <span className="text-caption font-semibold text-secondary-foreground">
                  {week.isCurrent ? t('thisWeek') : ' '}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
