import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { Calendar } from '@/features/booking/components/calendar';
import { loadClientCalendarPage } from '@/features/booking/page-data';
import { getClient } from '@/features/clients/queries';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

type PageProps = {
  params: Promise<{ locale: string; clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'booking' });
  return { title: `${t('nav.week')} · ${t('title')}` };
}

/** The Visit History tab, week view — this client's appointments only. */
export default async function ClientVisitsWeekPage({ params, searchParams }: PageProps) {
  const locale = await resolveLocale(params);
  const { session, clinicId } = await requireStaffClinic(locale);

  const { clientId } = await params;
  const client = await getClient(clinicId, clientId);
  if (!client) notFound();

  const data = await loadClientCalendarPage(
    { clinicId, ownerName: session.user.name },
    clientId,
    'week',
    await searchParams,
  );

  return (
    <Calendar
      locale={locale}
      view="week"
      anchorDate={data.anchorDate}
      hours={data.hours}
      appointments={data.appointments}
      clients={data.clients}
      basePath={`/app/clients/${clientId}/visits`}
      allowNewClient={false}
      hideSearch
      // Mounted inside the client record rather than on a page of its own, so
      // the shell padding the calendar page bleeds past is not this one's to
      // reclaim — it belongs to containers several levels up.
      fullBleed={false}
    />
  );
}
