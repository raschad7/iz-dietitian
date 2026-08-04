import { useLocale, useTranslations } from 'next-intl';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DAYS_PER_WEEK } from '@/features/portal/check-ins';
import { type Locale } from '@/i18n/routing';
import { formatNumber } from '@/lib/format';

/**
 * "هذا الأسبوع" — the week's adherence as one bare percentage, no ring.
 *
 * Deliberately not the Q-ring `WeekProgress` draws on the home screen: that
 * ring's meaning is "how much of the week has a check-in", and drawing a
 * second ring here with a different meaning on the same app would make the
 * mark ambiguous the moment someone has seen both screens. A plain number
 * says the same thing once, correctly.
 *
 * The average is over days actually reported, not over all seven — the same
 * rule `summariseWeek` applies to check-ins: a day with nothing logged is
 * absent from the average, not a zero.
 *
 * `recordedCount` and `fullyCompletedCount` answer two different questions —
 * "did the client say anything about this day" versus "did they say `full`" —
 * and stay two separate lines rather than one for the same reason the average
 * and the day count already do: folding them together would hide which one
 * moved when a client corrects a `partial` day to `full`.
 */
export function WeekAdherenceSummary({
  averageFraction,
  recordedCount,
  fullyCompletedCount,
}: {
  averageFraction: number | null;
  recordedCount: number;
  fullyCompletedCount: number;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations('portal.progress.week');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>

      <CardContent className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="font-heading text-3xl leading-none font-medium tabular-nums">
            {averageFraction === null ? '—' : formatNumber(locale, averageFraction, { style: 'percent' })}
          </p>
          <p className="text-sm text-muted-foreground">{t('average')}</p>
        </div>

        <div className="space-y-1 text-end">
          <p className="text-sm text-muted-foreground">{t('recorded', { count: recordedCount, total: DAYS_PER_WEEK })}</p>
          <p className="text-sm text-muted-foreground">
            {t('completed', { count: fullyCompletedCount, total: DAYS_PER_WEEK })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
