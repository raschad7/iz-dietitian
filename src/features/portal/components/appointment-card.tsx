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
 * **Two compositions, not one row at three sizes.** `featured` is the next
 * appointment and it is built differently: the marker chip opens the card, the
 * reason follows at `heading-sm`, and the time is a line you can read at a
 * glance instead of 14px of grey microcopy. `default` and `past` share a
 * compact row — tile, heading, one muted line — because a list is scanned
 * rather than read.
 *
 * That split *is* the emphasis. This was one layout parameterised by size, so
 * the card everyone opens the page for was the same object as the rows beneath
 * it, half a step larger — and half a step is invisible on a phone. Three plain
 * tiers inside the card (when · what · at what time) do what a size bump could
 * not, and they cost no colour.
 *
 * **The featured card still recedes rather than shouts.** It filled with olive
 * for a while, and a solid brand block at the top of a screen that is otherwise
 * a stack of quiet white cards turned the page into one loud thing and a list of
 * afterthoughts — including the request button above it, which is the only
 * control here. The distinction that matters is not "this one is loud" but "this
 * one is not in the list", and a different plane says that: the list is raised
 * and white, the next appointment sits in the page. Composition and type carry
 * it from there; nothing was filled in to buy the emphasis.
 *
 * **`past` is not dimmed with `opacity`.** It carried `opacity-75`, which pulls
 * every line on the card — the reason included — under the contrast floor for
 * the sake of a mood. The neutral date tile and a muted heading say "finished"
 * without taking legibility off whoever needed it, and the panel the card sits
 * in has already said which half of the page this is.
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
 * `featured` takes green-100 rather than the green-50 the other cards use, and
 * that is a legibility floor before it is emphasis: the featured card's own
 * surface is n-50 (#F7F5EF) and green-50 is #F5F8EF, so the two are the same
 * lightness in different hues and the tile all but vanished on it. green-50 is
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

  const title = appointment.reason ?? t('appointments.defaultTitle');
  /*
    No `dir="ltr"` on the range, deliberately.

    `formatMinuteRange` returns it in logical order — start, dash, end. Forcing
    the span to LTR pins the start time to the left, so an Arabic reader coming
    from the right meets the *end* time first and reads the appointment
    backwards. Left to inherit the page direction instead: each clock time is
    European digits and stays internally LTR on its own (8:15 never becomes
    15:8), while the two of them are ordered by the paragraph, which puts the
    start time first in both languages.
  */
  const range = formatMinuteRange(locale, date, startMinute, startMinute + durationMinutes);

  const dateTile = (
    /*
      A plain rounded panel — a tinted block inside the card, not a second card,
      so it takes no ring and no shadow of its own.

      The two word lines keep the leading `text-caption` gives them, which is
      looser under `:lang(ar)` than in Latin because Arabic descends below the
      baseline. `leading-none` cropped the tails of الأربعاء and أغسطس against
      the `truncate`. Only the numeral is pinned — digits have no descender, and
      it is the line the tile is measured by.

      The month is the quietest line and the one most likely to be long —
      أغسطس, سبتمبر, September. `truncate` rather than a smaller step:
      `text-caption` is the floor (§Typography), and a month clipped to its stem
      still reads as a month.
    */
    <div
      className={cn(
        'flex shrink-0 flex-col items-center justify-center gap-0.5 px-1',
        // The next appointment's tile is the one date on the screen someone is
        // trying to hold in their head, so it gets the room to be that.
        featured ? 'w-18 rounded-lg py-2.5 sm:w-20' : 'w-16 rounded-lg py-2 sm:w-18',
        PANEL_TONES[tone],
      )}
    >
      <span className="text-caption">{formatWeekday(locale, date)}</span>

      <span
        className={cn(
          'font-heading leading-none font-semibold tabular-nums',
          featured ? 'text-heading-lg' : 'text-heading-sm',
        )}
      >
        {formatDayNumber(locale, date)}
      </span>

      <span className="w-full truncate text-center text-caption">
        {formatMonthName(locale, date)}
      </span>
    </div>
  );

  /*
    No "scheduled" / "ended" badge. Every card already sits in a panel that says
    which it is — a badge repeating the tab is noise, not status. What earns one
    here is what the tab cannot say: how soon this is, and whether anything is
    still outstanding on it.
  */
  const markerBadge =
    marker === null ? null : (
      /*
        green-100, on every tone — not `Badge`'s default green-50.

        This is the one chip on the page that says *how soon*, and green-50
        (#F5F8EF) is a hair off white: against a white card the pill all but
        disappeared and "القادم" read as loose green text with no shape around
        it. green-100 (#E8F0DA) is the first step of the ramp that actually
        reads as green at chip size, and the label stays green-700 from the
        variant — 6.51:1, so the fill is bought without touching contrast.

        It was already doing this on the featured card, and for a neighbouring
        reason: that card's own surface is n-50, the same lightness as green-50
        in a different hue. One fill for both cases is one thing to keep true.
      */
      <Badge className="bg-primary-subtle">{t(`appointments.marker.${marker}`)}</Badge>
    );

  /*
    A request the client has filed about *this* appointment that the dietitian
    has not answered — the one status on the card about something outstanding
    rather than about the slot itself.
  */
  const pendingBadge = appointment.hasOpenRequest ? (
    <Badge variant="attention">{t('appointments.requestPending')}</Badge>
  ) : null;

  if (featured) {
    return (
      <Card
        /*
          Sunken and flat. The ring and the shadow are what make the cards below
          it read as raised, so the card that is deliberately *not* in that list
          gives up both — an edge and a lift on a tinted surface would put it
          back on the same plane it is trying to leave.
        */
        className="bg-muted shadow-none ring-0"
      >
        <CardContent className="flex items-stretch gap-3 sm:gap-4">
          {dateTile}

          {/*
            Three tiers, read in the order the questions arrive: how soon, what
            it is, at what time.

            Every step here sits exactly one rung above the list row beside it —
            24px numeral to its 20, a 20px reason to its 16, a 16px time to its
            14 — and no further. It was a rung higher again on each, which on a
            phone made one card most of the first screenful; the composition is
            what marks this card out, and the type only has to agree with it.
          */}
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
            {markerBadge !== null || pendingBadge !== null ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {markerBadge}
                {pendingBadge}
              </div>
            ) : null}

            {/*
              `reason` is free text the dietitian typed and is routinely left
              empty, so the fallback is what most cards actually show.

              There is no practitioner line under it. A client's appointments
              are with their own dietitian, whose name is on the profile screen
              and rarely changes.
            */}
            <p className="font-heading text-heading-sm leading-snug">{title}</p>

            {/*
              The time at `body-md` in the foreground colour, not 14px of grey.
              "What time?" is the second question anyone brings to this card and
              it was set in the same microcopy as the duration beside it — which
              is the one figure here nobody needs to read twice. The step
              between the two is what separates them now, so the clock glyph
              that used to label the line is gone with it.
            */}
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-body-md tabular-nums">{range}</span>
              <span className="text-sm text-muted-foreground">{duration}</span>
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex items-stretch gap-3 sm:gap-4">
        {dateTile}

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
          <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1.5">
            <p
              className={cn(
                'min-w-0 font-heading text-base leading-snug font-semibold',
                // A finished appointment goes quiet in the type rather than
                // behind an opacity that takes the whole card with it.
                past && 'text-muted-foreground',
              )}
            >
              {title}
            </p>

            {markerBadge !== null || pendingBadge !== null ? (
              <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                {markerBadge}
                {pendingBadge}
              </div>
            ) : null}
          </div>

          <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
            <Icon name="clock" className="size-3.5 shrink-0" />
            <span className="tabular-nums">{range}</span>
            <span aria-hidden>·</span>
            <span>{duration}</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
