import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { DAYS_PER_WEEK } from '@/features/portal/check-ins';
import { HomeGlow } from '@/features/portal/components/home-glow';
import { HomeToday, type HomeTodayMeal } from '@/features/portal/components/home-today';
import { NextAppointmentPreview } from '@/features/portal/components/next-appointment-preview';
import { WeekAdherenceStrip } from '@/features/portal/components/week-adherence-strip';
import { loadDashboard } from '@/features/portal/page-data';
import { requirePortalClient } from '@/features/portal/session';
import { PlanDayCompletionProvider } from '@/features/weekly-plans/components/plan-day-completion';
import { roundForDisplay } from '@/features/weekly-plans/nutrition';
import { resolveLocale } from '@/i18n/params';

type PortalPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: PortalPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'portal' });
  return { title: t('title') };
}

/**
 * The portal's landing page: how the week is going, and two ways onward.
 *
 * **Three sections, in one order.** The week the client has had, the plan
 * they are on, and when they are next seen. The first is about them; the
 * last two are about the clinic, and that is the order someone opening the
 * app on their phone reads in.
 *
 * The week's own average-adherence card is gone from here too — it repeated
 * the same fraction `WeekAdherenceSummary` already owns on the progress tab,
 * once `HomeToday`'s ring started drawing today's adherence right above it.
 *
 * **What is deliberately not here.** The five-metric summary — energy, sleep,
 * appetite, mood, water — moved off this screen: it repeated in five rows what
 * the day scores in the strip already average into one number, and it was the
 * tallest thing on the page. The full appointment card went the same way, down
 * to its preview row, because it was a verbatim copy of the screen it links to.
 * Nothing was deleted from the product; each is one tap away on the page that
 * owns it.
 *
 * The pending-request note is gone too — the bell's dot and the drawer's count
 * both carry it now, and a third copy on the page said nothing new.
 *
 * **Today's meals moved onto this screen, and the old plan-preview row left
 * with them.** `HomeToday`, directly under the week strip, draws today's own
 * adherence ring and today's actual meals, tickable right here — see that
 * component for why it reuses the meal-plan screen's own completion state
 * rather than a second copy of it. A one-line "X meals · Y kcal" preview card
 * pointing at the same day would now be repeating what the hero already shows
 * in full, which is the same duplication the module doc above already ruled
 * out once for the meal list and the appointment card.
 *
 * **The week strip comes first, ahead of the ring.** It is the client's own
 * day picker for the week — the thing they orient by before reading how
 * today in particular is going — and it sits directly under the header,
 * exactly where it read before today's ring existed.
 */
export default async function PortalPage({ params }: PortalPageProps) {
  const locale = await resolveLocale(params);

  const context = await requirePortalClient(locale);
  const { next, planTitle, today, todayCompletedMealIds, week } = await loadDashboard(context);

  // Only the shape `HomeToday` draws crosses into its client bundle — the
  // dish, options and rationale on each `BoardMeal` stay server-side, same
  // reasoning `portal-plan.tsx` documents for the meal-plan screen itself.
  const todayMeals: HomeTodayMeal[] = (today?.meals ?? []).map((meal) => ({
    id: meal.id,
    slotKey: meal.slotKey,
    label: meal.label,
    timeOfDay: meal.timeOfDay,
    kcal: roundForDisplay('kcal', meal.totals.kcal.value),
  }));

  return (
    <div className="space-y-4">
      <HomeGlow />

      {/*
        One provider over both the strip and today's meals, not one each —
        see `plan-day-completion.tsx`. Today's cell in the strip below needs
        the same live completed/total counts `HomeToday`'s ring reads, so
        that ticking the last meal moves both the instant it happens rather
        than only the ring, with the strip waiting on `router.refresh()`.
      */}
      <PlanDayCompletionProvider
        dayOfWeek={today?.dayOfWeek ?? 0}
        mealIds={todayMeals.map((meal) => meal.id)}
        initialCompletedMealIds={todayCompletedMealIds}
      >
        <WeekAdherenceStrip days={week.days} showTitle={false} />

        <HomeToday meals={todayMeals} planTitle={planTitle} daysCompleted={week.fullyCompletedCount} daysTotal={DAYS_PER_WEEK} />
      </PlanDayCompletionProvider>

      <NextAppointmentPreview appointment={next} />
    </div>
  );
}
