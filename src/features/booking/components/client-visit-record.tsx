import { getTranslations } from 'next-intl/server';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { Separator } from '@/components/ui/separator';
import {
  Timeline,
  TimelineContent,
  TimelineDot,
  TimelineHeading,
  TimelineItem,
} from '@/components/ui/timeline';
import { isMember } from '@/lib/enum';
import { CLIENT_GOALS } from '@/features/clients/schema';
import { type ClientDetail } from '@/features/clients/queries';
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
import { patientToneStyle } from '../patient-color';
import { type ClientVisitEntry } from '../queries';
import { visitStats, type VisitStats } from '../visit-stats';

import { VisitViews, type VisitViewOption } from './visit-views';

/**
 * The Visit History tab: what this client has actually been seen for, as a
 * record.
 *
 * **It used to be a calendar** — the clinic-wide grid, filtered to one person.
 * That is the wrong instrument for the question this tab is asked. A calendar
 * answers "what is happening on this date"; a client's history is asked "when
 * did I last see them, how often, and what is booked next", and a month grid
 * makes all three of those a counting exercise across empty cells.
 *
 * ## The shape of it
 *
 * **A summary rail, and three views of the record beside it** — the structure of
 * the shadcn admin template's `users/view` page, which is what this tab was
 * asked to adopt. The rail on the inline-start edge holds who this is and what
 * the record adds up to; the column beside it holds the history itself, switched
 * between a timeline, what is booked, and the paged past.
 *
 * ⚠ **The rail repeats the patient's avatar and name, and the record header two
 * rows above already carries both.** That duplication is deliberate and was
 * asked for: the template's page leads with an identity card and this is a port
 * of that page. It is the one thing to reconsider first if this tab ever feels
 * top-heavy — the rail's figures and details stand on their own without it.
 *
 * **The rail is sticky from `lg` up.** It is a summary of the thing being
 * scrolled, so it has no business scrolling away from it; below `lg` it becomes
 * the first block in one column, because a sticky panel on a phone is a panel
 * that eats the screen.
 *
 * **Three views, not three stacked cards.** The record used to draw the figures,
 * the upcoming panel and the past table one under another, which put the most
 * recent visit below two screens of summary on a laptop. See `VisitViews` for
 * why the switch is a `Segmented` and not a second row of link tabs.
 *
 * **Green is spent on what is next and nothing else** — the rail's next-visit
 * figure, today's date mark, the current dot on the timeline, and the one button
 * that leads to the calendar. Every other mark on the tab is a neutral, which is
 * what makes those read as chosen.
 */

export type ClientVisitRecordProps = {
  /**
   * The patient themselves, for the summary rail's identity block.
   *
   * The page has already read this row to prove the record exists, so it is
   * handed down rather than read a second time here.
   */
  client: ClientDetail;
  visits: ClientVisitEntry[];
  locale: Locale;
  /**
   * Resolved once by the page, so the split between past and upcoming is
   * measured against the same day the rest of the record is.
   */
  today: string;
};

type DurationLabels = { hour: (n: number) => string; minute: (n: number) => string };

/**
 * The goal values that have a label. `clients.goal` is a validated `text`
 * column, so a row written by an older build can hold something this app has no
 * message for — `isMember` is what narrows to the ones it does. See
 * `src/lib/enum.ts`.
 */
type ClientGoal = (typeof CLIENT_GOALS)[number];

export async function ClientVisitRecord({
  client,
  visits,
  locale,
  today,
}: ClientVisitRecordProps) {
  const [t, tClients, tBooking] = await Promise.all([
    getTranslations('clients.visits'),
    getTranslations('clients'),
    getTranslations('booking'),
  ]);

  const upcoming = visits.filter((visit) => visit.date >= today).reverse();
  const past = visits.filter((visit) => visit.date < today);

  const durationLabels: DurationLabels = {
    hour: (count: number) => tBooking('duration.hours', { count }),
    minute: (count: number) => tBooking('duration.minutes', { count }),
  };

  /*
    A record with nothing in it is one statement and one way out, not a rail of
    zeroes beside three empty views. The same dashed box the dashboard's empty
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
    { value: 'timeline', label: t('views.timeline'), count: visits.length },
    { value: 'upcoming', label: t('views.upcoming'), count: upcoming.length },
    { value: 'past', label: t('views.past'), count: past.length },
  ];

  return (
    /*
      **Two shapes, and the breakpoint is the whole difference.**

      From `lg` up this fills the record shell's bounded box: `h-full` on a grid
      whose one row is `minmax(0,1fr)`, so the views card takes every pixel the
      screen has and scrolls its own content. The rail opts out with `self-start`
      — a stretched summary would put its one button halfway down an empty panel
      — and sticks, so it stays beside whatever the history is scrolled to.

      Below `lg` it is an ordinary flex column at natural height and the record
      shell scrolls it, because filling a phone's viewport with a 500px rail and
      a card leaves a scroll port too short to read a list in.

      `19.5rem` rather than a fraction: the rail holds label/value pairs at a
      fixed type size, and a percentage track re-wraps those rows at every window
      width.
    */
    <div
      className={cn(
        'flex flex-col gap-4',
        'lg:grid lg:h-full lg:min-h-0 lg:grid-cols-[19.5rem_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]',
      )}
    >
      <SummaryRail
        client={client}
        stats={stats}
        locale={locale}
        labels={{
          details: t('details'),
          total: t('totalVisits'),
          completed: t('completedVisits'),
          firstVisit: t('firstVisit'),
          lastVisit: t('lastVisit'),
          nextVisit: t('nextVisit'),
          typicalGap: t('typicalGap'),
          totalTime: t('totalTime'),
          none: t('noneRecorded'),
          book: t('book'),
          goal: (value: ClientGoal) => tClients(`goal.${value}`),
          everyDays: (days: number) => t('everyDays', { days }),
        }}
        durationLabels={durationLabels}
      />

      <VisitViews
        label={t('views.label')}
        options={viewOptions}
        timeline={
          <VisitTimelineView
            visits={visits}
            locale={locale}
            today={today}
            durationLabels={durationLabels}
            noReason={t('noReason')}
          />
        }
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

/* ── The rail ────────────────────────────────────────────────────────────── */

type RailLabels = {
  details: string;
  total: string;
  completed: string;
  firstVisit: string;
  lastVisit: string;
  nextVisit: string;
  typicalGap: string;
  totalTime: string;
  none: string;
  book: string;
  goal: (value: ClientGoal) => string;
  everyDays: (days: number) => string;
};

/**
 * Who this is, and what the record adds up to.
 *
 * The template's left panel, carrying this product's facts: its "Task Done /
 * Project Done" pair becomes the two counts a visit record has, and its
 * eight-row account detail list becomes five rows that are all about *visits*.
 *
 * Deliberately not a second Info tab. Phone, age, sex and goal are one tab away
 * and already laid out there; repeating them here would make the rail a worse
 * copy of a screen that exists, and the one thing this panel can say that no
 * other screen does is the shape of the attendance — when it started, when it
 * last happened, how often, and how much time it adds up to.
 *
 * **One action, not the template's two.** Its second button is "Suspend"; the
 * equivalent here is archiving the client, which already lives in the record's
 * own overflow menu and in the register's row actions. A third way to archive
 * somebody, on the tab about their appointments, is a button invented to fill a
 * slot.
 */
function SummaryRail({
  client,
  stats,
  locale,
  labels,
  durationLabels,
}: {
  client: ClientDetail;
  stats: VisitStats;
  locale: Locale;
  labels: RailLabels;
  durationLabels: DurationLabels;
}) {
  const goal = isMember(CLIENT_GOALS, client.goal) ? client.goal : null;

  const rows = [
    { label: labels.firstVisit, value: stats.firstVisit && formatMediumDate(locale, stats.firstVisit) },
    { label: labels.lastVisit, value: stats.lastVisit && formatMediumDate(locale, stats.lastVisit) },
    {
      label: labels.nextVisit,
      value: stats.nextVisit && formatMediumDate(locale, stats.nextVisit),
      /* The one accented row: what is coming is the fact this tab is opened for. */
      accent: true,
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
    /*
      **The rail is the full height of the row, matching the views card beside
      it.** It stretches rather than sitting at its natural height, so the two
      panels are one pair of equal columns instead of a tall card next to a short
      one — which is what a summary *rail* should look like, and what the
      template this ports draws.

      It briefly did the opposite (`self-start`, sticky) so its one button would
      not be stranded in empty space. Filling is the better trade: the button
      sits at the foot of its own column, which is where a panel's action
      belongs, and the empty space between the details and it is the rail's
      breathing room rather than a gap.

      Sticky is gone with it — a box already as tall as its scrollport has
      nothing to stick to, so the property was doing nothing but promising it
      did. `min-h-0` plus the scrolling content below is what handles the other
      direction: a rail *taller* than the screen scrolls inside itself instead of
      pushing the card past the shell's floor.
    */
    <Card className="lg:flex lg:min-h-0 lg:flex-col">
      {/*
        **`justify-between`, so the leftover height is shared out instead of
        pooling at the foot.** Filling the row left this column's four blocks
        stacked at the top with a card's worth of empty white under the button —
        which reads as a panel that failed to load its last section rather than
        as a panel with room to breathe.

        It works *with* `gap-6` rather than instead of it: in a flex column the
        gap is the floor and `justify-between` distributes only what is left over
        on top of it, so a short viewport falls back to the tight 24px rhythm and
        a tall one opens up evenly. Nothing is centred and nothing is pinned —
        the avatar still starts at the top and the button still ends at the
        bottom, which is where a panel's subject and its action belong.

        `lg:overflow-y-auto` is the safety valve on the other side: a short
        viewport, or a client whose name runs to three lines, makes this column
        taller than the row it is in, and without it the card would grow past the
        shell's floor and take the page's own scrollbar with it.
        `overscroll-contain` keeps the wheel here rather than handing it to the
        record behind once this reaches its end.
      */}
      <CardContent className="flex flex-col gap-6 lg:min-h-0 lg:flex-1 lg:justify-between lg:overflow-y-auto lg:overscroll-contain">
        <div className="flex flex-col items-center text-center">
          {/* The patient's calendar colour — the disc heading this rail is the
              one their appointments are drawn in. See `../patient-color`. */}
          <span className="patient-tone contents" style={patientToneStyle(client.seq)}>
            <Avatar name={client.fullName} color="var(--tone-mark)" size="xl" />
          </span>

          <h2 className="mt-3 font-heading text-heading-sm font-semibold" dir="auto">
            {client.fullName}
          </h2>

          {/* Only when there is one. A chip reading "—" is a chip with nothing
              to say, and the template's role badge has no blank state here. */}
          {goal ? (
            <Badge variant="muted" className="mt-2">
              {labels.goal(goal)}
            </Badge>
          ) : null}
        </div>

        {/*
          Stacked, each on its own full-width line, rather than two halves of a
          row. Side by side they were a pair of 140px boxes with a centred
          numeral in each, which wasted the rail's width on padding and set two
          figures at the size of a tile that had no room to be one.

          **Visits so far leads.** It is the answer to "have I been seeing this
          person", which is the question the rail is read for; the total number
          of appointments is the context for it, so it follows.
        */}
        <div className="flex flex-col gap-3">
          <RailFigure icon="check" value={stats.completed} label={labels.completed} />
          <RailFigure icon="calendar" value={stats.total} label={labels.total} />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-body-sm font-semibold">{labels.details}</h3>
          <Separator />

          <dl className="flex flex-col gap-2.5">
            {rows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-body-sm text-muted-foreground">{row.label}</dt>
                {/*
                  `<bdi>` isolates the value's own direction. A formatted date
                  has no strong character to set a block's direction from, so
                  `dir="auto"` would resolve it LTR and drag its alignment with
                  it — the same trap the figure tiles below document.
                */}
                <dd
                  className={cn(
                    'min-w-0 truncate text-end text-body-sm font-medium tabular-nums',
                    row.value === null && 'font-normal text-muted-foreground',
                    row.value !== null && row.accent && 'text-secondary-foreground',
                  )}
                >
                  <bdi>{row.value ?? labels.none}</bdi>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <Link href="/app/calendar/day" className={buttonVariants({ className: 'w-full' })}>
          <Icon name="bookAppointment" />
          {labels.book}
        </Link>
      </CardContent>
    </Card>
  );
}

/**
 * One of the rail's two counts, as a full-width row.
 *
 * A muted tile rather than a bordered box: it sits inside a card, and the
 * nesting rule in docs/design-system.md gives an item inside a card a fill, not
 * a second ring and shadow. The glyph is bare on that fill for the same reason —
 * a chip under it would be a third surface stacked inside the second.
 *
 * **The figure is on the end edge, not centred.** Spanning the rail, a centred
 * numeral floats in the middle of its own row with the label stranded under it;
 * pushed to the far edge it lands in a column with the values in the details
 * list below, so the whole rail reads down one line of figures. That is also
 * what earns the extra width: the row is a label and a number at opposite ends,
 * which is a shape that *wants* to be wide.
 */
function RailFigure({ icon, value, label }: { icon: IconName; value: number; label: string }) {
  return (
    <div className="flex w-full items-center gap-3 rounded-lg bg-muted/60 px-3 py-2.5">
      <Icon name={icon} className="size-[1.125rem] shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-body-sm text-muted-foreground">{label}</span>
      <span className="shrink-0 font-heading text-heading-sm font-semibold tabular-nums">
        {value}
      </span>
    </div>
  );
}

/* ── The three views ─────────────────────────────────────────────────────── */

/**
 * The whole record as one run, newest first.
 *
 * The template's activity timeline, and the reason this port is worth making:
 * a visit history is a sequence where the spacing between entries is itself the
 * information, and a flat table states every row as though it were independent
 * of the ones around it. The rail says "roughly every 21 days"; this is where
 * that number is visible as a shape.
 *
 * Upcoming entries are on the same rail as past ones rather than in a section of
 * their own — the run does not stop at today, and the dot is what marks where
 * today falls in it.
 */
function VisitTimelineView({
  visits,
  locale,
  today,
  durationLabels,
  noReason,
}: {
  visits: ClientVisitEntry[];
  locale: Locale;
  today: string;
  durationLabels: DurationLabels;
  noReason: string;
}) {
  return (
    <Timeline>
      {visits.map((visit, index) => {
        const isUpcoming = visit.date >= today;

        return (
          <TimelineItem
            key={visit.id}
            connected={index < visits.length - 1}
            marker={<TimelineDot tone={isUpcoming ? 'current' : 'done'} />}
          >
            <Link
              href={`/app/calendar/day?date=${visit.date}`}
              className="group -mx-2 block rounded-lg px-2 py-1 transition-colors hover:bg-muted/70"
            >
              <TimelineHeading>
                <span className="min-w-0 truncate text-body-sm font-semibold">
                  {formatWeekday(locale, visit.date, 'long')}
                  <span className="ms-2 font-normal text-muted-foreground">
                    <bdi>{formatMediumDate(locale, visit.date)}</bdi>
                  </span>
                </span>

                <span className="shrink-0 text-caption whitespace-nowrap text-muted-foreground tabular-nums">
                  <bdi>
                    {formatMinuteRange(
                      locale,
                      visit.date,
                      visit.startMinute,
                      visit.startMinute + visit.durationMinutes,
                    )}
                  </bdi>
                </span>
              </TimelineHeading>

              <TimelineContent>
                <span className="flex flex-wrap items-baseline gap-x-2 text-caption text-muted-foreground">
                  <span>{formatDuration(visit.durationMinutes, durationLabels)}</span>
                  <DotSeparator />
                  <span className="min-w-0 truncate" dir="auto">
                    {visit.reason ?? noReason}
                  </span>
                </span>
              </TimelineContent>
            </Link>
          </TimelineItem>
        );
      })}
    </Timeline>
  );
}

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
