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
 * Three weights, one layout. `featured` is the next appointment and fills the
 * whole card with olive — the brand's ink, which §06 treats as a neutral, so this
 * is emphasis and not a second accent. §07's warning about a saturated card
 * pulling attention off its neighbours is the point rather than the cost: this
 * screen is a switch, one next appointment and a list, and the next appointment
 * is what it is opened for. `default` and `past` are ordinary cards, separated
 * from each other by the tone of the date tile and by `past` dimming.
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
 * The date tile's fill, per tone.
 *
 * On the olive card the tile is a translucent white rather than a token: it has
 * to sit on `primary` and stay a tile, and every fill in the ramp either
 * disappears into the olive or reads as a second card laid on top of it.
 */
const PANEL_TONES = {
  featured: 'bg-primary-foreground/15 text-primary-foreground',
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
        // The olive fill replaces the card's own surface, so its hairline goes
        // with it: a ring drawn in `foreground/10` over a saturated fill reads
        // as a seam rather than as an edge.
        featured && 'bg-primary text-primary-foreground ring-0',
      )}
    >
      <CardContent className="flex items-stretch gap-3 sm:gap-4">
        {/*
          A plain rounded panel — a tinted block inside the card, not a second
          card, so it takes no ring and no shadow of its own.
        */}
        <div
          className={cn(
            'flex w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 sm:w-18',
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
                  // On the olive card the default chip is olive-100 on olive-500
                  // and all but disappears; a plain card surface with
                  // full-strength text on it is the same swap the plan's kcal
                  // pill makes on its tinted shell.
                  <Badge className={cn(featured && 'bg-card text-foreground')}>
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

          <p
            className={cn(
              'flex flex-wrap items-center gap-x-1.5 text-sm',
              featured ? 'text-primary-foreground/90' : 'text-muted-foreground',
            )}
          >
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
