import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { EmptyState } from '@/components/ui/empty-state';
import { appointmentMarker } from '@/features/portal/appointments';
import { AppointmentCard } from '@/features/portal/components/appointment-card';
import { AppointmentTabs } from '@/features/portal/components/appointment-tabs';
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
 * dietitian's, so there is nothing here to press but the switch at the top —
 * which is what lets the layout be as quiet as it is.
 *
 * **The two halves are a switch, not two stacked sections.** They used to be:
 * upcoming, then requests, then history, all on one scroll. That made the past
 * — the half nobody opens this page for — permanent furniture under the half
 * everybody does, and on a phone it pushed the request list to somewhere between
 * them. A client's two questions are "when am I next seen?" and, occasionally,
 * "when was that last one?"; the second is a different visit to this page, not a
 * scroll on the first.
 *
 * Within the upcoming half the soonest appointment is lifted out of the list
 * entirely. It is the one thing anyone opens this page for, and a list where
 * every row looks identical makes them find it by reading dates.
 *
 * Both halves are rendered here, on the server, and handed to `AppointmentTabs`
 * as slots — see that file for why the choice is local state rather than `?view=`.
 */
export default async function AppointmentsPage({ params }: AppointmentsPageProps) {
  const locale = await resolveLocale(params);

  const context = await requirePortalClient(locale);
  const { upcoming, past, requests } = await loadAppointments(context);

  const t = await getTranslations('portal');

  // Withdrawn requests are the client's own change of mind; keeping them on the
  // page would be a list of things they decided not to do.
  const visibleRequests = requests.filter((request) => request.status !== 'withdrawn');

  // `upcoming` is sorted soonest-first by `splitAppointments`, so the head is the
  // next appointment and the tail is everything after it.
  const [next, ...later] = upcoming;

  const upcomingPanel = (
    <div className="space-y-7">
      {next === undefined ? (
        <EmptyState
          icon="calendar"
          title={t('appointments.noneUpcomingTitle')}
          description={t('appointments.noneUpcoming')}
        />
      ) : (
        <>
          <PortalSection icon="calendar" title={t('appointments.next')}>
            <AppointmentCard
              appointment={next}
              tone="featured"
              marker={appointmentMarker(next, 0, context.now)}
            />
          </PortalSection>

          {later.length > 0 ? (
            <PortalSection
              icon="calendar"
              title={t('appointments.upcoming')}
              count={later.length}
            >
              <ul className="space-y-3">
                {later.map((appointment, index) => (
                  <li key={appointment.id}>
                    <AppointmentCard
                      appointment={appointment}
                      // `index + 1`: these start after the featured one, and
                      // `appointmentMarker` reads position 0 as "next".
                      marker={appointmentMarker(appointment, index + 1, context.now)}
                    />
                  </li>
                ))}
              </ul>
            </PortalSection>
          ) : null}
        </>
      )}

      {/*
        Filed requests live with the upcoming half rather than beside the switch:
        a request is about something that has not happened yet, and a pending row
        sitting above the past list would be the one thing on that panel that is
        not history.
      */}
      {visibleRequests.length > 0 ? (
        <PortalSection
          icon="chat"
          title={t('appointments.requests')}
          count={visibleRequests.length}
        >
          <RequestList requests={visibleRequests} />
        </PortalSection>
      ) : null}
    </div>
  );

  const pastPanel =
    past.length === 0 ? (
      <EmptyState icon="clock" title={t('appointments.nonePast')} />
    ) : (
      <ul className="space-y-3">
        {past.map((appointment) => (
          <li key={appointment.id}>
            <AppointmentCard appointment={appointment} tone="past" />
          </li>
        ))}
      </ul>
    );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">
          {t('appointments.title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('appointments.subtitle')}</p>
      </header>

      <AppointmentTabs
        label={t('appointments.title')}
        upcomingLabel={t('appointments.tabs.upcoming')}
        pastLabel={t('appointments.tabs.past')}
        upcoming={upcomingPanel}
        past={pastPanel}
      />
    </div>
  );
}
