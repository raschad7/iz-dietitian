import { getTranslations } from 'next-intl/server';

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { addDays } from '@/features/booking/date';
import { formatDayNumber, formatLongDateRange, formatMonthShort } from '@/features/booking/format';
import { AppointmentsChart, ClientIntakeChart, type ChartPoint } from '@/features/dashboard/components/stat-charts';
import { type DashboardData } from '@/features/dashboard/page-data';
import { trendOf } from '@/features/dashboard/trends';
import { ClientFormTrigger } from '@/features/clients/components/client-form-trigger';
import { Link } from '@/i18n/navigation';
import { getLocaleDirection, type Locale } from '@/i18n/routing';
import { formatNumber } from '@/lib/format';

/**
 * The two cards at the top of the dashboard's working column — the register's
 * pulse, and the diary's.
 *
 * They replaced the three quick-action tiles that used to head this column. The
 * tiles were three links styled as surfaces, and the sidebar already carried
 * every one of their destinations; what the top of the page was missing was not
 * another way to navigate but a reason to look at it. Each card is now a
 * number, its shape over time, and one thing to do about it.
 *
 * **Neither card is a link, and the whole card is not clickable.** The action
 * lives in a single control in the header — a corner icon, at the block-start
 * inline-end, which is the top-left in Arabic and the top-right in English.
 * That is deliberate: a card whose entire surface navigates cannot also carry a
 * chart you hover to read, because every tooltip becomes a misfire waiting to
 * happen. One small target, in the same place on both cards.
 *
 * **The numbers are not counts of what the page already shows.** That is what
 * sank the summary tiles this page carried a year ago (see the note in
 * `queries.ts`): every one of them was a total the calendar or the register
 * could give you in a click. A six-month intake curve and an eight-week diary
 * are facts about the practice that no other screen in the app states, and the
 * two sublines — a trend, and the number of active clients with nothing booked
 * — are the parts you can act on.
 */

type StatCardsProps = {
  stats: DashboardData['stats'];
  today: string;
  locale: Locale;
};

/** Which glyph a trend earns. `flat` gets no arrow — see `Trendline` below. */
const TREND_ICONS = {
  up: 'driftUp',
  down: 'driftDown',
} as const satisfies Record<'up' | 'down', IconName>;

/**
 * The card's footer line: an arrow, a percentage, and what it is measured
 * against.
 *
 * `flat` renders the sentence without an arrow rather than with a sideways one.
 * An arrow is a claim that something is moving, and the flat band exists
 * precisely to say that nothing is — drawing a mark for it would put the
 * strongest visual signal on the card's least eventful state.
 */
function Trendline({ direction, children }: { direction: 'up' | 'down' | 'flat'; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
      {direction === 'flat' ? null : (
        <Icon name={TREND_ICONS[direction]} className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/**
 * The shell both cards share: a titled header with one action in the corner, a
 * headline figure, a plot, and a footer line.
 *
 * A shared shell rather than two hand-built cards, because the whole point of a
 * pair is that the eye can compare them — two headline figures on the same
 * baseline, two plots of the same height, two footers in the same place. That
 * only stays true if it is one component.
 */
function StatCard({
  icon,
  title,
  value,
  caption,
  action,
  chart,
  footer,
}: {
  icon: IconName;
  title: string;
  value: string;
  caption: string;
  action: React.ReactNode;
  chart: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <Card className="min-w-0 gap-3">
      <CardHeader>
        <CardTitle as="h2" size="sm" tone="muted" icon={icon}>
          {title}
        </CardTitle>
        <CardAction>{action}</CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-1">
        {/*
          The figure is the largest thing on the card and sits directly above
          its own plot, so the number and its shape are read as one object.
          `tabular-nums` keeps two cards side by side from shifting their
          baselines as the counts change width.
        */}
        <p className="font-heading text-display-sm leading-none font-semibold tabular-nums">{value}</p>
        <CardDescription>{caption}</CardDescription>
      </CardContent>

      <CardContent className="min-w-0">{chart}</CardContent>

      <CardContent>{footer}</CardContent>
    </Card>
  );
}

/**
 * The corner control. A 40px target drawn as a plain glyph rather than a
 * `Button`, so it reads as part of the card's header rather than as a control
 * parked on top of it — and so the two cards can use a link and a dialog
 * trigger without one of them looking like a different kind of thing.
 *
 * **It rests muted and comes up to full strength on hover.** Nothing fills,
 * nothing moves: the glyph is quiet while you are reading the number it sits
 * beside, and states its presence when you reach for it. A filled disc here
 * competed with the card's own figure for the eye, on the one card where the
 * figure is the whole point.
 */
const ACTION_CLASS =
  'flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * The plus on the clients card.
 *
 * A literal character, not an icon: the icon set has no bare plus, only a
 * plus-in-a-circle, and a stroked circle at this size reads as a smudge rather
 * than a mark. The same call the quick-action tiles made before they were
 * replaced. `leading-none` and `pb-0.5` because a `+` sits high in its own em
 * box and would otherwise look pushed toward the bottom of its target.
 */
function PlusGlyph() {
  return (
    <span aria-hidden className="pb-0.5 text-[1.75rem] leading-none font-normal">
      +
    </span>
  );
}

export async function StatCards({ stats, today, locale }: StatCardsProps) {
  const t = await getTranslations('dashboard.stats');
  const direction = getLocaleDirection(locale);

  const intake: ChartPoint[] = stats.clientsByMonth.map((point) => ({
    label: formatMonthShort(locale, point.month),
    value: point.clients,
  }));

  const diary: ChartPoint[] = stats.appointmentsByWeek.map((week) => ({
    /*
     * A week is labelled by the day it starts on, with its month — `2 Aug`.
     * Eight full ranges would not fit under eight bars at this width, and the
     * current week's range is spelled out in the card's caption above; the tick
     * only has to tell one bar from the next. The month has to be there because
     * the window crosses two of them, and a bare `2` beside a bare `30` says
     * nothing about which came first.
     */
    label: `${formatDayNumber(locale, week.weekStart)} ${formatMonthShort(locale, week.weekStart)}`,
    value: week.appointments,
  }));

  const intakeTrend = trendOf(stats.clientsByMonth.map((point) => point.clients));
  const diaryTrend = trendOf(stats.appointmentsByWeek.map((week) => week.appointments));

  const weekStart = stats.appointmentsByWeek[stats.appointmentsByWeek.length - 1]?.weekStart ?? today;

  return (
    // Two cards inside their own grid, taking two of the page's three columns —
    // so a stat card and the requests card beside it end up the same width. See
    // the band comment in `src/app/[locale]/app/page.tsx`.
    <section aria-label={t('title')} className="grid gap-4 shrink-0 sm:grid-cols-2 lg:col-span-2">
      <StatCard
        icon="clients"
        title={t('clients.title')}
        value={formatNumber(locale, stats.activeClients)}
        caption={t('clients.caption', { count: stats.activeClients })}
        action={
          <ClientFormTrigger locale={locale} className={ACTION_CLASS} aria-label={t('clients.action')}>
            <PlusGlyph />
          </ClientFormTrigger>
        }
        chart={
          <ClientIntakeChart data={intake} direction={direction} seriesLabel={t('clients.series')} />
        }
        footer={
          <Trendline direction={intakeTrend.direction}>
            {intakeTrend.percent === null
              ? t('clients.noTrend')
              : t(`clients.trend.${intakeTrend.direction}`, { percent: intakeTrend.percent })}
          </Trendline>
        }
      />

      <StatCard
        icon="calendar"
        title={t('appointments.title')}
        value={formatNumber(locale, stats.appointmentsThisWeek)}
        caption={formatLongDateRange(locale, weekStart, addDays(weekStart, 6))}
        action={
          <Link href="/app/calendar/week" className={ACTION_CLASS} aria-label={t('appointments.action')}>
            <Icon name="linkArrow" className="size-5" />
          </Link>
        }
        chart={
          <AppointmentsChart data={diary} direction={direction} seriesLabel={t('appointments.series')} />
        }
        footer={
          /*
           * This card's footer prefers the task to the trend. A clinic that
           * booked 12% more this week is mildly interesting; nine active
           * clients with nothing in the diary is a morning's work, and it is
           * the one number on either card that asks for something. The trend
           * takes the line back when there is nobody to chase.
           */
          stats.clientsWithoutNextVisit > 0 ? (
            <p className="text-caption text-muted-foreground">
              <Link href="/app/clients" className="underline underline-offset-2 hover:text-foreground">
                {t('appointments.unbooked', { count: stats.clientsWithoutNextVisit })}
              </Link>
            </p>
          ) : (
            <Trendline direction={diaryTrend.direction}>
              {diaryTrend.percent === null
                ? t('appointments.noTrend')
                : t(`appointments.trend.${diaryTrend.direction}`, { percent: diaryTrend.percent })}
            </Trendline>
          )
        }
      />
    </section>
  );
}
