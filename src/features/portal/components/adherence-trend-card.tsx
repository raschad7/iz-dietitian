import { useLocale, useTranslations } from 'next-intl';
import { type CSSProperties } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RevealOnView } from '@/components/ui/reveal-on-view';
import { type MonthlyTrendWeek } from '@/features/portal/adherence';
import { type Locale } from '@/i18n/routing';
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
 *
 * **The bars grow out of the baseline when the card is scrolled to**, the way
 * the dashboard's own bar chart does on load — see `.q-bar` in `globals.css`.
 * On view rather than on load because this is the last card on the tab and is
 * below the fold on a phone: an entrance played while the card is off screen is
 * one nobody sees, and the reader arrives at a chart that has already finished
 * telling them something.
 */

/**
 * How far apart the four bars start, in ms.
 *
 * Recharts grows the dashboard's bars in unison; these are staggered a little
 * because the weeks are ordered and the last of them is *this* week — the one
 * the card is about — so building up to it says something the simultaneous
 * version does not. Small enough to still read as one gesture. The array is
 * oldest-first, so in Arabic it fills from the right, the same direction the
 * streak curve above it draws in.
 */
const BAR_STAGGER_MS = 100;
export function AdherenceTrendCard({ weeks }: { weeks: MonthlyTrendWeek[] }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('portal.progress.trend');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <p className="text-xs text-muted-foreground">{t('subtitle')}</p>
      </CardHeader>

      <CardContent>
        {/*
          The only client code on this card: it watches for the bars entering
          the viewport and flips `data-reveal`, which `.q-bar` keys off.
          Everything inside stays server-rendered — see `RevealOnView`.
        */}
        <RevealOnView className="flex items-end justify-between gap-3">
          {weeks.map((week, index) => {
            const percent = week.averageFraction ?? 0;
            const heightPercent = Math.max(percent * 100, week.averageFraction === null ? 0 : 6);

            return (
              <div key={week.weekStartDate} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-xs font-medium tabular-nums text-muted-foreground">
                  {week.averageFraction === null ? '—' : formatNumber(locale, week.averageFraction, { style: 'percent' })}
                </span>

                <div className="flex h-24 w-full items-end rounded-md bg-muted">
                  {/*
                    `--q-bar-h` rather than an inline `height`: the stylesheet
                    has to hold this bar at zero while the card is still off
                    screen, and no rule can outrank an inline `height`. The
                    delay is inline for the same reason the streak card's dots
                    are — it is per-bar data.
                  */}
                  <div
                    style={
                      {
                        '--q-bar-h': `${heightPercent}%`,
                        animationDelay: `${index * BAR_STAGGER_MS}ms`,
                      } as CSSProperties
                    }
                    className={cn('q-bar w-full rounded-md', week.isCurrent ? 'bg-primary' : 'bg-primary/30')}
                  />
                </div>

                <span className="text-caption font-semibold text-secondary-foreground">
                  {week.isCurrent ? t('thisWeek') : ' '}
                </span>
              </div>
            );
          })}
        </RevealOnView>
      </CardContent>
    </Card>
  );
}
