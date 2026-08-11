import { getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
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

import { PaginatedVisits } from './paginated-visits';

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
 *
 * ## The shape of it
 *
 * **Four cards, not one band.** The figures were a single wide container of
 * four label/value pairs, which made the summary read as one object with four
 * properties rather than as four facts of equal standing — and left the tab's
 * widest element carrying its lightest content. Each is now its own card with a
 * glyph, so the row scans as four tiles and the icon does the work of saying
 * which is which before the label is read.
 *
 * **The next visit is a panel, not a row in a list.** It is the single thing a
 * dietitian opens this tab to find, and it was the first item of a list headed
 * "Upcoming" — the same weight as the fourth one. It now leads that card at
 * full size with the date as a badge, the hour beside it and the length under
 * that; anything else booked follows underneath as ordinary rows, so nothing is
 * hidden and the important one is still obviously the important one.
 *
 * **The past is a paged table of five.** A client of two years has forty rows,
 * and forty rows of anything is not a summary. `PaginatedVisits` shows five and
 * pages through the rest, which keeps this card one fixed height whatever the
 * record holds — see that component for why paging beat both folding it behind
 * a "show more" and scrolling it inside the card.
 *
 * **Green is spent on four things and nothing else**, per the request that set
 * this design: the active tab, the next-visit glyph, today's date mark, and the
 * link to the calendar in the empty state. Every other mark on the tab is a
 * neutral, which is what makes those four read as chosen.
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

/** How many past visits fit one page of the history. */
const PAST_VISITS_PER_PAGE = 5;

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

  const [next, ...laterUpcoming] = upcoming;

  return (
    /*
      `h-full` inside the record shell's bounded, scrolling content box. The
      summary row and the upcoming panel take what they need; the history card
      below takes everything left, so the tab fills the screen it was given
      rather than ending in a band of empty page under the last card. On a
      viewport too short to hold all three, the shell's own scroll takes over —
      nothing here is clipped.
    */
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/*
        The four figures, one card each.

        `gap-3` and `lg:grid-cols-4`: four cards two-up on a phone and a tablet,
        four across from the width a record is actually read at. The band they
        replace used hairlines to divide one container; separate cards need no
        divider, and the gap between them is the same 12px that separates every
        other pair of panels on this tab.
      */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <FigureCard
          icon="calendar"
          label={t('totalVisits')}
          value={String(visits.length)}
        />
        <FigureCard
          icon="check"
          label={t('completedVisits')}
          value={String(past.length)}
        />
        <FigureCard
          icon="history"
          label={t('lastVisit')}
          value={past[0] ? formatMediumDate(locale, past[0].date) : null}
          empty={t('noPast')}
        />
        <FigureCard
          icon="clock"
          label={t('nextVisit')}
          value={next ? formatMediumDate(locale, next.date) : null}
          empty={t('noUpcoming')}
          /* The one glyph in the row that is olive: what is *coming* is the
             figure this tab is opened for. The value stays the body colour like
             the other three — a set of four figures is read across, and one of
             them in a colour of its own reads as a link. */
          accentIcon
        />
      </div>

      {/* What is booked. */}
      <Card>
        <CardHeader className="grid-cols-[1fr_auto] items-baseline gap-2">
          <CardTitle>{t('upcoming')}</CardTitle>
          {upcoming.length > 0 ? <Count value={upcoming.length} /> : null}
        </CardHeader>

        <CardContent>
          {next ? (
            <div className="flex flex-col gap-1">
              <NextVisitPanel
                visit={next}
                locale={locale}
                today={today}
                durationLabels={durationLabels}
                /* The arrow at the end of the panel says "there are others" only
                   when there are — on a single booking it would point at the
                   same row the panel already is. */
                hasMore={laterUpcoming.length > 0}
              />

              {laterUpcoming.length > 0 ? (
                /*
                  Everything else booked, bounded the same way the past list is
                  when it opens: a client with a course of eight sessions booked
                  would otherwise make this card taller than the screen and push
                  the history off the bottom of it. `18rem` is about five rows —
                  the next visit's own panel sits above this, so what is here is
                  already the secondary half of a secondary panel.
                */
                <ul className="max-h-[18rem] divide-y divide-border/60 overflow-y-auto overscroll-contain pe-1">
                  {laterUpcoming.map((visit) => (
                    <VisitRow
                      key={visit.id}
                      visit={visit}
                      locale={locale}
                      today={today}
                      durationLabels={durationLabels}
                    />
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="text-body-sm text-muted-foreground">{t('noUpcoming')}</p>
          )}
        </CardContent>
      </Card>

      {/* What has been — the card that takes the leftover height. */}
      <Card className="flex min-h-0 flex-1 flex-col">
        {past.length === 0 ? (
          <>
            <CardHeader>
              <CardTitle>{t('past')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-body-sm text-muted-foreground">{t('noPast')}</p>
            </CardContent>
          </>
        ) : (
          /*
            The rows are rendered here, on the server, and handed to the client
            component as children — it decides how many of them to show, and
            nothing about a visit has to cross the boundary as data for it to do
            that.

            This list used to scroll inside a `max-h`, which is what the branch
            this merged from was fixing. Pagination removes the question: five
            rows at a time never overflow, so there is no inner scroll port to
            get stuck against the page's own.
          */
          <PaginatedVisits heading={t('past')} perPage={PAST_VISITS_PER_PAGE}>
            {past.map((visit) => (
              <VisitRow
                key={visit.id}
                visit={visit}
                locale={locale}
                today={today}
                durationLabels={durationLabels}
              />
            ))}
          </PaginatedVisits>
        )}
      </Card>
    </div>
  );
}

/** The count beside a section heading: a bare numeral, never a pill. See
    "A badge is a state" in docs/design-system.md — this is a quantity. */
function Count({ value }: { value: number }) {
  return (
    <span className="text-body-md font-semibold tabular-nums text-muted-foreground">{value}</span>
  );
}

/**
 * One figure in the summary row: a glyph, a caption, and a numeral or a date.
 *
 * The glyph sits in a rounded square rather than a disc. A disc is the shape
 * this system gives a *person* — the avatar in the header two rows above is one
 * — and four discs under it would read as four more people.
 */
function FigureCard({
  icon,
  label,
  value,
  empty,
  accentIcon = false,
}: {
  icon: IconName;
  label: string;
  /** `null` renders `empty` in the muted colour — "none" is not a value. */
  value: string | null;
  empty?: string;
  accentIcon?: boolean;
}) {
  return (
    <Card size="sm" className="shadow-xs">
      <CardContent className="flex items-start gap-3">
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg',
            accentIcon
              ? 'bg-primary-subtle text-secondary-foreground'
              : 'bg-muted text-muted-foreground',
          )}
        >
          <Icon name={icon} className="size-[1.125rem]" aria-hidden />
        </span>

        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-caption text-muted-foreground">{label}</span>
          {/*
            `<bdi>` rather than `dir="auto"`. `dir="auto"` on a block takes its
            direction from the first strong character, and "7" or "09/08/2026"
            has none — the paragraph resolved to LTR and its `text-align: start`
            became *left*, so in Arabic the number sat under the neighbouring
            label instead of its own. `bdi` isolates the value's own direction,
            which is what was wanted, without touching the block's alignment.
          */}
          <span
            className={cn(
              'truncate font-heading text-heading-sm font-semibold tabular-nums',
              value === null && 'text-body-md font-normal text-muted-foreground',
            )}
          >
            <bdi>{value ?? empty}</bdi>
          </span>
        </span>
      </CardContent>
    </Card>
  );
}

/**
 * The date a visit falls on: the day, and the month under it.
 *
 * **There is no tile.** Both lists used to open with the date in a bordered,
 * filled square — 40px in a row, 56px in the next-visit panel — and the square
 * was the problem, not its size. Arabic's month names are words rather than
 * three-letter abbreviations (أغسطس, سبتمبر), so the label either broke out
 * over the border or had to be clipped to fit a box whose only job was to look
 * like a calendar page. Widening the box to suit the longest month makes every
 * other row's box wrong.
 *
 * A date is not a control and not a status; it is the label a dated list is
 * scanned by. So it is set as type: the day number at the size of a figure, the
 * month directly under it as a caption, both centred on one axis and nothing
 * drawn around them. The column has a minimum width so the numbers still form a
 * line down the list, and no maximum, so no month in any locale can overflow
 * anything — there is nothing left to overflow.
 *
 * **The one surviving disc means "today".** It sits around the numeral alone,
 * where two digits are a known width, and the month stays outside it in olive.
 * The mark now carries information rather than decorating every row with the
 * same chrome, which is what makes today findable in a list of forty dates at a
 * glance.
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
          // The disc only exists on today, so it is sized to the numeral rather
          // than to the whole mark: two digits at either type size clear 28px.
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
 *
 * `self-center` because the lines it appears in are baseline-aligned, and an
 * empty inline box baselines on its bottom edge — the dot would hang below the
 * text it separates.
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
  durationLabels: { hour: (n: number) => string; minute: (n: number) => string };
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
  durationLabels: { hour: (n: number) => string; minute: (n: number) => string };
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
            {/*
              A dot, not a third gap. Three fragments separated by equal spaces
              read as three separate things; one punctuated line reads as one
              line of detail. Drawn rather than typed, and `aria-hidden` — it is
              punctuation for the eye, and a screen reader gets the spans either
              side of it.
            */}
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
          own. At full strength on every row it was a column of arrows running
          down the card competing with the dates. Opacity rather than a hidden
          element, so the rows do not shift on hover and touch — where there is
          no hover to reveal anything — never loses it.
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
