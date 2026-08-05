import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { appointmentMarker } from '@/features/portal/appointments';
import { AppointmentCard } from '@/features/portal/components/appointment-card';
import { AppointmentTabs } from '@/features/portal/components/appointment-tabs';
import { PortalSection } from '@/features/portal/components/portal-section';
import { RequestList } from '@/features/portal/components/request-list';
import { loadAppointments } from '@/features/portal/page-data';
import { requirePortalClient } from '@/features/portal/session';
import { Link } from '@/i18n/navigation';
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
 * This client's appointments: what is coming, what has been, and the one thing
 * they can start from here.
 *
 * **One action, and it asks rather than books.** Requesting an appointment files
 * a row the dietitian answers; it does not hold a slot, and the button's own
 * screen says so. Rescheduling and cancelling stay the dietitian's — a client
 * who needs either says so in the note on a request, or contacts the clinic.
 * Keeping the page to a single action is what lets the rest of the layout stay
 * as quiet as it is.
 *
 * **The two halves are a switch, not two stacked sections.** They used to be:
 * upcoming, then requests, then history, all on one scroll. That made the past
 * — the half nobody opens this page for — permanent furniture under the half
 * everybody does, and on a phone it pushed the request list to somewhere between
 * them. A client's two questions are "when am I next seen?" and, occasionally,
 * "when was that last one?"; the second is a different visit to this page, not a
 * scroll on the first.
 *
 * The ask sits above that switch rather than inside either half. It is about the
 * page, not about the half being read — offering it under "past" would be
 * offering it against a list of things that already happened.
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

  // One open request at a time for a brand-new appointment: the mutation refuses
  // a second for the same day anyway, and offering a button that leads to a
  // rejection is worse than saying plainly that one is already waiting.
  const hasOpenNewRequest = requests.some(
    (request) => request.status === 'pending' && request.kind === 'new',
  );

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
      <header className="space-y-3">
        <div className="space-y-1">
          <h2 className="font-heading text-2xl font-semibold tracking-tight">
            {t('appointments.title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('appointments.subtitle')}</p>
        </div>

        {hasOpenNewRequest ? (
          <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            <Icon name="clock" className="size-4 shrink-0" />
            {t('appointments.requestPending')}
          </p>
        ) : (
          <Link
            href="/portal/appointments/request"
            className={buttonVariants({ variant: 'default', className: 'w-full sm:w-auto' })}
          >
            <Icon name="bookAppointment" />
            {t('appointments.book')}
          </Link>
        )}
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
