import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { ClientNutrition } from '@/features/clients/components/client-nutrition';
import { getClientIntake } from '@/features/clients/queries';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

type ClientNutritionPageProps = {
  params: Promise<{ locale: string; clientId: string }>;
};

/**
 * Same reasoning as the Info tab's `generateMetadata`: this runs outside the
 * layout's session guard, so it has no clinic to scope a lookup to, and the
 * client's name stays out of a browser history it might not belong in.
 */
export async function generateMetadata({ params }: ClientNutritionPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'clients' });

  return { title: t('tabs.nutrition') };
}

/**
 * A client's nutrition record — measurements, allergies, targets, the schedule
 * and what the portal shows them.
 *
 * Everything on this tab used to be split between a disclosure on the client
 * card and a form owned by the weekly planner, reachable only from inside the
 * board. It is filed under the person now, which is where a dietitian looks for
 * it.
 */
export default async function ClientNutritionPage({ params }: ClientNutritionPageProps) {
  const locale = await resolveLocale(params);
  const { clinicId } = await requireStaffClinic(locale);

  const { clientId } = await params;
  const intake = await getClientIntake(clinicId, clientId);

  if (!intake) {
    notFound();
  }

  return <ClientNutrition intake={intake} locale={locale} />;
}
