import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { getClientVisitSummary, listClientVisits } from '@/features/booking/queries';
import { ClientProfile } from '@/features/clients/components/client-profile';
import {
  PROFILE_TABS,
  type ProfileTab,
} from '@/features/clients/components/client-profile-tabs';
import { getPortalUsername } from '@/features/clients/portal-credentials';
import { getClient, getClientIntake } from '@/features/clients/queries';
import { suggestUsername } from '@/features/clients/transliterate';
import { listPlans } from '@/features/weekly-plans/queries';
import { getSettings } from '@/features/whatsapp/queries';
import { resolveLocale } from '@/i18n/params';
import { isMember } from '@/lib/enum';
import { toIsoDate } from '@/lib/iso-date';
import { requireStaffClinic } from '@/lib/session';

type ClientInfoPageProps = {
  params: Promise<{ locale: string; clientId: string }>;
  searchParams: Promise<{ tab?: string }>;
};

/**
 * Same reasoning as before: this runs outside the layout's session guard, so it
 * has no clinic to scope a lookup to, and the client's name stays out of a
 * browser history it might not belong in.
 */
export async function generateMetadata({ params }: ClientInfoPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'clients' });

  return { title: t('title') };
}

/**
 * The client's record: the identity panel, and four views of it.
 *
 * **This page absorbed four routes.** `/nutrition`, `/visits`, `/plans` and
 * `/portal` were tabs of their own and are now views here — the visit record
 * inside the Account view, the other three as views of their own. All four
 * routes still exist and redirect to `?tab=`, which is why the tab arrives as a
 * search param rather than as a path segment — see `ClientProfileTabs`.
 *
 * Everything is read here rather than inside the views: panels each fetching
 * their own data would be either sequential round trips or several different
 * readings of "today", and the split between past and upcoming has to be
 * measured against one day. It is one `Promise.all` and no view waits on
 * another.
 */
export default async function ClientInfoPage({ params, searchParams }: ClientInfoPageProps) {
  const locale = await resolveLocale(params);
  const { clinicId } = await requireStaffClinic(locale);

  const { clientId } = await params;
  const client = await getClient(clinicId, clientId);

  if (!client) {
    notFound();
  }

  const today = toIsoDate(new Date());

  const [visitSummary, visitEntries, plans, intake, whatsapp, portalUsername] =
    await Promise.all([
      getClientVisitSummary(clinicId, client.id, today),
      listClientVisits(clinicId, client.id),
      listPlans(clinicId, client.id),
      // The Nutrition view's whole subject, and the meal-slot denominator the
      // plans card counts a week against.
      getClientIntake(clinicId, client.id),
      // Only to tell the Security view whether issuing a sign-in will reach this
      // client over WhatsApp, or only over the desk.
      getSettings(clinicId),
      client.hasPortalAccess ? getPortalUsername(clinicId, client.id) : Promise.resolve(null),
    ]);

  // An unknown `?tab=` opens on the first view — Nutrition — rather than 404ing: the param is
  // a hint about which panel to show, not an address, and a stale link is not a
  // missing client.
  const requestedTab = (await searchParams).tab;
  const defaultTab: ProfileTab = isMember(PROFILE_TABS, requestedTab) ? requestedTab : 'nutrition';

  // `getClient` has already proved the row exists and belongs to this clinic,
  // and the intake read is that same lookup with a left join — so a null here
  // means the record was deleted between the two.
  if (!intake) {
    notFound();
  }

  return (
    <ClientProfile
      client={client}
      locale={locale}
      today={today}
      defaultTab={defaultTab}
      visits={{ summary: visitSummary, entries: visitEntries }}
      plans={plans}
      intake={intake}
      portal={{
        username: portalUsername,
        suggestedUsername: suggestUsername(client.fullName),
      }}
      canSendWhatsapp={whatsapp?.status === 'ready' && Boolean(client.phone)}
    />
  );
}
