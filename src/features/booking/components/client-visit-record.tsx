import { getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import {
  formatDayNumber,
  formatDuration,
  formatMediumDate,
  formatMinuteRange,
  formatMonthShort,
  formatWeekday,
} from '../format';
import { type ClientVisitEntry } from '../queries';

/**
 * The Visit History tab: what this client has actually been seen for, as a
 * record.
 *
 * **It used to be a calendar** — the clinic-wide grid, filtered to one person.
 * That is the wrong instrument for the question this tab is asked. A calendar
 * answers "what is happening on this date"; a client's history is asked "when
 * did I last see them, how often, and what is booked next", and a month grid
 * makes all three of those a counting exercise across empty cells. A client
 * seen fortnightly showed two chips in thirty squares, and finding the visit
 * before last meant paging backwards through months to look for one.
 *
 * A dated list answers all three at a glance and costs a fraction of the
 * height. The grid has not gone anywhere — it is the clinic calendar, which is
 * where a booking is made and moved, and every row here links into the day it
 * belongs to.
 *
 * **Four figures, then two lists.** The figures are the summary a dietitian
 * opens this tab for; the lists are what is coming and what has been. Upcoming
 * reads forwards, because the next thing is the near one; past reads backwards,
 * for exactly the same reason.
 */

/**
 * Everything the tab needs about the clock, resolved once by the page.
 *
 * `today` is passed in rather than read here so that the split between past and
 * upcoming is measured against the same day the rest of the record is — the
 * same contract `getClientVisitSummary` states.
 */
export type ClientVisitRecordProps = {
  visits: ClientVisitEntry[];
  locale: Locale;
  today: string;
};

export async function ClientVisitRecord({
  visits,
  locale,
  today,
}: ClientVisitRecordProps) {
  const [t, tBooking] = await Promise.all([
    getTranslations('clients.visits'),
    getTranslations('booking'),
  ]);

  /*
    A visit *on* today counts as upcoming, not past — the same rule the record
    header uses, and for the same reason: an appointment earlier this morning is
    still the one a dietitian is asking about when they open the record.

    `visits` arrives newest first, so the upcoming half has to be reversed to
    read forwards while the past half is already in the order it wants.
  */
  const upcoming = visits.filter((visit) => visit.date >= today).reverse();
  const past = visits.filter((visit) => visit.date < today);

  const durationLabels = {
    hour: (count: number) => tBooking('duration.hours', { count }),
    minute: (count: number) => tBooking('duration.minutes', { count }),
  };

  /*
    A record with nothing in it is one statement and one way out, not a band of
    four zeroes over two empty lists. The same dashed box the dashboard's empty
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

  return (
    <div className="flex flex-col gap-4">
      {/*
        The four figures, as one band of plain numerals rather than four cards.
        A card per statistic would put three borders and three shadows across
        the top of a tab whose actual subject is the list underneath — these are
        a caption and a number each, and dividing rules are enough to keep them
        apart. `sm:grid-cols-4` and not `grid-cols-2 md:grid-cols-4`: four short
        figures fit a phone two-up, and stacking them one per row would push the
        list itself below the fold on the screen with the least of it.
      */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4 sm:gap-x-6">
          <Figure label={t('totalVisits')} value={String(visits.length)} />
          <Figure label={t('completedVisits')} value={String(past.length)} />
          <Figure
            label={t('lastVisit')}
            value={past[0] ? formatMediumDate(locale, past[0].date) : null}
            empty={t('noPast')}
          />
          <Figure
            label={t('nextVisit')}
            value={upcoming[0] ? formatMediumDate(locale, upcoming[0].date) : null}
            empty={t('noUpcoming')}
            /* The one figure that is a plan rather than a fact. */
            accent
          />
        </CardContent>
      </Card>

      <VisitList
        heading={t('upcoming')}
        count={upcoming.length}
        visits={upcoming}
        emptyLabel={t('noUpcoming')}
        locale={locale}
        today={today}
        durationLabels={durationLabels}
      />

      <VisitList
        heading={t('past')}
        count={past.length}
        visits={past}
        emptyLabel={t('noPast')}
        locale={locale}
        today={today}
        durationLabels={durationLabels}
      />
    </div>
  );
}

/** One figure in the summary band: a caption over a numeral or a date. */
function Figure({
  label,
  value,
  empty,
  accent = false,
}: {
  label: string;
  /** `null` renders `empty` in the muted colour — "none" is not a value. */
  value: string | null;
  empty?: string;
  accent?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="text-caption text-muted-foreground">{label}</p>
      <p
        className={cn(
          'truncate text-heading-sm font-semibold tabular-nums',
          value === null && 'text-body-md font-normal text-muted-foreground',
          value !== null && accent && 'text-primary',
        )}
        dir="auto"
      >
        {value ?? empty}
      </p>
    </div>
  );
}

function VisitList({
  heading,
  count,
  visits,
  emptyLabel,
  locale,
  today,
  durationLabels,
}: {
  heading: string;
  count: number;
  visits: ClientVisitEntry[];
  emptyLabel: string;
  locale: Locale;
  today: string;
  durationLabels: { hour: (n: number) => string; minute: (n: number) => string };
}) {
  return (
    <Card>
      {/* The count beside the heading is a bare numeral, not a pill: a count is
          a quantity, not a state. See "A badge is a state" in
          docs/design-system.md. */}
      <CardHeader className="grid-cols-[1fr_auto] items-baseline gap-2">
        <CardTitle>{heading}</CardTitle>
        {count > 0 ? (
          <span className="text-body-md font-semibold tabular-nums text-muted-foreground">
            {count}
          </span>
        ) : null}
      </CardHeader>

      <CardContent>
        {visits.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          /*
            `-mx-2` lets each row's hover fill reach the card's own padding, so
            a row reads as a row rather than as a chip floating inside a box.
            The list scrolls past a screenful instead of making the tab do it:
            a client of four years has a long history and the summary band above
            should stay put while it is read.

            No `overscroll-contain`: a client with three visits does not reach
            the ceiling, and containment holds whether or not the box has
            anywhere to scroll — so the list would sit there refusing to move
            and refusing to let the page move either. See
            `dashboard/components/clients-card.tsx`.
          */
          <ul className="-mx-2 max-h-[26rem] overflow-y-auto">
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
        )}
      </CardContent>
    </Card>
  );
}

/**
 * One visit.
 *
 * A date tile, then the time and how long, then what it was for. The tile
 * carries the day number over the month because that is the part the eye scans
 * a dated list by, and it means a run of visits in one month reads as one
 * column of numbers rather than as five repetitions of "August".
 *
 * The whole row links to that day in the client's own calendar — this tab
 * cannot change a booking, and the day view is where every gesture that can is.
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
  durationLabels: { hour: (n: number) => string; minute: (n: number) => string };
}) {
  const isToday = visit.date === today;

  return (
    <li>
      <Link
        href={`/app/calendar/day?date=${visit.date}`}
        className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/70"
      >
        {/*
          Today's tile takes the brand fill, the same pip the calendar marks
          today with. Everything else is the sunken surface — a date is a label
          here, not a state.
        */}
        <span
          className={cn(
            'flex size-11 shrink-0 flex-col items-center justify-center rounded-lg leading-none',
            isToday ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
          )}
        >
          <span className="text-body-md font-semibold tabular-nums">
            {formatDayNumber(locale, visit.date)}
          </span>
          <span className="mt-0.5 text-[0.625rem] opacity-80">
            {formatMonthShort(locale, visit.date)}
          </span>
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-baseline gap-x-2 text-body-sm">
            <span className="font-medium">{formatWeekday(locale, visit.date, 'long')}</span>
            <span className="tabular-nums text-muted-foreground" dir="auto">
              {formatMinuteRange(
                locale,
                visit.date,
                visit.startMinute,
                visit.startMinute + visit.durationMinutes,
              )}
            </span>
            <span className="text-caption text-muted-foreground">
              {formatDuration(visit.durationMinutes, durationLabels)}
            </span>
          </span>

          {/* The reason is free text and often blank; the row does not reserve
              a line for one that is not there. */}
          {visit.reason ? (
            <span className="truncate text-caption text-muted-foreground" dir="auto">
              {visit.reason}
            </span>
          ) : null}
        </span>

        <Icon
          name="chevronEnd"
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </Link>
    </li>
  );
}

