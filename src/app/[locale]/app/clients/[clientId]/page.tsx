import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { getClientVisitSummary, listClientVisits } from '@/features/booking/queries';
import { ClientProfile } from '@/features/clients/components/client-profile';
import { PROFILE_TABS, type ProfileTab } from '@/features/clients/components/profile-tab';
import { getPortalUsername } from '@/features/clients/portal-credentials';
import { getClientWeekMeals, getClientWeekProgress } from '@/features/clients/progress';
import { getClient, getClientIntake } from '@/features/clients/queries';
import { clinicServicePrices, consultedClients, ledgerByClient } from '@/features/billing/queries';
import { suggestUsername } from '@/features/clients/transliterate';
import { currentSunday } from '@/features/weekly-plans/week';
import { listPlans } from '@/features/weekly-plans/queries';
import { getSettings } from '@/features/whatsapp/queries';
import { resolveLocale } from '@/i18n/params';
import { isMember } from '@/lib/enum';
import { toIsoDate } from '@/lib/iso-date';
import { requireStaffClinic } from '@/lib/session';

type ClientInfoPageProps = {
  params: Promise<{ locale: string; clientId: string }>;
  searchParams: Promise<{ tab?: string; week?: string }>;
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
 * The client's record: the identity panel, and the views of it.
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

  const [
    visitSummary,
    visitEntries,
    plans,
    intake,
    whatsapp,
    portalUsername,
    ledgers,
    prices,
    consulted,
  ] = await Promise.all([
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
      /*
        The Expenses view: this subscriber's ledger, what the clinic charges,
        and whether a consultation is already on the account — the free-first
        rule the charge card applies. Read here with everything else rather
        than inside the panel, so a record opens with one round of reads
        however many views it has.
      */
      ledgerByClient(clinicId, [client.id]),
      clinicServicePrices(clinicId),
      consultedClients(clinicId, [client.id]),
    ]);

  // An unknown `?tab=` opens on the first view — Nutrition — rather than 404ing: the param is
  // a hint about which panel to show, not an address, and a stale link is not a
  // missing client.
  const resolvedSearchParams = await searchParams;
  const requestedTab = resolvedSearchParams.tab;
  const defaultTab: ProfileTab = isMember(PROFILE_TABS, requestedTab) ? requestedTab : 'nutrition';

  // `getClient` has already proved the row exists and belongs to this clinic,
  // and the intake read is that same lookup with a left join — so a null here
  // means the record was deleted between the two.
  if (!intake) {
    notFound();
  }

  /*
    The Progress view only ever offers a week the dietitian has actually put
    meals in. An empty draft is a plan row (so it belongs on the Billing &
    Plans tab, which reads `plans` unfiltered) but has nothing for a client to
    have followed — showing it in the week picker would only lead to the
    "nothing recorded" empty state for a week that was never really an
    option, which is the exact confusion this filter avoids.
  */
  const progressWeeks = plans.filter((plan) => plan.mealCount > 0);

  /*
    The Progress view's own week, from `?week=` — same "hint, not an address"
    rule the tab param follows. `progressWeeks` is newest-first (see
    `listPlans`), so its head is the live week; a `?week=` naming a week with
    no meals in it falls back to it rather than opening on a week the picker
    does not even list, and a client with no meal-bearing week at all falls
    back to the clinic's current week so the empty state still names a real
    one.
  */
  const requestedWeek = resolvedSearchParams.week;
  const knownWeek = progressWeeks.some((plan) => plan.weekStartDate === requestedWeek);
  const selectedWeek = knownWeek
    ? (requestedWeek as string)
    : (progressWeeks[0]?.weekStartDate ?? currentSunday());

  /*
    The same "most current plan for this week" a plan can be a draft beside an
    already-published one, or an old draft left over after a regeneration, and
    `listPlans` orders newest `updatedAt` first — so the first match for
    `selectedWeek` is the same plan the week picker's deduped option list
    resolves to (see `ClientProgressPanel`). Undefined for a week with no plan
    at all, which `getClientWeekMeals` never gets to run for.
  */
  const selectedPlan = progressWeeks.find((plan) => plan.weekStartDate === selectedWeek);

  const [progress, mealsByDay] = await Promise.all([
    getClientWeekProgress(clinicId, client.id, selectedWeek, today),
    selectedPlan
      ? getClientWeekMeals(clinicId, client.id, selectedPlan.id)
      : Promise.resolve(new Map()),
  ]);

  return (
    <ClientProfile
      client={client}
      locale={locale}
      today={today}
      defaultTab={defaultTab}
      visits={{ summary: visitSummary, entries: visitEntries }}
      plans={plans}
      intake={intake}
      progress={progress}
      progressWeeks={progressWeeks}
      mealsByDay={mealsByDay}
      billing={{
        entries: ledgers.get(client.id) ?? [],
        prices,
        consulted: consulted.has(client.id),
      }}
      portal={{
        username: portalUsername,
        suggestedUsername: suggestUsername(client.fullName),
      }}
      canSendWhatsapp={whatsapp?.status === 'ready' && Boolean(client.phone)}
    />
  );
}
