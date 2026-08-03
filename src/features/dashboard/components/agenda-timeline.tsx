import { getTranslations } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { addDays, startOfWeek } from '@/features/booking/date';
import { formatDayNumber, formatMinuteRange, formatWeekday } from '@/features/booking/format';
import { type CalendarAppointment } from '@/features/booking/types';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

type AgendaTimelineProps = {
  appointments: CalendarAppointment[];
  locale: Locale;
  today: string;
  /** Minutes from midnight at render time — what splits the day into done / live / still to come. */
  nowMinute: number;
};

/**
 * The hero of the dashboard: today, as a vertical timeline.
 *
 * A thin read-only slice of the schedule, not a second calendar — every row
 * links to the real day view. The column is portrait because a day is read
 * top to bottom, and because it lets a whole day sit beside the rail without
 * the eye leaving the shell's inline-start edge.
 *
 * Exactly one appointment is emphasised: the one happening now, or the next one
 * if nothing is live. Everything before it drops back, so "where am I in the
 * day" is answered by contrast rather than by reading times.
 *
 * The rows are plain surfaces rather than nested `Card`s on purpose: this panel
 * is already the card, and a stack of cards inside it would double every ring
 * and shadow down the list.
 */

type Phase = 'past' | 'current' | 'upcoming';

/**
 * Which row carries the emphasis.
 *
 * The live appointment wins; failing that, the first one that has not started.
 * Returns null once the day is over — then nothing is emphasised, rather than
 * the last row pretending to still be ahead.
 */
function findFocusIndex(appointments: CalendarAppointment[], nowMinute: number): number | null {
  const live = appointments.findIndex(
    (appointment) =>
      appointment.startMinute <= nowMinute && nowMinute < appointment.startMinute + appointment.durationMinutes,
  );
  if (live !== -1) return live;

  const next = appointments.findIndex((appointment) => appointment.startMinute > nowMinute);
  return next === -1 ? null : next;
}

export async function AgendaTimeline({ appointments, locale, today, nowMinute }: AgendaTimelineProps) {
  const t = await getTranslations('dashboard.agenda');

  const ordered = [...appointments].sort((a, b) => a.startMinute - b.startMinute);
  const focusIndex = findFocusIndex(ordered, nowMinute);
  const weekStart = startOfWeek(today);

  const dayHref = (date: string) => ({ pathname: '/app/calendar/day' as const, query: { date } });

  return (
    /*
      The card is a fixed-height column from `xl` up: heading, then a timeline
      that scrolls inside it, then the footer link. A clinic with fourteen
      appointments must not be able to push the rest of the dashboard off the
      screen — the day scrolls, the page does not.
    */
    <Card className="xl:h-full xl:min-h-0">
      <CardContent className="flex flex-col gap-4 xl:min-h-0 xl:flex-1">
        <header className="flex shrink-0 flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-heading text-heading-lg font-semibold">{t('title')}</h3>
            {/*
              Plain muted text, not a chip. A day with appointments in it is not
              a status — it is a fact, and a filled badge gave that fact more
              weight than the one row on this card that is meant to carry any.
            */}
            <span className="text-caption text-muted-foreground">{t('count', { count: ordered.length })}</span>
          </div>

          {/* The week strip: the agenda doubles as a jump to any other day of the week. */}
          <ul className="flex items-stretch justify-between gap-1">
            {Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)).map((date) => {
              const isToday = date === today;

              return (
                <li key={date} className="flex-1">
                  <Link
                    href={dayHref(date)}
                    aria-current={isToday ? 'date' : undefined}
                    className={cn(
                      'flex flex-col items-center gap-0.5 rounded-md py-1.5 transition-colors',
                      isToday
                        ? 'bg-secondary font-semibold text-secondary-foreground'
                        : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    <span className="text-label">{formatWeekday(locale, date)}</span>
                    <span className="font-mono text-body-md">{formatDayNumber(locale, date)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </header>

        {ordered.length === 0 ? (
          <div className="flex shrink-0 flex-col items-start gap-3 rounded-lg border border-dashed border-border p-4">
            <Icon name="calendar" className="size-6 text-muted-foreground" />
            <p className="text-body-md text-muted-foreground">{t('empty')}</p>
            <Link href={dayHref(today)} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <Icon name="bookAppointment" />
              {t('emptyCta')}
            </Link>
          </div>
        ) : (
          /*
            `pe-1` leaves the scrollbar somewhere to sit that isn't on top of
            the card's edge; `overscroll-contain` stops a flick at the end of
            the day from scrolling the shell behind it.
          */
          <ol className="flex flex-col overflow-y-auto overscroll-contain pe-1 xl:min-h-0 xl:flex-1">
            {ordered.map((appointment, index) => {
              const isFirst = index === 0;
              const isLast = index === ordered.length - 1;

              const phase: Phase =
                focusIndex === index ? 'current' : focusIndex === null || index < focusIndex ? 'past' : 'upcoming';
              const isFocused = phase === 'current';
              const isLive =
                appointment.startMinute <= nowMinute &&
                nowMinute < appointment.startMinute + appointment.durationMinutes;

              return (
                <li key={appointment.id} className="flex gap-3">
                  {/*
                    The rail: one absolutely-positioned hairline per row rather
                    than a border on the list, so the first and last segments can
                    stop at their own node instead of running off into the header
                    and the footer.
                  */}
                  <div className="relative flex w-3 shrink-0 justify-center" aria-hidden>
                    <span
                      className={cn(
                        'absolute w-px bg-border',
                        isFirst ? 'top-3' : 'top-0',
                        isLast ? 'h-3' : 'bottom-0',
                      )}
                    />
                    <span
                      className={cn(
                        'relative mt-2 size-2.5 rounded-full border-2',
                        isFocused && 'border-primary bg-primary ring-3 ring-secondary',
                        phase === 'past' && 'border-border bg-muted',
                        phase === 'upcoming' && 'border-border bg-card',
                      )}
                    />
                  </div>

                  <Link
                    href={dayHref(today)}
                    className={cn(
                      'group/session mb-3 block min-w-0 flex-1 rounded-lg transition-all duration-200 ease-[cubic-bezier(.2,.6,.2,1)]',
                      isLast && 'mb-0',
                      /*
                        The next session rests in the brand's quiet fill and
                        fills in to solid primary under the pointer — the same
                        move the quick actions make. It was solid primary at
                        rest, which made the one card you are meant to *read*
                        the loudest thing on the page and left its hover with
                        nowhere to go but a slightly darker olive.

                        n-900 on olive-100 is 14.7:1; white on olive-600 is
                        5.46:1. Both states carry the text.
                      */
                      isFocused
                        ? 'bg-primary-subtle p-4 text-foreground shadow-card hover:bg-primary hover:text-primary-foreground'
                        : 'p-3 hover:bg-muted',
                      phase === 'past' && 'bg-muted/60 text-muted-foreground',
                      phase === 'upcoming' && 'bg-muted/60',
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={cn('font-mono', isFocused ? 'text-body-md' : 'text-caption')}>
                        {formatMinuteRange(
                          locale,
                          appointment.date,
                          appointment.startMinute,
                          appointment.startMinute + appointment.durationMinutes,
                        )}
                      </span>

                      {/*
                        The chip inverts with the card it sits on. Lime is
                        1.17:1 against the resting olive-100 fill — it would
                        be invisible at exactly the moment it has a job to
                        do — so it rests as a solid primary chip (4.66:1 on
                        the fill) and becomes the lime one on hover, where
                        the card has gone dark and lime is 3.99:1.

                        Still the page's one lime element. Do not add a
                        second accent anywhere else on it.

                        Nothing sits here on the other rows: the length of a
                        session is already in the time range beside it, and
                        "45 min" on every row was a column of noise that made
                        the one row carrying the chip harder to find.
                      */}
                      {isFocused ? (
                        <Badge
                          variant="accent"
                          className={cn(
                            'bg-primary text-primary-foreground transition-colors',
                            'group-hover/session:bg-accent-lime group-hover/session:text-on-accent',
                          )}
                        >
                          {isLive ? t('live') : t('next')}
                        </Badge>
                      ) : null}
                    </div>

                    {/*
                      No avatar. The rail to the inline-start already gives
                      every row a mark at its start, and a coloured initial an
                      inch away from it made two badges per row competing to be
                      the thing the eye lands on.
                    */}
                    <div className="mt-2 flex items-center gap-2">
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn('block truncate font-medium', isFocused ? 'text-heading-sm' : 'text-body-md')}
                          dir="auto"
                        >
                          {appointment.clientName}
                        </span>
                        {appointment.reason ? (
                          <span
                            className={cn(
                              'block truncate text-caption text-muted-foreground',
                              // n-600 reads on the resting olive-100 fill
                              // (5.63:1); once the card goes solid it has to
                              // become the light half of the pair.
                              isFocused && 'group-hover/session:text-primary-foreground/85',
                            )}
                            dir="auto"
                          >
                            {appointment.reason}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}

        {ordered.length > 0 ? (
          <Link
            href={dayHref(today)}
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'shrink-0 self-start')}
          >
            {t('viewDay')}
            <Icon name="chevronEnd" />
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
