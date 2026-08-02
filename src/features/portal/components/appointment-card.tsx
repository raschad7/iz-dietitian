import { useLocale, useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import {
  formatDayNumber,
  formatDuration,
  formatLongDate,
  formatMinuteRange,
  formatWeekday,
} from '@/features/booking/format';
import { type AppointmentMarker } from '@/features/portal/appointments';
import { type PortalAppointment } from '@/features/portal/types';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * One appointment, as the client reads it.
 *
 * **Read-only.** A client does not book, move or cancel their own appointments —
 * their dietitian does — so this card offers nothing to press. What it owes them
 * instead is a clear answer to "when, and is it still happening?", which is why
 * the date leads and the status is stated rather than implied.
 *
 * The date is a tile rather than a line of prose: on a page that is mostly a list
 * of dates, "which day?" is what every row is scanned for, and a weekday plus a
 * numeral answers it before the sentence beside it is read.
 *
 * Three weights, one layout. `featured` is the next appointment and fills its
 * date panel with olive — the brand's ink, which §06 treats as a neutral, so this
 * is emphasis and not a second accent. `default` carries the same panel in
 * brand-subtle, and `past` in a plain sunken fill. Nothing here is lime: an
 * appointment is not a completion action.
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

const PANEL_TONES = {
  featured: 'bg-primary text-primary-foreground',
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
    <Card className={cn(past && 'opacity-75')}>
      <CardContent className="flex items-stretch gap-3 sm:gap-4">
        {/*
          A plain rounded panel: the card around it already carries the one swept
          corner this surface is allowed.
        */}
        <div
          className={cn(
            'flex shrink-0 flex-col items-center justify-center gap-1 rounded-lg',
            featured ? 'w-16 py-1 sm:w-20' : 'size-14',
            PANEL_TONES[tone],
          )}
        >
          <span className={cn('leading-none', featured ? 'text-xs' : 'text-[0.7rem]')}>
            {formatWeekday(locale, date)}
          </span>
          <span
            className={cn(
              'font-heading leading-none font-semibold tabular-nums',
              featured ? 'text-2xl' : 'text-lg',
            )}
          >
            {formatDayNumber(locale, date)}
          </span>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1.5">
            <div className="min-w-0 space-y-1">
              <p
                className={cn(
                  'font-heading leading-snug font-medium',
                  featured && 'text-base sm:text-lg',
                )}
              >
                {formatLongDate(locale, date)}
              </p>

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

            {/*
              No "scheduled" / "ended" badge. Every card already sits under a
              heading that says which it is, and the past ones are dimmed on top
              of that — a badge repeating the section is noise, not status. What
              earns a badge here is what the heading cannot say: how soon this one
              is, and whether anything is still outstanding on it.
            */}
            {marker !== null || appointment.hasOpenRequest ? (
              <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                {marker !== null ? <Badge>{t(`appointments.marker.${marker}`)}</Badge> : null}

                {/*
                  Legacy only: nothing in the portal can open a request any more.
                  Kept so a client who filed one before is still told it is pending.
                */}
                {appointment.hasOpenRequest ? (
                  <Badge variant="attention">{t('appointments.requestPending')}</Badge>
                ) : null}
              </div>
            ) : null}
          </div>

          {appointment.reason ? (
            <p className="border-s-2 border-border ps-2.5 text-sm leading-relaxed text-muted-foreground">
              {appointment.reason}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
