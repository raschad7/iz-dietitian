import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { EmptyState } from '@/components/ui/empty-state';
import { appointmentMarker } from '@/features/portal/appointments';
import { AppointmentCard } from '@/features/portal/components/appointment-card';
import { PortalSection } from '@/features/portal/components/portal-section';
import { RequestList } from '@/features/portal/components/request-list';
import { loadAppointments } from '@/features/portal/page-data';
import { requirePortalClient } from '@/features/portal/session';
import { resolveLocale } from '@/i18n/params';

type AppointmentsPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: AppointmentsPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('myAppointments') };
}

/**
 * This client's appointments: what is coming, and what has been.
 *
 * **The page is read-only.** Booking, rescheduling and cancelling are all the
 * dietitian's, so there is nothing here to press — which is what lets the layout
 * be as quiet as it is. The client's questions are "when am I next seen?" and
 * "has that one happened yet?", and the page answers them in that order.
 *
 * The first upcoming appointment is rendered at a heavier weight than the rest.
 * It is the one thing on this page anyone opens it for, and a list where every
 * row looks identical makes them find it by reading dates.
 */
export default async function AppointmentsPage({ params }: AppointmentsPageProps) {
  const locale = await resolveLocale(params);

  const context = await requirePortalClient(locale);
  const { upcoming, past, requests } = await loadAppointments(context);

  const t = await getTranslations('portal');

  // Withdrawn requests are the client's own change of mind; keeping them on the
  // page would be a list of things they decided not to do.
  const visibleRequests = requests.filter((request) => request.status !== 'withdrawn');

  return (
    <div className="space-y-7">
      <header className="space-y-1">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">
          {t('appointments.title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('appointments.subtitle')}</p>
      </header>

      <PortalSection
        icon="calendar"
        title={t('appointments.upcoming')}
        count={upcoming.length}
      >
        {upcoming.length === 0 ? (
          <EmptyState
            icon="calendar"
            title={t('appointments.noneUpcomingTitle')}
            description={t('appointments.noneUpcoming')}
          />
        ) : (
          <ul className="space-y-3">
            {upcoming.map((appointment, index) => (
              <li key={appointment.id}>
                <AppointmentCard
                  appointment={appointment}
                  tone={index === 0 ? 'featured' : 'default'}
                  marker={appointmentMarker(appointment, index, context.now)}
                />
              </li>
            ))}
          </ul>
        )}
      </PortalSection>

      {visibleRequests.length > 0 ? (
        <PortalSection
          icon="chat"
          title={t('appointments.requests')}
          count={visibleRequests.length}
        >
          <RequestList requests={visibleRequests} />
        </PortalSection>
      ) : null}

      <PortalSection icon="clock" title={t('appointments.history')} count={past.length}>
        {past.length === 0 ? (
          <EmptyState icon="clock" title={t('appointments.nonePast')} />
        ) : (
          <ul className="space-y-3">
            {past.map((appointment) => (
              <li key={appointment.id}>
                <AppointmentCard appointment={appointment} tone="past" />
              </li>
            ))}
          </ul>
        )}
      </PortalSection>
    </div>
  );
}
