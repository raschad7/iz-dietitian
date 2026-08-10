import { useLocale, useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import {
  formatDayNumber,
  formatDuration,
  formatMinuteRange,
  formatMonthName,
  formatWeekday,
} from '@/features/booking/format';
import { type AppointmentMarker } from '@/features/portal/appointments';
import { type PortalAppointment } from '@/features/portal/types';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * One appointment, as the client reads it.
 *
 * **Read-only.** Asking for a new appointment is done from the page's own
 * button, and moving or cancelling an existing one stays the dietitian's — so
 * this card offers nothing to press. What it owes the client instead is a clear
 * answer to "what is this, and when?", and it answers them in that order.
 *
 * The date is a tile rather than a line of prose: on a page that is mostly a list
 * of dates, "which day?" is what every row is scanned for, and a weekday, a
 * numeral and a month answer it before the sentence beside it is read. The month
 * matters here in a way it does not on a calendar screen — a client's next three
 * appointments routinely straddle two of them, and "14" and "11" sitting in one
 * list say nothing on their own.
 *
 * **What the appointment is leads, not when it is.** The tile has already
 * answered "when", so repeating the full date as the heading spent the card's
 * loudest line on a fact stated 40px to its side. The heading is the reason the
 * dietitian recorded — the follow-up, the consultation — which is the one thing
 * about a booking the tile cannot show. It is the card's only text line: the
 * practitioner's name was under it for a while and came out again, being the
 * same name on every row of a list of one dietitian's appointments.
 *
 * Three weights, one layout, and the emphasis is carried by tone and size
 * rather than by a fill. `featured` is the next appointment: a sunken card,
 * flat, with a larger date tile and a larger heading. `default` is an ordinary
 * raised white card, and `past` is one of those dimmed.
 *
 * **Why the featured card recedes instead of shouting.** It filled with olive
 * for a while, and a solid brand block at the top of a screen that is otherwise
 * a stack of quiet white cards turned the page into one loud thing and a list of
 * afterthoughts — including the request button above it, which is the only
 * control here. The distinction that matters is not "this one is loud" but "this
 * one is not in the list", and a different plane says that: the list is raised
 * and white, the next appointment sits in the page. Its own heading, its size
 * and its `marker` chip carry the rest, and the reader's eye still lands on it
 * first because it is first.
 *
 * Times go through `src/features/booking/format.ts`, not the general formatters
 * in `src/lib/format.ts`: an appointment stores a wall clock rather than an
 * instant, so 09:00 must render as 09:00 on any machine. See the note at the top
 * of that module.
 */

type AppointmentTone = 'featured' | 'default' | 'past';

type AppointmentCardProps = {
  appointment: PortalAppointment;
  /** Defaults to `default`. `past` also dims the whole card. */
  tone?: AppointmentTone;
  /**
   * `today` / `tomorrow` / `next`, from `appointmentMarker`. Computed by the page,
   * which holds the clinic's clock — a component has no business reading one.
   */
  marker?: AppointmentMarker | null;
};

/**
 * The date tile's fill, per tone — one step of olive per step of emphasis.
 *
 * `featured` takes olive-100 rather than the olive-50 the other cards use, and
 * that is a legibility floor before it is emphasis: the featured card's own
 * surface is n-50 (#F7F5EF) and olive-50 is #F5F8EF, so the two are the same
 * lightness in different hues and the tile all but vanished on it. olive-50 is
 * fine where it has always been, on the white card below.
 *
 * `past` drops out of the ramp entirely to the neutral pair. That is the tone
 * doing real work: a finished appointment carries no brand colour anywhere.
 */
const PANEL_TONES = {
  featured: 'bg-primary-subtle text-secondary-foreground',
  default: 'bg-secondary text-secondary-foreground',
  past: 'bg-muted text-muted-foreground',
} as const satisfies Record<AppointmentTone, string>;

export function AppointmentCard({
  appointment,
  tone = 'default',
  marker = null,
}: AppointmentCardProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations('portal');
  const tBooking = useTranslations('booking');

  const { date, startMinute, durationMinutes } = appointment;
  const featured = tone === 'featured';
  const past = tone === 'past';

  const duration = formatDuration(durationMinutes, {
    hour: (count) => tBooking('duration.hours', { count }),
    minute: (count) => tBooking('duration.minutes', { count }),
  });

  return (
    <Card
      className={cn(
        past && 'opacity-75',
        // Sunken and flat. The ring and the shadow are what make the cards
        // below it read as raised, so the card that is deliberately *not* in
        // that list gives up both — an edge and a lift on a tinted surface
        // would put it back on the same plane it is trying to leave.
        featured && 'bg-muted shadow-none ring-0',
      )}
    >
      <CardContent className="flex items-stretch gap-3 sm:gap-4">
        {/*
          A plain rounded panel — a tinted block inside the card, not a second
          card, so it takes no ring and no shadow of its own.
        */}
        <div
          className={cn(
            'flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2',
            // The next appointment's tile is wider as well as deeper. It is the
            // one date on the screen someone is trying to hold in their head.
            featured ? 'w-18 sm:w-20' : 'w-16 sm:w-18',
            PANEL_TONES[tone],
          )}
        >
          {/*
            The two word lines keep the leading `text-caption` gives them, which
            is looser under `:lang(ar)` than in Latin because Arabic descends
            below the baseline. `leading-none` here cropped the tails of
            الأربعاء and أغسطس against the `truncate` below. Only the numeral is
            pinned — digits have no descender, and it is the line the tile is
            measured by.
          */}
          <span className="text-caption">{formatWeekday(locale, date)}</span>

          <span
            className={cn(
              'font-heading leading-none font-semibold tabular-nums',
              featured ? 'text-2xl' : 'text-xl',
            )}
          >
            {formatDayNumber(locale, date)}
          </span>

          {/*
            The month is the tile's quietest line and the one most likely to be
            a long word — أغسطس, سبتمبر, September. `truncate` rather than a
            smaller step: `text-caption` is the floor (§Typography), and a month
            clipped to its stem still reads as a month.
          */}
          <span className="w-full truncate text-center text-caption">
            {formatMonthName(locale, date)}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
          <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1.5">
            <div className="min-w-0">
              {/*
                `reason` is free text the dietitian typed and is routinely left
                empty, so the fallback is what most cards actually show — see
                `appointments.defaultTitle`.

                There is no practitioner line under it. A client's appointments
                are with their own dietitian, whose name is on the profile screen
                and rarely changes, so repeating it on every card in the list
                spent a line on the one fact that never varies.
              */}
              <p
                className={cn(
                  'font-heading leading-snug font-semibold',
                  featured ? 'text-base sm:text-lg' : 'text-base',
                )}
              >
                {appointment.reason ?? t('appointments.defaultTitle')}
              </p>
            </div>

            {/*
              No "scheduled" / "ended" badge. Every card already sits in a panel
              that says which it is, and the past ones are dimmed on top of that
              — a badge repeating the tab is noise, not status. What earns a badge
              here is what the tab cannot say: how soon this one is, and whether
              anything is still outstanding on it.
            */}
            {marker !== null || appointment.hasOpenRequest ? (
              <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                {marker !== null ? (
                  // The chip steps up with the tile on the featured card, and
                  // for the same reason: its default olive-50 fill and that
                  // card's n-50 surface are the same lightness, so the chip
                  // read as floating text with no pill around it.
                  <Badge className={cn(featured && 'bg-primary-subtle')}>
                    {t(`appointments.marker.${marker}`)}
                  </Badge>
                ) : null}

                {/*
                  A request the client has filed about *this* appointment and
                  the dietitian has not answered. It is the one status on the
                  card that is about something outstanding rather than about the
                  slot itself, which is why it earns a badge here.
                */}
                {appointment.hasOpenRequest ? (
                  <Badge variant="attention">{t('appointments.requestPending')}</Badge>
                ) : null}
              </div>
            ) : null}
          </div>

          {/*
            One muted grey for every tone now that no card is saturated. The
            featured card used to need `primary-foreground/90` to sit on olive.
          */}
          <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
            <Icon name="clock" className="size-3.5 shrink-0" />
            {/*
              No `dir="ltr"` here, deliberately.

              `formatMinuteRange` returns the range in logical order — start,
              dash, end. Forcing the span to LTR pins the start time to the
              left, so an Arabic reader coming from the right meets the *end*
              time first and reads the appointment backwards.

              Left to inherit the page direction instead: each clock time is
              European digits and stays internally LTR on its own (8:15 never
              becomes 15:8), while the two of them are ordered by the
              paragraph, which puts the start time first in both languages.
            */}
            <span className="tabular-nums">
              {formatMinuteRange(locale, date, startMinute, startMinute + durationMinutes)}
            </span>
            <span aria-hidden>·</span>
            <span>{duration}</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
