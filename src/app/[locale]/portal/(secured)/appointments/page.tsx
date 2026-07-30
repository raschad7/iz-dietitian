import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { buttonVariants } from '@/components/ui/button';
import { AppointmentCard } from '@/features/portal/components/appointment-card';
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
 * Everything about this client's appointments on one page: what is coming, what
 * they have asked for, and what has been.
 *
 * Three sections rather than three routes. They are read in that order and they
 * answer one question between them; splitting history onto its own page would
 * mean navigating to find out whether a request was ever answered.
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
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">{t('appointments.title')}</h2>
        <Link href="/portal/appointments/request" className={buttonVariants()}>
          {t('dashboard.requestAppointment')}
        </Link>
      </header>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">{t('appointments.upcoming')}</h3>

        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('appointments.noneUpcoming')}</p>
        ) : (
          <ul className="space-y-3">
            {upcoming.map((appointment) => (
              <li key={appointment.id}>
                <AppointmentCard appointment={appointment} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {visibleRequests.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">{t('appointments.requests')}</h3>
          <RequestList requests={visibleRequests} />
        </section>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">{t('appointments.history')}</h3>

        {past.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('appointments.nonePast')}</p>
        ) : (
          <ul className="space-y-3">
            {past.map((appointment) => (
              <li key={appointment.id}>
                <AppointmentCard appointment={appointment} past />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
