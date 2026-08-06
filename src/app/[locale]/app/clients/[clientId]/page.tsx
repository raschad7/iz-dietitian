import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { toIsoDate } from '@/features/booking/date';
import { getClientVisitSummary } from '@/features/booking/queries';
import { ClientProfile } from '@/features/clients/components/client-profile';
import { getClient, getClientIntake } from '@/features/clients/queries';
import { listPlans } from '@/features/weekly-plans/queries';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

type ClientInfoPageProps = {
  params: Promise<{ locale: string; clientId: string }>;
};

/**
 * Same reasoning as the old page's `generateMetadata`: this runs outside the
 * layout's session guard, so it has no clinic to scope a lookup to, and the
 * client's name stays out of a browser history it might not belong in.
 */
export async function generateMetadata({ params }: ClientInfoPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'clients' });

  return { title: t('title') };
}

/**
 * Contact details, health flags, and what has happened lately.
 *
 * **The WhatsApp composer is gone from this tab.** It rendered here whenever the
 * clinic had a linked session, which made a client's identity screen double as a
 * messaging screen — and put a thread of messages under a card of demographics
 * with nothing connecting the two.
 */
export default async function ClientInfoPage({ params }: ClientInfoPageProps) {
  const locale = await resolveLocale(params);
  const { clinicId } = await requireStaffClinic(locale);

  const { clientId } = await params;
  const client = await getClient(clinicId, clientId);

  if (!client) {
    notFound();
  }

  const today = toIsoDate(new Date());

  const [intake, visits, plans] = await Promise.all([
    getClientIntake(clinicId, client.id),
    getClientVisitSummary(clinicId, client.id, today),
    listPlans(clinicId, client.id),
  ]);

  if (!intake) {
    notFound();
  }

  // Newest week first is already the read's order, so the head of the list *is*
  // the current plan — see `listPlans`.
  const [currentPlan] = plans;

  return (
    <ClientProfile
      client={client}
      intake={intake}
      visits={visits}
      currentPlan={currentPlan ?? null}
      locale={locale}
    />
  );
}
