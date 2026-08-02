import { getTranslations } from 'next-intl/server';

import { Card, CardContent } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { formatMediumDate, formatMediumDateRange, formatMinute, formatMonthYear } from '@/features/booking/format';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { formatNumber } from '@/lib/format';

import { type DashboardData } from '../page-data';

type SummaryTilesProps = {
  summary: DashboardData['summary'];
  nextAppointment: DashboardData['nextAppointment'];
  week: DashboardData['week'];
  today: string;
  locale: Locale;
};

/**
 * Four numbers, one row.
 *
 * Each tile is a number, a label and a subline that says what the number is
 * *about* — a bare count invites "since when?", and answering it in place is
 * cheaper than a tooltip nobody opens. Each links to the page that owns the
 * data; "new clients this month" has no filtered destination in the app, so it
 * lands on the plain clients list rather than a filter that does not exist.
 *
 * Four across on a wide screen, two on a phone: the tiles are peers, and a
 * 1-2-3-4 reflow would rank them differently at every breakpoint.
 */
const TILES = [
  { key: 'todayAppointments', icon: 'calendar', href: '/app/calendar/day' },
  { key: 'upcomingAppointments', icon: 'clock', href: '/app/calendar/week' },
  { key: 'newClientsThisMonth', icon: 'addClient', href: '/app/clients' },
  { key: 'appointmentsThisWeek', icon: 'trend', href: '/app/calendar/week' },
] as const satisfies ReadonlyArray<{
  key: keyof DashboardData['summary'];
  icon: IconName;
  href: '/app/clients' | '/app/calendar/day' | '/app/calendar/week';
}>;

export async function SummaryTiles({ summary, nextAppointment, week, today, locale }: SummaryTilesProps) {
  const t = await getTranslations('dashboard.summary');

  const hints: Record<keyof DashboardData['summary'], string> = {
    todayAppointments: formatMediumDate(locale, today),
    upcomingAppointments: nextAppointment
      ? t('nextIs', {
          when: `${formatMediumDate(locale, nextAppointment.date)} · ${formatMinute(locale, nextAppointment.date, nextAppointment.startMinute)}`,
        })
      : t('nothingScheduled'),
    newClientsThisMonth: formatMonthYear(locale, today),
    appointmentsThisWeek: formatMediumDateRange(locale, week.start, week.end),
  };

  return (
    <ul className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
      {TILES.map((tile) => (
        <li key={tile.key}>
          {/*
            The same anatomy as a quick action — icon disc, then two lines —
            so the two rows sit at one height and the page keeps its one-screen
            promise. The number takes the title's slot and the hint the
            subline's; nothing was dropped, it was folded.
          */}
          <Link href={tile.href} className="block h-full" title={hints[tile.key]}>
            <Card size="sm" interactive className="h-full">
              <CardContent className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                  <Icon name={tile.icon} className="size-5" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-heading-lg leading-tight font-semibold text-foreground">
                    {formatNumber(locale, summary[tile.key])}
                  </span>
                  <span className="block truncate text-caption text-muted-foreground">{t(tile.key)}</span>
                </span>
              </CardContent>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
