import { getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDuration, formatMinute } from '@/features/booking/format';
import { type CalendarAppointment } from '@/features/booking/types';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';

type AgendaCardProps = {
  appointments: CalendarAppointment[];
  locale: Locale;
  today: string;
};

/**
 * The hero of the dashboard: a thin, read-only slice of today's schedule —
 * not a second calendar. Every row links to the real calendar's day view.
 */
export async function AgendaCard({ appointments, locale, today }: AgendaCardProps) {
  const t = await getTranslations('dashboard.agenda');
  const td = await getTranslations('booking.duration');

  const dayHref = { pathname: '/app/calendar/day' as const, query: { date: today } };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {appointments.length === 0 ? (
          <div className="flex flex-col items-start gap-3 py-6 text-start">
            <p className="text-sm text-muted-foreground">{t('empty')}</p>
            <Link href={dayHref} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              {t('emptyCta')}
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {appointments.map((appointment) => (
              <li key={appointment.id}>
                <Link
                  href={dayHref}
                  className="flex items-center gap-3 py-3 text-start transition-colors first:pt-0 last:pb-0 hover:bg-muted/50"
                >
                  <span className="w-16 shrink-0 font-mono text-sm text-muted-foreground">
                    {formatMinute(locale, appointment.date, appointment.startMinute)}
                  </span>
                  {/* The client's own colour — row data, not a design token; see design-system.md. */}
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: appointment.clientColor }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{appointment.clientName}</span>
                    {appointment.reason ? (
                      <span className="block truncate text-xs text-muted-foreground">{appointment.reason}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDuration(appointment.durationMinutes, {
                      hour: (count) => td('hours', { count }),
                      minute: (count) => td('minutes', { count }),
                    })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
