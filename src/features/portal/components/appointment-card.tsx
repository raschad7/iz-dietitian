import { useLocale, useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatDuration, formatLongDate, formatMinuteRange } from '@/features/booking/format';
import { type PortalAppointment } from '@/features/portal/types';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * One appointment, as the client reads it.
 *
 * Times go through `src/features/booking/format.ts`, not the general formatters
 * in `src/lib/format.ts`: an appointment stores a wall clock rather than an
 * instant, so 09:00 must render as 09:00 on any machine. See the note at the top
 * of that module.
 */

type AppointmentCardProps = {
  appointment: PortalAppointment;
  /** Past appointments are dimmed and offer nothing to act on. */
  past?: boolean;
};

export function AppointmentCard({ appointment, past = false }: AppointmentCardProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations('portal');
  const tBooking = useTranslations('booking');

  const { date, startMinute, durationMinutes } = appointment;

  const duration = formatDuration(durationMinutes, {
    hour: (count) => tBooking('duration.hours', { count }),
    minute: (count) => tBooking('duration.minutes', { count }),
  });

  return (
    <Card className={cn(past && 'opacity-70')}>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <p className="font-medium">{formatLongDate(locale, date)}</p>
          <p className="text-sm text-muted-foreground">
            {/* `dir="ltr"`: a time range reads the same way in both languages. */}
            <span dir="ltr">{formatMinuteRange(locale, date, startMinute, startMinute + durationMinutes)}</span>
            {' · '}
            {duration}
          </p>
        </div>

        {appointment.reason ? <p className="text-sm">{appointment.reason}</p> : null}

        {appointment.hasOpenRequest ? (
          <Badge variant="muted">{t('appointments.requestPending')}</Badge>
        ) : null}

        {!past && !appointment.hasOpenRequest ? (
          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              href={`/portal/appointments/request?kind=reschedule&appointmentId=${appointment.id}`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {t('appointments.reschedule')}
            </Link>
            <Link
              href={`/portal/appointments/request?kind=cancel&appointmentId=${appointment.id}`}
              className="font-medium text-destructive underline-offset-4 hover:underline"
            >
              {t('appointments.cancel')}
            </Link>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
