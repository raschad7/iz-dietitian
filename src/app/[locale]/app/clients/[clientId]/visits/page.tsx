import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { ClientVisitRecord } from '@/features/booking/components/client-visit-record';
import { listClientVisits } from '@/features/booking/queries';
import { getClient } from '@/features/clients/queries';
import { resolveLocale } from '@/i18n/params';
import { toIsoDate } from '@/lib/iso-date';
import { requireStaffClinic } from '@/lib/session';

type ClientVisitsPageProps = {
  params: Promise<{ locale: string; clientId: string }>;
};

export async function generateMetadata({ params }: ClientVisitsPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'clients' });
  return { title: `${t('tabs.visits')} · ${t('title')}` };
}

/**
 * The Visit History tab.
 *
 * **This used to be a calendar**, and used to be three routes — `/visits/day`,
 * `/visits/week` and `/visits/month`, each mounting the clinic-wide grid
 * filtered to one client. A month grid is the wrong shape for the question this
 * tab is asked; see the note on `ClientVisitRecord`. It is one address again,
 * because a record has no views.
 */
export default async function ClientVisitsPage({ params }: ClientVisitsPageProps) {
  const locale = await resolveLocale(params);
  const { clinicId } = await requireStaffClinic(locale);

  const { clientId } = await params;
  const client = await getClient(clinicId, clientId);
  if (!client) notFound();

  const visits = await listClientVisits(clinicId, client.id);
  // Read once here rather than inside the record, so the split between past and
  // upcoming is measured against the same day the rest of the page is.
  const today = toIsoDate(new Date());

  // `client` goes down as well as `visits`: the record's summary rail leads with
  // who this is, and the row has already been read here to prove it exists.
  return <ClientVisitRecord client={client} visits={visits} locale={locale} today={today} />;
}
