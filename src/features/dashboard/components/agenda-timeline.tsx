import { getTranslations } from 'next-intl/server';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { addDays, startOfWeek, weekdayOf } from '@/features/booking/date';
import { formatDayNumber, formatMinuteRangeLatin, formatWeekday } from '@/features/booking/format';
import { patientToneStyle } from '@/features/booking/patient-color';
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
  /**
   * Clinic-local weekdays the clinic opens on, `0` = Sunday. Only these appear
   * in the week strip.
   */
  workingDays: readonly number[];
};

/**
 * The hero of the dashboard: today, as a vertical timeline.
 *
 * A thin read-only slice of the schedule, not a second calendar — every row
 * links to the real day view. The column is portrait because a day is read
 * top to bottom, and because it lets a whole day sit in a narrow track at the
 * far edge of the page (see `src/app/[locale]/app/page.tsx`) — furthest from
 * the sidebar, since this is the one panel on the dashboard you look at rather
 * than act through.
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

export async function AgendaTimeline({
  appointments,
  locale,
  today,
  nowMinute,
  workingDays,
}: AgendaTimelineProps) {
  const t = await getTranslations('dashboard.agenda');

  const ordered = [...appointments].sort((a, b) => a.startMinute - b.startMinute);
  const focusIndex = findFocusIndex(ordered, nowMinute);
  const weekStart = startOfWeek(today);

  /*
    The strip is the clinic's week, not the calendar's. A day the clinic is
    closed cannot hold an appointment, so a chip for it is a link to an empty
    day view — and seven chips of which two are dead read as a date picker
    rather than as "these are your days".

    Filtered rather than dimmed: a disabled-looking chip still asks to be
    understood before it can be skipped, and the days a clinic works are stable
    enough that their absence never needs explaining.

    Today drops out with the rest when the clinic is closed today. The strip
    then has no current-day marker, which is the honest reading — the card
    above it is still today's agenda, and it is empty.
  */
  const week = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)).filter((date) => {
    const weekday = weekdayOf(date);
    return weekday !== null && workingDays.includes(weekday);
  });

  const dayHref = (date: string) => ({ pathname: '/app/calendar/day' as const, query: { date } });

  return (
    /*
      The card is a fixed-height column from `xl` up: heading, then a timeline
      that scrolls inside it, then the footer link. A clinic with fourteen
      appointments must not be able to push the rest of the dashboard off the
      screen — the day scrolls, the page does not.

      `flex-1`, not `h-full`. `h-full` asked for the whole column while the
      requests card below still wanted its own height, so the two together
      overflowed their track and the browser settled it by squeezing the
      shorter one — which is why the empty requests panel used to hang out
      past its own card. `flex-1` claims what is *left* after that card, which
      is what the note on this column in `page.tsx` has always described.
    */
    <Card className="xl:min-h-0 xl:flex-1">
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

          {/* The week strip: the agenda doubles as a jump to any other working day. */}
          <ul className="flex items-stretch justify-between gap-1">
            {week.map((date) => {
              const isToday = date === today;

              return (
                <li key={date} className="flex-1">
                  <Link
                    href={dayHref(date)}
                    aria-current={isToday ? 'date' : undefined}
                    className={cn(
                      'flex flex-col items-center gap-0.5 rounded-md py-1.5 transition-colors',
                      isToday
                        ? 'bg-secondary font-semibold text-primary'
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
          /*
            Centred, not start-aligned. Three items hung off the inline-start
            edge of a dashed box — a glyph, a sentence and a button, each a
            different width — read as a list that had lost its rows; there is
            nothing beside them for the edge to line up with. Centred, the three
            share one axis and the box reads as one statement. The same shape
            `EmptyState` gives a screen, at panel scale.
          */
          <div className="flex shrink-0 flex-col items-center gap-3 rounded-lg border border-dashed border-border p-6 text-center">
            <Icon name="calendar" className="size-6 text-muted-foreground" />
            <p className="text-body-md text-muted-foreground">{t('empty')}</p>
            <Link href={dayHref(today)} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <Icon name="bookAppointment" />
              {t('emptyCta')}
            </Link>
          </div>
        ) : (
          /*
            `no-scrollbar`: the bar competed with the rail beside it for the
            one thing on this card that is allowed to be a line down the
            edge. The list still scrolls by wheel, trackpad, touch and
            keyboard — only the bar itself is gone. `overscroll-contain`
            stops a flick at the end of the day from scrolling the shell
            behind it.
          */
          <ol className="flex flex-col overflow-y-auto overscroll-contain no-scrollbar xl:min-h-0 xl:flex-1">
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
                        **Every row wears the client's tone; the emphasis is
                        carried by everything except hue.**

                        The next session used to rest in olive-100 and fill to
                        solid primary under the pointer. That put two different
                        questions on one property: olive said "this is the one
                        happening next", and there was nothing left to say who
                        it was with. Now the fill answers *who* — the same four
                        tones the calendar draws, so a client looks the same on
                        the dashboard as they do on the grid — and "next" is
                        said by the things that were already saying it: 16px of
                        padding against 12, a heading-sized name, the card
                        shadow, the olive node on the rail beside it, and the
                        chip.

                        Past rows keep the tone and lose their strength, which
                        is the honest reading — the appointment still belongs to
                        that client, it has simply been and gone. `saturate` and
                        not a grey wash, so the row dims towards its own colour
                        rather than out of the system.

                        n-900 on every tone measures 13.3–15.0:1 at rest and no
                        lower under the pointer, where the fill deepens by one
                        step rather than inverting.
                      */
                      'patient-tone border border-(--tone-edge) bg-(--tone-fill) hover:bg-(--tone-fill-hover)',
                      isFocused ? 'p-4 text-foreground shadow-card' : 'p-3',
                      phase === 'past' && 'text-foreground/60',
                    )}
                    style={{
                      ...patientToneStyle(appointment.clientSeq),
                      filter: phase === 'past' ? 'saturate(0.3)' : undefined,
                      opacity: phase === 'past' ? 0.7 : 1,
                    }}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={cn('font-sans font-semibold', isFocused ? 'text-body-md' : 'text-caption')}
                        dir="ltr"
                      >
                        {formatMinuteRangeLatin(
                          appointment.date,
                          appointment.startMinute,
                          appointment.startMinute + appointment.durationMinutes,
                        )}
                      </span>

                      {/*
                        The chip is a wash of the card's own foreground, not a
                        colour of its own.

                        It used to rest in olive-200 and turn lime on hover —
                        the page's one accent, and correct while the card
                        underneath was always olive-100. It cannot survive the
                        card becoming one of four hues: an olive chip on the
                        rose tone is two unrelated colours arguing inside 80px,
                        and lime on any of them is the one pairing this palette
                        already documents as invisible. A translucent
                        foreground takes the tone of whatever it sits on, so
                        one rule reads on all four.

                        Square corners are dropped for `rounded-lg` — the
                        same 16px radius the card it sits on carries — rather
                        than the badge's usual pill, so the chip reads as
                        belonging to this card and not as a generic label.

                        Nothing sits here on the other rows: the length of a
                        session is already in the time range beside it, and
                        "45 min" on every row was a column of noise that made
                        the one row carrying the chip harder to find.
                      */}
                      {isFocused ? (
                        <Badge variant="accent" className="rounded-lg bg-foreground/10 text-foreground">
                          {isLive ? t('live') : t('next')}
                        </Badge>
                      ) : null}
                    </div>

                    {/*
                      The avatar sits with the *name*, not at the head of the
                      row, and that placement is the whole reason it can be here
                      at all. This card used to carry none, because a coloured
                      initial an inch from the rail's own node made two marks
                      per row competing to be the thing the eye lands on. The
                      two are not competing now because they answer different
                      questions and sit in different places: the node on the
                      rail is *when* — past, live, next — and the disc against
                      the name is *who*.
                    */}
                    <div className="mt-2 flex items-center gap-2">
                      <Avatar
                        name={appointment.clientName}
                        color="var(--tone-mark)"
                        size={isFocused ? 'sm' : 'xs'}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn('block truncate font-medium', isFocused ? 'text-heading-sm' : 'text-body-md')}
                          dir="auto"
                        >
                          {appointment.clientName}
                        </span>
                        {appointment.reason ? (
                          <span
                            // `text-foreground/70`, not `text-muted-foreground`.
                            // The row is a tinted surface now, and warm grey on
                            // a cool tint is the low-contrast pair the block on
                            // the calendar already avoids for the same reason: a
                            // translucent foreground stays legible on all four
                            // tones instead of being tuned for one.
                            className="block truncate text-caption text-foreground/70"
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
