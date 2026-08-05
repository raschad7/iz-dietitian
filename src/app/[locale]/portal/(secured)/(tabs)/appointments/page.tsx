import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { appointmentMarker } from '@/features/portal/appointments';
import { AppointmentCard } from '@/features/portal/components/appointment-card';
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
 * **There is exactly one control on the page, and it asks rather than books.**
 * Requesting an appointment files a row the dietitian answers; it does not hold
 * a slot, and the button's own screen says so. Rescheduling and cancelling stay
 * the dietitian's — a client who needs either says so in the note on a request,
 * or contacts the clinic. Keeping the page to a single action is what lets the
 * rest of the layout stay as quiet as it is.
 *
 * The client's questions are "when am I next seen?" and "has that one happened
 * yet?", and the page still answers them in that order — the ask sits at the
 * top, where it does not interrupt either.
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

  // One open request at a time for a brand-new appointment: the mutation refuses
  // a second for the same day anyway, and offering a button that leads to a
  // rejection is worse than saying plainly that one is already waiting.
  const hasOpenNewRequest = requests.some(
    (request) => request.status === 'pending' && request.kind === 'new',
  );

  return (
    <div className="space-y-7">
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
