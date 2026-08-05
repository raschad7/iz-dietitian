import { CalendarDays } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { formatLongDate, formatMinuteRange } from '@/features/booking/format';
import { PreviewCard } from '@/features/portal/components/preview-card';
import { type PortalAppointment } from '@/features/portal/types';
import { type Locale } from '@/i18n/routing';

/**
 * The next appointment, as one row on the home screen.
 *
 * Times go through `src/features/booking/format.ts`, not the general formatters
 * in `src/lib/format.ts`: an appointment stores a wall clock rather than an
 * instant, so 09:00 must render as 09:00 on any machine.
 *
 * The full card — with reschedule and cancel — stays on `/portal/appointments`.
 * Those are consequential actions, and putting them on the screen the client
 * opens by default invites a mis-tap; this row is a reminder, not a control.
 *
 * With nothing booked the row becomes the way to ask for one, which is the only
 * thing a client can usefully do about an empty calendar.
 */
export function NextAppointmentPreview({ appointment }: { appointment: PortalAppointment | null }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('portal');

  if (!appointment) {
    return (
      <PreviewCard
        href="/portal/appointments/request"
        icon={CalendarDays}
        title={t('dashboard.nextAppointment')}
        lines={[{ text: t('appointments.noneUpcoming') }]}
        action={t('dashboard.requestAppointment')}
      />
    );
  }

  const { date, startMinute, durationMinutes } = appointment;

  return (
    <PreviewCard
      href="/portal/appointments"
      icon={CalendarDays}
      title={t('dashboard.nextAppointment')}
      // Date and time on separate lines rather than joined by a middot. A long
      // Arabic weekday plus a full date plus a range overflows 190px of row and
      // was being truncated mid-time — "10:30 – 00…" is worse than no time.
      lines={[
        { text: formatLongDate(locale, date), emphasis: true },
        {
          text: formatMinuteRange(locale, date, startMinute, startMinute + durationMinutes),
          // Start–end, not end–start: the range's own order has to survive the
          // surrounding Arabic paragraph.
          ltr: true,
        },
      ]}
      action={t('dashboard.appointmentDetails')}
    />
  );
}
