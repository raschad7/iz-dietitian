import { redirect } from 'next/navigation';

import { resolveLocale } from '@/i18n/params';

type ClientVisitsPageProps = {
  params: Promise<{ locale: string; clientId: string }>;
};

/**
 * The old Visit History tab.
 *
 * The visit record is part of the **Account** view now, under what is booked
 * next and the live plan — which is the pair of facts it is read against. It was
 * briefly a view of its own on the same bar, and its own summary rail went in
 * that first move, because the identity panel beside every view had made it a
 * second portrait of the same patient.
 *
 * The route stays as a redirect: it was an address in the record's tab bar for
 * the life of the feature, and anything already pointing at it should land on
 * the record rather than on a 404.
 *
 * `redirect` needs the locale segment spelled out — it takes a real path, not
 * one of the localised router's hrefs.
 */
export default async function ClientVisitsPage({ params }: ClientVisitsPageProps) {
  const locale = await resolveLocale(params);
  const { clientId } = await params;

  redirect(`/${locale}/app/clients/${clientId}?tab=account`);
}
