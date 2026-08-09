import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { getClient, getClientIntake } from '@/features/clients/queries';
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

  // The intake carries this client's own meal schedule, which is the
  // denominator for "how full is this week" — a client on three meals a day has
  // a complete week at 21 slots, not at the 35 a five-slot client needs.
  const [plans, intake] = await Promise.all([
    listPlans(clinicId, client.id),
    getClientIntake(clinicId, client.id),
  ]);

  return (
    <ClientPlansCard
      clientId={client.id}
      plans={plans}
      slotsPerDay={intake?.mealSchedule.length ?? 0}
      locale={locale}
    />
  );
}
