import { getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import {
  formatDayNumber,
  formatDuration,
  formatMediumDate,
  formatMinuteRange,
  formatMonthName,
  formatMonthShort,
  formatWeekday,
} from '../format';
import { type ClientVisitEntry } from '../queries';
import { visitStats, type VisitStats } from '../visit-stats';

import { VisitViews, type VisitViewOption } from './visit-views';

/**
 * The Visit history view: what this client has actually been seen for, as a
 * record.
 *
 * **It used to be a calendar** — the clinic-wide grid, filtered to one person.
 * That is the wrong instrument for the question this view is asked. A calendar
 * answers "what is happening on this date"; a client's history is asked "when
 * did I last see them, how often, and what is booked next", and a month grid
 * makes all three of those a counting exercise across empty cells.
 *
 * ## The shape of it
 *
 * **A strip of facts, and two views of the record under it** — what is booked,
 * and what has already happened.
 *
 * ⚠ **This used to be a rail beside the views, and that rail led with the
 * patient's avatar, name and goal.** It was a port of the template's left panel,
 * made while this was still a route of its own. It is a view of the profile now,
 * and the profile has that panel — permanently, beside every view — so the rail
 * had become the same person drawn a second time, in a column that also cost the
 * history a third of its width. What the rail knew that the panel does not is
 * the *shape of the attendance*, and those five facts are what survived, set
 * across one line where they take a row rather than a column.
 *
 * **Three views, not three stacked cards.** The record used to draw the figures,
 * the upcoming panel and the past table one under another, which put the most
 * recent visit below two screens of summary on a laptop. See `VisitViews` for
 * why the switch is a `Segmented` and not a second row of tabs.
 *
 * **Green is spent on what you can press and what is not here yet** — today's
 * date mark, the current dot beside a booked visit, and the button that leads to
 * the calendar. The facts themselves are black: they are reference, and a
 * coloured value in a row of plain ones reads as the others having been greyed
 * out rather than as that one being chosen.
 */

export type ClientVisitRecordProps = {
  visits: ClientVisitEntry[];
  locale: Locale;
  /**
   * Resolved once by the page, so the split between past and upcoming is
   * measured against the same day the rest of the record is.
   */
  today: string;
};

type DurationLabels = { hour: (n: number) => string; minute: (n: number) => string };

export async function ClientVisitRecord({ visits, locale, today }: ClientVisitRecordProps) {
  const [t, tBooking] = await Promise.all([
    getTranslations('clients.visits'),
    getTranslations('booking'),
  ]);

  const upcoming = visits.filter((visit) => visit.date >= today).reverse();
  const past = visits.filter((visit) => visit.date < today);

  const durationLabels: DurationLabels = {
    hour: (count: number) => tBooking('duration.hours', { count }),
    minute: (count: number) => tBooking('duration.minutes', { count }),
  };

  /*
    A record with nothing in it is one statement and one way out, not a strip of
    dashes above three empty views. The same dashed box the dashboard's empty
    panels use, so a "nothing here yet" reads the same wherever it appears.
  */
  if (visits.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-8 text-center">
          <Icon name="calendar" className="size-6 text-muted-foreground" />
          <p className="text-body-md text-muted-foreground">{t('empty')}</p>
          <Link
            href="/app/calendar/day"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            {t('book')}
            <Icon name="chevronEnd" />
          </Link>
        </CardContent>
      </Card>
    );
  }

  const stats = visitStats(visits, today);
  const [next, ...laterUpcoming] = upcoming;

  const viewOptions: readonly VisitViewOption[] = [
    { value: 'upcoming', label: t('views.upcoming'), count: upcoming.length },
    { value: 'past', label: t('views.past'), count: past.length },
  ];

  return (
    /*
      One column, and from `lg` up it is the height of the view it sits in: the
      facts hold their natural height and the views card takes what is left and
      scrolls its own content. `min-h-0` at every level is what lets that flex
      child actually shrink instead of growing the page.
    */
    <div className="flex flex-col gap-4 lg:h-full lg:min-h-0">
      <VisitFacts
        stats={stats}
        locale={locale}
        labels={{
          firstVisit: t('firstVisit'),
          lastVisit: t('lastVisit'),
          nextVisit: t('nextVisit'),
          typicalGap: t('typicalGap'),
          totalTime: t('totalTime'),
          none: t('noneRecorded'),
          book: t('book'),
          everyDays: (days: number) => t('everyDays', { days }),
        }}
        durationLabels={durationLabels}
      />

      <VisitViews
        title={t('title')}
        label={t('views.label')}
        options={viewOptions}
        upcoming={
          next ? (
            <div className="flex flex-col gap-1">
              <NextVisitPanel
                visit={next}
                locale={locale}
                today={today}
                durationLabels={durationLabels}
                hasMore={laterUpcoming.length > 0}
              />

              {laterUpcoming.length > 0 ? (
                <VisitList
                  visits={laterUpcoming}
                  locale={locale}
                  today={today}
                  durationLabels={durationLabels}
                />
              ) : null}
            </div>
          ) : (
            <EmptyView label={t('noUpcoming')} />
          )
        }
        past={
          past.length === 0 ? (
            <EmptyView label={t('noPast')} />
          ) : (
            <VisitList
              visits={past}
              locale={locale}
              today={today}
              durationLabels={durationLabels}
            />
          )
        }
      />
    </div>
  );
}

/* ── The facts ───────────────────────────────────────────────────────────── */

type FactLabels = {
  firstVisit: string;
  lastVisit: string;
  nextVisit: string;
  typicalGap: string;
  totalTime: string;
  none: string;
  book: string;
  everyDays: (days: number) => string;
};

/**
 * What the attendance adds up to, on one line.
 *
 * The five facts the summary rail used to stack down the inline-start edge —
 * when it started, when it last happened, what is booked, how often, and how
 * much time it comes to. They are the one thing on this view that no other view
 * of the record states, which is why they survived the rail being cut.
 *
 * **A wrapped row of label/value pairs, not a `StatGrid`.** Three of the five
 * are dates, and a lattice sets its figures at 20px: five dates at that size
 * across this column would be a second heading strip competing with the history
 * under it. Set small, with the label above the value, they read as reference —
 * which is what they are.
 *
 * **The button is here rather than in the views card's header.** That header
 * already carries the view's name, its count and the switch between three
 * panels; a fourth control on the same line is where a header stops being
 * scannable. It also belongs with these five: every one of them is about *when*,
 * and this is the one thing that changes a when.
 */
function VisitFacts({
  stats,
  locale,
  labels,
  durationLabels,
}: {
  stats: VisitStats;
  locale: Locale;
  labels: FactLabels;
  durationLabels: DurationLabels;
}) {
  const facts = [
    {
      label: labels.firstVisit,
      value: stats.firstVisit && formatMediumDate(locale, stats.firstVisit),
    },
    {
      label: labels.lastVisit,
      value: stats.lastVisit && formatMediumDate(locale, stats.lastVisit),
    },
    {
      label: labels.nextVisit,
      value: stats.nextVisit && formatMediumDate(locale, stats.nextVisit),
    },
    {
      label: labels.typicalGap,
      value: stats.typicalGapDays === null ? null : labels.everyDays(stats.typicalGapDays),
    },
    {
      label: labels.totalTime,
      value: stats.totalMinutes === 0 ? null : formatDuration(stats.totalMinutes, durationLabels),
    },
  ];

  return (
    <Card size="sm" className="shrink-0">
      <CardContent className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <dl className="flex min-w-0 flex-wrap items-baseline gap-x-8 gap-y-3">
          {facts.map((fact) => (
            <div key={fact.label} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-caption text-muted-foreground">{fact.label}</dt>
              {/*
                `<bdi>` isolates the value's own direction. A formatted date has
                no strong character to set a block's direction from, so
                `dir="auto"` would resolve it LTR and drag its alignment with it.
              */}
              {/*
                Every value is full-strength foreground, the next visit included.
                It carried green-700 as "the one accented fact", which put a
                coloured date in a row of black ones and made the strip read as
                though the other four had been greyed out. The row is reference;
                olive stays on the things you press.
              */}
              <dd
                className={cn(
                  'truncate text-body-sm font-semibold tabular-nums',
                  fact.value === null && 'font-normal text-muted-foreground',
                )}
              >
                <bdi>{fact.value ?? labels.none}</bdi>
              </dd>
            </div>
          ))}
        </dl>

        <Link
          href="/app/calendar/day"
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <Icon name="bookAppointment" />
          {labels.book}
        </Link>
      </CardContent>
    </Card>
  );
}

/* ── The two views ─────────────────────────────────────────────────────── */

/* ── Shared parts ────────────────────────────────────────────────────────── */

/**
 * A ruled list of visits.
 *
 * **It scrolls rather than pages.** This was a `PaginatedVisits` — five rows at a
 * time under a Previous/Next pair — which existed to stop a two-year client
 * making the card forty rows tall back when the card sized itself to its
 * content. The card is now a fixed height that fills the screen and scrolls its
 * own content, so the constraint the pager was answering is gone, and paging
 * through history you can simply scroll is a control asking to be pressed for
 * nothing.
 *
 * `-mx-2` lets each row's hover fill reach the card's own padding, so a row
 * reads as a row rather than as a chip floating inside a box.
 */
function VisitList({
  visits,
  locale,
  today,
  durationLabels,
}: {
  visits: ClientVisitEntry[];
  locale: Locale;
  today: string;
  durationLabels: DurationLabels;
}) {
  return (
    <ul className="-mx-2 divide-y divide-border/60">
      {visits.map((visit) => (
        <VisitRow
          key={visit.id}
          visit={visit}
          locale={locale}
          today={today}
          durationLabels={durationLabels}
        />
      ))}
    </ul>
  );
}

/** A view with nothing in it. The card around it already carries the heading. */
function EmptyView({ label }: { label: string }) {
  return <p className="text-body-sm text-muted-foreground">{label}</p>;
}

/**
 * The date a visit falls on: the day, and the month under it.
 *
 * **There is no tile.** Both lists used to open with the date in a bordered,
 * filled square, and the square was the problem, not its size. Arabic's month
 * names are words rather than three-letter abbreviations (أغسطس, سبتمبر), so the
 * label either broke out over the border or had to be clipped to fit a box whose
 * only job was to look like a calendar page.
 *
 * A date is not a control and not a status; it is the label a dated list is
 * scanned by. So it is set as type: the day number at the size of a figure, the
 * month directly under it as a caption, both centred on one axis and nothing
 * drawn around them.
 *
 * **The one surviving disc means "today".** It sits around the numeral alone,
 * where two digits are a known width, and the month stays outside it in olive.
 */
function DateMark({
  locale,
  date,
  month,
  isToday,
  size = 'default',
}: {
  locale: Locale;
  date: string;
  /** Already formatted — short in a row, the full name in the panel. */
  month: string;
  isToday: boolean;
  size?: 'default' | 'lg';
}) {
  const large = size === 'lg';

  return (
    <span
      className={cn(
        'flex shrink-0 flex-col items-center gap-0.5 leading-none',
        large ? 'min-w-14' : 'min-w-10',
      )}
    >
      <span
        className={cn(
          'flex items-center justify-center tabular-nums',
          large ? 'font-heading text-heading-sm font-semibold' : 'text-body-sm font-semibold',
          isToday &&
            cn(
              'rounded-full bg-primary-subtle text-secondary-foreground',
              large ? 'size-9' : 'size-7',
            ),
        )}
      >
        {formatDayNumber(locale, date)}
      </span>

      <span
        className={cn(
          'whitespace-nowrap',
          large ? 'text-caption' : 'text-[0.625rem]',
          isToday ? 'text-secondary-foreground' : 'text-muted-foreground',
        )}
      >
        {month}
      </span>
    </span>
  );
}

/**
 * The separator between two fragments of one line of detail.
 *
 * Drawn rather than typed. A `•` is a glyph of whatever face is loaded — it
 * changes size with the text around it, sits on a different optical centre in
 * Arabic than in Latin, and inherits a colour it was never designed for at 4px.
 * A 4px circle is the same mark at every font size in both scripts.
 */
function DotSeparator() {
  return <span aria-hidden className="size-1 shrink-0 self-center rounded-full bg-border" />;
}

/**
 * The next appointment, at the size of the thing it is.
 *
 * A date badge, then the weekday over the hour, then how long — three facts
 * separated by position rather than by punctuation, which is what lets each be
 * read without reading the others. The whole panel is the link, as every row on
 * this tab is, and it goes to that day in the calendar because this tab cannot
 * move a booking and the day view is where every gesture that can lives.
 */
function NextVisitPanel({
  visit,
  locale,
  today,
  durationLabels,
  hasMore,
}: {
  visit: ClientVisitEntry;
  locale: Locale;
  today: string;
  durationLabels: DurationLabels;
  hasMore: boolean;
}) {
  const isToday = visit.date === today;

  return (
    <Link
      href={`/app/calendar/day?date=${visit.date}`}
      className="group flex items-center gap-4 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/30 hover:bg-primary-subtle/30"
    >
      <DateMark
        locale={locale}
        date={visit.date}
        month={formatMonthName(locale, visit.date)}
        isToday={isToday}
        size="lg"
      />

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-body-md font-semibold">
          {formatWeekday(locale, visit.date, 'long')}
        </span>

        <span className="flex flex-wrap items-baseline gap-x-2 text-body-sm text-muted-foreground">
          <span className="tabular-nums">
            <bdi>
              {formatMinuteRange(
                locale,
                visit.date,
                visit.startMinute,
                visit.startMinute + visit.durationMinutes,
              )}
            </bdi>
          </span>
          <DotSeparator />
          <span>{formatDuration(visit.durationMinutes, durationLabels)}</span>
        </span>

        {visit.reason ? (
          <span className="truncate text-caption text-muted-foreground" dir="auto">
            {visit.reason}
          </span>
        ) : null}
      </span>

      {hasMore ? (
        <Icon
          name="chevronEnd"
          className="size-5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-secondary-foreground"
          aria-hidden
        />
      ) : null}
    </Link>
  );
}

/**
 * One visit, as a row of a table.
 *
 * The day number over its month, then the weekday, then the hour and the
 * length — four columns that line up down the list, so a run of visits is read
 * by scanning a column rather than by reading each row. Below `sm` the clock
 * detail drops under the weekday, because four columns in a phone's width is
 * four truncations.
 */
function VisitRow({
  visit,
  locale,
  today,
  durationLabels,
}: {
  visit: ClientVisitEntry;
  locale: Locale;
  today: string;
  durationLabels: DurationLabels;
}) {
  const isToday = visit.date === today;

  return (
    <li>
      <Link
        href={`/app/calendar/day?date=${visit.date}`}
        className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/70"
      >
        <DateMark
          locale={locale}
          date={visit.date}
          month={formatMonthShort(locale, visit.date)}
          isToday={isToday}
        />

        <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
          {/*
            `min-w-24` rather than `w-24`: the weekday is a column and the times
            beside it should start on one line down the list, but a fixed track
            truncates الأربعاء and Wednesday at the width the shortest day
            needs. A minimum keeps the column while letting the one long name
            in the list set it.
          */}
          <span className="text-body-sm font-medium whitespace-nowrap sm:min-w-24 sm:shrink-0">
            {formatWeekday(locale, visit.date, 'long')}
          </span>

          <span className="flex min-w-0 items-center gap-1.5 text-caption text-muted-foreground">
            <span className="tabular-nums whitespace-nowrap">
              <bdi>
                {formatMinuteRange(
                  locale,
                  visit.date,
                  visit.startMinute,
                  visit.startMinute + visit.durationMinutes,
                )}
              </bdi>
            </span>
            <DotSeparator />
            <span className="whitespace-nowrap">
              {formatDuration(visit.durationMinutes, durationLabels)}
            </span>

            {visit.reason ? (
              <>
                <DotSeparator />
                <span className="truncate" dir="auto">
                  {visit.reason}
                </span>
              </>
            ) : null}
          </span>
        </span>

        {/*
          Drawn at the weight of a hint and firmed up under the pointer: it is
          an affordance for a row that is entirely a link, not a control of its
          own. Opacity rather than a hidden element, so the rows do not shift on
          hover and touch — where there is no hover to reveal anything — never
          loses it.
        */}
        <Icon
          name="chevronEnd"
          className="size-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground"
          aria-hidden
        />
      </Link>
    </li>
  );
}
