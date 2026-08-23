import { useLocale, useTranslations } from 'next-intl';
import { type CSSProperties } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RevealOnView } from '@/components/ui/reveal-on-view';
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
 * version does not. Small enough to still read as one gesture. The stagger
 * follows `weeks`' own oldest-first order regardless of language — see
 * `rtl` below for why the *visual* position is a separate concern from this.
 */
const BAR_STAGGER_MS = 100;
export function AdherenceTrendCard({ weeks }: { weeks: MonthlyTrendWeek[] }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('portal.progress.trend');

  const rtl = getLocaleDirection(locale) === 'rtl';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <p className="text-xs text-muted-foreground">{t('subtitle')}</p>
      </CardHeader>

      {/*
        `flex-1` here and down the chain to the bar track, so the plot takes
        whatever height the card is given rather than always being 96px with the
        remainder left blank beneath it.

        It buys nothing on a phone, where this card is alone in its row and
        `min-h-24` is the whole of it — the same 96px it drew before. It matters
        from `lg`, where the progress screen sets this card beside the taller
        "today" ring (`progress/page.tsx`): a grid row stretches both to the
        same height, and without this the extra ~100px was dead space under four
        short bars instead of four taller ones.
      */}
      <CardContent className="flex flex-1 flex-col">
        {/*
          The only client code on this card: it watches for the bars entering
          the viewport and flips `data-reveal`, which `.q-bar` keys off.
          Everything inside stays server-rendered — see `RevealOnView`.

          `items-stretch` rather than `items-end`: every column holds the same
          three things, so they were already the same height and the alignment
          did nothing — but it now has to let each column fill the row so the
          track inside it can.
        */}
        <RevealOnView className="flex flex-1 items-stretch justify-between gap-3">
          {weeks.map((week, index) => {
            const percent = week.averageFraction ?? 0;
            const heightPercent = Math.max(percent * 100, week.averageFraction === null ? 0 : 6);

            return (
              <div
                key={week.weekStartDate}
                // A plain source-order row would put the *last* array entry
                // — this week, the one bar the card is actually about — at
                // the row's RTL end, which is the physical left, furthest
                // from where an Arabic reader's eye starts. `order` moves
                // only the visual position: the stagger above still counts
                // up through `weeks` in its own oldest-first order, so which
                // bar animates first is untouched by which side it lands on.
                style={{ order: rtl ? weeks.length - 1 - index : index }}
                className="flex flex-1 flex-col items-center gap-2"
              >
                <span className="text-xs font-medium tabular-nums text-muted-foreground">
                  {week.averageFraction === null ? '—' : formatNumber(locale, week.averageFraction, { style: 'percent' })}
                </span>

                {/*
                  `min-h-24` and not `h-24`: `flex-1` sets the flex basis to
                  zero, so a fixed height would be the one thing the track
                  cannot honour while still growing with the card. The minimum
                  is the old fixed value, which is what a phone still gets.
                */}
                <div className="flex min-h-24 w-full flex-1 items-end rounded-md bg-muted">
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
