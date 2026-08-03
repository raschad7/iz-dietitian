import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { getClient } from '@/features/clients/queries';
import { ClientPlansCard } from '@/features/weekly-plans/components/client-plans-card';
import { listPlans } from '@/features/weekly-plans/queries';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

type ClientPlansPageProps = {
  params: Promise<{ locale: string; clientId: string }>;
};

export async function generateMetadata({ params }: ClientPlansPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const [tClients, tPlans] = await Promise.all([
    getTranslations({ locale, namespace: 'clients' }),
    getTranslations({ locale, namespace: 'weeklyPlans' }),
  ]);

  return { title: `${tPlans('title')} · ${tClients('title')}` };
}

/** The Meal Plans tab: the current week's plan, and everything before it. */
export default async function ClientPlansPage({ params }: ClientPlansPageProps) {
  const locale = await resolveLocale(params);
  const { clinicId } = await requireStaffClinic(locale);

  const { clientId } = await params;
  const client = await getClient(clinicId, clientId);
  if (!client) notFound();

  const plans = await listPlans(clinicId, client.id);

  return <ClientPlansCard clientId={client.id} plans={plans} />;
}
