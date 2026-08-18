import { redirect } from 'next/navigation';

import { resolveLocale } from '@/i18n/params';

type ClientPlansPageProps = {
  params: Promise<{ locale: string; clientId: string }>;
};

/**
 * The old Meal Plans tab.
 *
 * It is the profile's **Plans** view now — the same
 * `ClientPlansCard`, rendered once. The route is kept as a redirect for the
 * reason the portal one is: it was an address in the record's tab bar, and
 * anything already pointing at it should land on the card rather than on a 404.
 *
 * Not to be confused with `/app/weekly-plans/[clientId]`, which is the board a
 * plan is *written* on and is still a screen of its own — this was only ever the
 * list of weeks.
 */
export default async function ClientPlansPage({ params }: ClientPlansPageProps) {
  const locale = await resolveLocale(params);
  const { clientId } = await params;

  redirect(`/${locale}/app/clients/${clientId}?tab=billing`);
}
