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
  return { title: `${t('nav.day')} · ${t('title')}` };
}

/** The Visit History tab, day view — this client's appointments only. */
export default async function ClientVisitsDayPage({ params, searchParams }: PageProps) {
  const locale = await resolveLocale(params);
  const { session, clinicId } = await requireStaffClinic(locale);

  const { clientId } = await params;
  const client = await getClient(clinicId, clientId);
  if (!client) notFound();

  const data = await loadClientCalendarPage(
    { clinicId, ownerName: session.user.name },
    clientId,
    'day',
    await searchParams,
  );

  return (
    <Calendar
      locale={locale}
      view="day"
      anchorDate={data.anchorDate}
      hours={data.hours}
      appointments={data.appointments}
      clients={data.clients}
      basePath={`/app/clients/${clientId}/visits`}
      allowNewClient={false}
      hideSearch
      // See the note in the week view: embedded, so there is no shell padding
      // of its own to bleed past.
      fullBleed={false}
    />
  );
}
